import assert from "node:assert/strict";
import test from "node:test";
import { findMatches, scoreMatch } from "../lib/matching.ts";

const lost = {
  id: "lost-1", reportType: "lost", status: "open",
  description: "Black Nike backpack with striped strap",
  category: "backpack", color: "black", brand: "Nike",
  features: ["striped strap"],
};
const found = { ...lost, id: "found-1", reportType: "found" };

test("identical items score 100 with reasons", () => {
  const match = scoreMatch(lost, found);
  assert.equal(match.score, 100);
  assert.equal(match.reasons.length, 5);
  assert.equal(match.item, found);
});

test("different explicit categories are rejected", () => {
  assert.equal(scoreMatch(lost, { ...found, category: "phone" }).score, 0);
});

test("missing attributes never inflate a single attribute to 100", () => {
  const sparse = { id: "a", reportType: "lost", status: "open", description: "" };
  const other = { ...sparse, id: "b", reportType: "found" };
  assert.equal(scoreMatch(sparse, other).score, 0);
  for (const [field, value, expected] of [
    ["category", "backpack", 35], ["color", "black", 20],
    ["brand", "Nike", 20], ["description", "backpack", 10],
    ["features", ["striped strap"], 15],
  ]) {
    assert.equal(scoreMatch({ ...sparse, [field]: value }, { ...other, [field]: value }).score, expected);
  }
  assert.equal(scoreMatch(lost, { ...other, category: "backpack" }).score, 35);
});

test("conflicting colors and brands lose their respective weights", () => {
  assert.equal(scoreMatch(lost, { ...found, color: "white" }).score, 80);
  assert.equal(scoreMatch(lost, { ...found, brand: "Adidas" }).score, 80);
  assert.equal(scoreMatch(lost, { ...found, color: "white", brand: "Adidas" }).score, 60);
});

test("completely unrelated items have no match even at the same location", () => {
  const source = { id: "a", reportType: "lost", status: "open", description: "striped umbrella", location: "library" };
  const candidate = { id: "b", reportType: "found", status: "open", description: "silver laptop", location: "library" };
  assert.equal(scoreMatch(source, candidate).score, 0);
  assert.deepEqual(findMatches(source, [candidate], { minScore: 0 }), []);
});

test("campus location overlap adds a bounded bonus and disagreement is allowed", () => {
  const source = { ...lost, location: "Main Library entrance" };
  const candidate = { ...found, brand: undefined, location: "Main Library lobby" };
  assert.equal(scoreMatch(source, candidate).score, 85);
  assert.equal(scoreMatch(source, { ...candidate, location: "Science Hall" }).score, 80);
  assert.equal(scoreMatch(source, { ...candidate, location: "" }).score, 80);
  assert.equal(scoreMatch(source, { ...found, location: source.location }).score, 100);
});

test("resolved, same-type and self reports are excluded", () => {
  for (const candidate of [
    { ...found, status: "resolved" },
    { ...found, reportType: "lost" },
    { ...found, id: lost.id },
  ]) {
    assert.equal(scoreMatch(lost, candidate).score, 0);
    assert.deepEqual(findMatches(lost, [candidate]), []);
  }
  assert.deepEqual(findMatches({ ...lost, status: "resolved" }, [found]), []);
});

test("ranking, threshold, limit and normalization remain deterministic", () => {
  const weaker = { ...found, id: "weak", color: "white" };
  assert.deepEqual(findMatches(lost, [weaker, found]).map(m => m.item.id), [found.id, weaker.id]);
  assert.equal(findMatches(lost, [weaker, found], { minScore: 90 }).length, 1);
  assert.equal(findMatches(lost, [found], { limit: 0 }).length, 0);
  assert.equal(scoreMatch(lost, { ...found, brand: " NIKE! " }).score, 100);
  assert.throws(() => findMatches(lost, [], { minScore: 101 }), RangeError);
  assert.throws(() => findMatches(lost, [], { limit: -1 }), RangeError);
});


test("exact item names rank well even when Gemini attributes are absent", () => {
  const source = { id: "lost-scooter", reportType: "lost", status: "open",
    title: "Lost SpongeBob scooter", description: "SpongeBob scooter",
    category: "Bikes" };
  const candidate = { id: "found-scooter", reportType: "found", status: "open",
    title: "Found SpongeBob scooter", description: "SpongeBob scooter",
    category: "Bikes" };
  const result = scoreMatch(source, candidate);
  assert.equal(result.score, 75); // 35 category + 10 description + 30 title
  assert.ok(result.reasons.includes("Matching item name"));
});

test("time evidence considers item events instead of report creation", () => {
  const source = { ...lost, title: "Nike backpack", itemDate: "2026-11-14T15:00:00Z" };
  const candidate = { ...found, title: "Nike backpack", itemDate: "2026-11-14T20:00:00Z" };
  const baseline = scoreMatch(source, { ...candidate, itemDate: null });
  const close = scoreMatch(source, candidate);
  assert.equal(close.score, Math.min(100, baseline.score + 12));
  assert.ok(close.reasons.includes("Lost and found times are close"));

  const contradictory = scoreMatch(source, { ...candidate, itemDate: "2026-11-10T12:00:00Z" });
  assert.ok(contradictory.score < baseline.score);
  assert.ok(contradictory.reasons.includes("Found time predates reported loss"));
  assert.equal(scoreMatch({ ...source, itemDate: null }, candidate).score, baseline.score);
});

test("a close time is not evidence of identical items on its own", () => {
  const source = { id: "a", reportType: "lost", status: "open", description: "",
    itemDate: "2026-11-14T10:00:00Z" };
  const candidate = { id: "b", reportType: "found", status: "open", description: "",
    itemDate: "2026-11-14T11:00:00Z" };
  assert.equal(scoreMatch(source, candidate).score, 0);
});
