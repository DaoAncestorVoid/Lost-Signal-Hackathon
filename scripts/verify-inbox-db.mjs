// Optional local PostgreSQL regression suite. Supply PGLITE_MODULE as a file URL
// for a temporary @electric-sql/pglite installation, or install it locally.
// Never connects to hosted Supabase. Auth functions simulate verified JWT claims.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const finder = id(1), claimant = id(2), outsider = id(3);
const report1 = id(10), report2 = id(11);
async function migration(name) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
}
async function as(user, guest = false) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, is_anonymous: guest })]);
  await db.exec("set role authenticated");
}
const rows = async sql => (await db.query(sql)).rows;
const summaries = () => rows("select * from public.conversation_summaries()");
const unread = async () => (await summaries()).reduce((n, row) => n + Number(row.unread_count), 0);
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select current_setting('request.jwt.claims',true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create schema storage; create table storage.objects(id uuid,bucket_id text);
    alter table storage.objects enable row level security;
  `);
  for (const name of ["20261114053549_initial_schema", "20261114130000_claims_workflow",
    "20261114160000_guest_write_permissions", "20261115041000_match_notifications",
    "20261115053000_claim_messages", "20261115060000_confirm_handoff",
    "20261115070000_claim_message_notifications", "20261115120000_conversation_reads_and_claim_events"]) await migration(name);
  await db.query("insert into auth.users values ($1),($2),($3)", [finder, claimant, outsider]);
  await db.query(`insert into public.reports(id,user_id,report_type,title,description,location)
    values ($1,$3,'found','UCard','Test card','Campus'),($2,$3,'found','Keys','Test keys','Campus')`, [report1, report2, finder]);
  await as(claimant);
  const c1 = (await db.query("select * from public.submit_claim($1,'private proof')", [report1])).rows[0].id;
  const c2 = (await db.query("select * from public.submit_claim($1,'private proof')", [report2])).rows[0].id;
  await assert.rejects(db.query("select * from public.submit_claim($1,'retry')", [report1]));
  await as(finder);
  assert.equal((await rows("select * from activity_notifications where kind='claim'")).length, 2);
  await db.query("insert into messages(claim_id,sender_id,body) values($1,$2,'self')", [c1, finder]);
  assert.equal(await unread(), 0, "own messages never count");
  await as(claimant);
  await db.query("insert into messages(claim_id,sender_id,body) values($1,$3,'one'),($1,$3,'two'),($2,$3,'three')", [c1,c2,claimant]);
  await as(finder);
  assert.equal(await unread(), 3);
  const before = await summaries();
  assert.deepEqual(before.map(r => Number(r.unread_count)).sort(), [1,2]);
  const latest = before.find(r => r.claim_id === c1).latest_message_id;
  // A newer message arriving after the snapshot must survive acknowledging it.
  await as(claimant);
  await db.query("insert into messages(claim_id,sender_id,body) values($1,$2,'arrived later')", [c1,claimant]);
  await as(finder);
  await db.query("select public.mark_conversation_read($1,$2)", [c1,latest]);
  assert.equal(await unread(), 2, "only loaded cursor is acknowledged");
  assert.equal((await summaries())[0].claim_id, c1, "latest message orders conversations");
  const newLatest = (await summaries()).find(r => r.claim_id === c1).latest_message_id;
  await db.query("select public.mark_conversation_read($1,$2)", [c1,newLatest]);
  await db.query("select public.mark_conversation_read($1,$2)", [c1,latest]);
  assert.equal(await unread(), 1, "older device cursor cannot regress read state or clear another thread");
  await as(claimant); await as(finder);
  assert.equal(await unread(), 1, "read state persists across sessions");
  await as(outsider);
  assert.equal((await summaries()).length, 0);
  assert.equal((await rows("select * from messages")).length, 0);
  assert.equal((await rows("select * from activity_notifications")).length, 0);
  await assert.rejects(db.query("select public.mark_conversation_read($1,$2)", [c1,newLatest]));
  await assert.rejects(db.query("insert into conversation_reads values($1,$2,now())", [c1,finder]));
  await assert.rejects(db.query("insert into activity_notifications(recipient_id,kind,report_id,claim_id) values($1,'approved',$2,$3)", [outsider,report1,c1]));
  await as(finder, true);
  assert.equal((await summaries()).length, 0, "guest cannot access summaries");
  await as(finder);
  await db.query("select * from decide_claim($1,'approved')", [c1]);
  await assert.rejects(db.query("select * from decide_claim($1,'approved')", [c1]));
  await db.query("select * from decide_claim($1,'rejected')", [c2]);
  await as(claimant);
  assert.equal((await rows("select * from activity_notifications where kind='approved'")).length, 1);
  assert.equal((await rows("select * from activity_notifications where kind='rejected'")).length, 1);
  await db.query("select * from confirm_claim_handoff($1)", [c1]);
  await assert.rejects(db.query("select * from confirm_claim_handoff($1)", [c1]));
  await as(finder);
  assert.equal((await rows("select * from activity_notifications where kind='handoff'")).length, 1);
  console.log("PASS: migration, unread totals, incoming-only counts, per-thread cursors, race boundary, persistence, isolation, guest denial, claim/decision/handoff events and retry deduplication");
} finally { await db.close(); }
