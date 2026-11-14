import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisLimiter, readLimitedBody } from "../lib/ai-protection.ts";
import { ItemAttributesSchema } from "../lib/gemini.ts";
import { MAX_IMAGE_BYTES, validateImage } from "../lib/reports/images.ts";

test("shared limiter enforces user quota, isolation, global cap and reset", () => {
  const limiter = new AnalysisLimiter();
  for (let i = 0; i < 10; i++) assert.equal(limiter.take("alice", 1000), 0);
  assert.equal(limiter.take("alice", 1000), 60);
  assert.equal(limiter.take("bob", 1000), 0);
  for (let i = 0; i < 49; i++) assert.equal(limiter.take(`user-${i}`, 1000), 0);
  assert.equal(limiter.take("new-user", 1000), 60);
  assert.equal(limiter.take("alice", 61000), 0);
});

test("body limits use actual bytes and check declared size", async () => {
  const request = body => new Request("http://localhost", { method: "POST", body });
  assert.equal((await readLimitedBody(request("1234"), 4)).length, 4);
  await assert.rejects(readLimitedBody(request("12345"), 4), { status: 413 });
  await assert.rejects(readLimitedBody(new Request("http://localhost", {
    method: "POST", body: "a", headers: { "Content-Length": "100" },
  }), 4), { status: 413 });
  await assert.rejects(readLimitedBody(request(null), 4), { status: 400 });
});

test("shared output schema validates attributes and rejects malformed output", () => {
  const valid = { category: "Electronics", color: "Black", brand: null, features: [] };
  assert.deepEqual(ItemAttributesSchema.parse(valid), valid);
  for (const invalid of ["some prose", {}, { ...valid, brand: 12 },
    { ...valid, category: "" }, { ...valid, features: Array(21).fill("feature") }]) {
    assert.equal(ItemAttributesSchema.safeParse(invalid).success, false);
  }
});

test("image validator matches Supabase's 5 MiB bound and verifies signatures", async () => {
  const bytes = new Uint8Array(MAX_IMAGE_BYTES);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const valid = await validateImage(new File([bytes], "image.png", { type: "image/png" }));
  assert.equal("error" in valid, false);
  for (const file of [
    new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }),
    new File(["fake"], "fake.png", { type: "image/png" }),
    new File([], "empty.png", { type: "image/png" }),
    new File([bytes], "wrong.gif", { type: "image/gif" }),
  ]) assert.equal("error" in await validateImage(file), true);
});
