import assert from "node:assert/strict";
import test from "node:test";
import { KARMA_PER_APPROVED_CLAIM, karmaFromApprovedClaims } from "../lib/karma.ts";

test("karma starts at zero with locked badges", () => {
  const result = karmaFromApprovedClaims(0);
  assert.equal(result.points, 0);
  assert.equal(result.approvedClaims, 0);
  assert.deepEqual(result.badges.map(b => b.unlocked), [false, false, false]);
  assert.equal(result.nextBadge.remaining, 1);
});

test("approved claims unlock badges exactly at milestones", () => {
  assert.equal(karmaFromApprovedClaims(1).points, KARMA_PER_APPROVED_CLAIM);
  assert.deepEqual(karmaFromApprovedClaims(1).badges.map(b => b.unlocked), [true, false, false]);
  assert.equal(karmaFromApprovedClaims(4).nextBadge.remaining, 1);
  assert.deepEqual(karmaFromApprovedClaims(5).badges.map(b => b.unlocked), [true, true, false]);
  assert.deepEqual(karmaFromApprovedClaims(10).badges.map(b => b.unlocked), [true, true, true]);
  assert.equal(karmaFromApprovedClaims(10).nextBadge, null);
});

test("invalid counts cannot generate arbitrary Karma", () => {
  for (const value of [-1, NaN, Infinity, 1.1, "10", null]) {
    assert.throws(() => karmaFromApprovedClaims(value), /Invalid approved-claim count/);
  }
});
