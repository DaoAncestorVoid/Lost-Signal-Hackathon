import test from "node:test";
import assert from "node:assert/strict";
import { canMessageOnClaim, normalizeMessageBody } from "../lib/messages.ts";

const report = { user_id: "finder", report_type: "found" };
const claim = { claimant_id: "owner", report_id: "report-1", status: "pending" };

test("only claimant and finder may participate", () => {
  assert.equal(canMessageOnClaim(claim, report, "owner"), true);
  assert.equal(canMessageOnClaim(claim, report, "finder"), true);
  assert.equal(canMessageOnClaim(claim, report, "stranger"), false);
});

test("resolved approval remains open for handoff but rejection closes chat", () => {
  assert.equal(canMessageOnClaim({ ...claim, status: "approved" }, report, "owner"), true);
  assert.equal(canMessageOnClaim({ ...claim, status: "rejected" }, report, "owner"), false);
  assert.equal(canMessageOnClaim(claim, { ...report, report_type: "lost" }, "owner"), false);
  assert.equal(canMessageOnClaim(claim, undefined, "owner"), false);
  assert.equal(canMessageOnClaim({ ...claim, claimant_id: "finder" }, report, "finder"), false);
});

test("message text is trimmed and bounded", () => {
  assert.equal(normalizeMessageBody(" hi there "), "hi there");
  assert.equal(normalizeMessageBody("    "), null);
  assert.equal(normalizeMessageBody("x".repeat(2000)), "x".repeat(2000));
  assert.equal(normalizeMessageBody("x".repeat(2001)), null);
});
