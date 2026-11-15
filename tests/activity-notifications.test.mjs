import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { LostSignalApi } from "../lib/frontend-api.ts";

const id = n => `${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;

test("activity notification API returns typed claim and message events", async () => {
  const claim = { id: id(1), kind: "claim", claim_id: id(3), report_id: id(4),
    report_title: "Lost UCard", created_at: new Date().toISOString(), read_at: null };
  const message = { ...claim, id: id(2), kind: "message" };
  const calls = [];
  const api = new LostSignalApi(async (url, init) => {
    calls.push([url, init.method]);
    if (url === "/api/activity-notifications") return Response.json({ notifications: [claim, message] });
    return Response.json({ id: id(2) });
  });
  const notifications = await api.activityNotifications();
  assert.deepEqual(notifications.map(row => row.kind), ["claim", "message"]);
  await api.markActivityNotificationRead(message.id);
  assert.deepEqual(calls, [
    ["/api/activity-notifications", undefined],
    [`/api/activity-notifications/${message.id}`, "PATCH"],
  ]);
});

test("activity notification API rejects invalid payloads and unauthorized errors", async () => {
  await assert.rejects(
    new LostSignalApi(async () => Response.json({ notifications: [{ id: "invalid" }] })).activityNotifications(),
    { status: 502 },
  );
  await assert.rejects(
    new LostSignalApi(async () => Response.json({ error: "Notification not found" }, { status: 404 })).markActivityNotificationRead(id(4)),
    { status: 404 },
  );
});

test("activity notifications are inserted by database triggers and readable only by recipient", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261115070000_claim_message_notifications.sql", import.meta.url), "utf8");
  assert.match(sql, /after insert on public\.claims/);
  assert.match(sql, /after insert on public\.messages/);
  assert.match(sql, /v_recipient := v_finder/);
  assert.match(sql, /v_recipient := v_claimant/);
  assert.match(sql, /v_recipient <> new\.sender_id/);
  assert.match(sql, /recipient_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /is_anonymous/);
  assert.match(sql, /revoke all on public\.activity_notifications from public, anon, authenticated/);
  assert.match(sql, /grant update \(read_at\)/);
  assert.doesNotMatch(sql, /grant insert .*activity_notifications to authenticated/);
});
