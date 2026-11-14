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
