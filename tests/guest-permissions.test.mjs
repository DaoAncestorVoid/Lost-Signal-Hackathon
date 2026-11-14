import assert from "node:assert/strict";
import test from "node:test";
import { canWriteAsPermanentUser, permanentAccountRequired } from "../lib/guest-permissions.ts";

test("guest sessions cannot perform permanent-account writes", () => {
  assert.equal(canWriteAsPermanentUser({ is_anonymous: true }), false);
  assert.equal(canWriteAsPermanentUser({}), false);
  assert.equal(canWriteAsPermanentUser(null), false);
});
test("verified permanent accounts can perform permanent-account writes", () => {
  assert.equal(canWriteAsPermanentUser({ is_anonymous: false }), true);
});
test("guest rejection returns a 403 without exposing data", async () => {
  const response = permanentAccountRequired();
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match((await response.json()).error, /permanent account/);
});

test("guest AI limiter allows two requests per minute, registered users ten", async () => {
  const { AnalysisLimiter } = await import("../lib/ai-protection.ts");
  const limiter = new AnalysisLimiter();
  assert.equal(limiter.take("guest", 1000, 2), 0);
  assert.equal(limiter.take("guest", 1001, 2), 0);
  assert.ok(limiter.take("guest", 1002, 2) > 0);
  for (let i = 0; i < 10; i++) assert.equal(limiter.take("registered", 1000 + i, 10), 0);
  assert.ok(limiter.take("registered", 1011, 10) > 0);
});
