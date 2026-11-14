import assert from "node:assert/strict";
import { test } from "node:test";
import { isUuid, validateDecision, validateNewClaim } from "./validation.ts";

const reportId = "11111111-1111-4111-8111-111111111111";

test("validates and trims ownership evidence", () => {
  assert.equal(isUuid(reportId), true);
  assert.deepEqual(validateNewClaim({ report_id: reportId, proof: "  Blue strap  " }), {
    data: { report_id: reportId, proof: "Blue strap" },
  });
});

test("rejects forged identities, invalid reports, and empty or long proof", () => {
  for (const body of [
    { report_id: reportId, proof: "Evidence", claimant_id: reportId },
    { report_id: "not-a-uuid", proof: "Evidence" },
    { report_id: reportId, proof: "   " },
    { report_id: reportId, proof: "x".repeat(2001) },
  ]) {
    assert.ok("error" in validateNewClaim(body));
  }
});

test("only accepts a single approval or rejection field", () => {
  assert.deepEqual(validateDecision({ status: "approved" }), { status: "approved" });
  assert.deepEqual(validateDecision({ status: "rejected" }), { status: "rejected" });
  for (const body of [
    { status: "pending" },
    { status: "approved", claimant_id: reportId },
    { status: "approved", report_id: reportId },
  ]) {
    assert.ok("error" in validateDecision(body));
  }
});
