import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./gemini" || specifier === "./matching") {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { matchReports, reportToItem } = await import("../lib/report-matches.ts");

const lost = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  report_type: "lost", status: "open", title: "Lost backpack",
  description: "Black backpack with striped strap", category: "other",
  location: "Main Library entrance", image_path: null,
  ai_description: null, ai_attributes: {},
};
const found = {
  ...lost,
  id: "22222222-2222-4222-8222-222222222222",
  user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  report_type: "found", title: "Found bag", description: "Bag near the library",
  image_path: `${"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}/${"22222222-2222-4222-8222-222222222222"}/33333333-3333-4333-8333-333333333333.png`,
};
const attributes = { category: "backpack", color: "black", brand: null, features: ["striped strap"] };

test("maps database fields without treating other or Unknown as matching evidence", () => {
  const item = reportToItem({ ...lost, ai_attributes: { ...attributes, color: "Unknown" } });
  assert.equal(item.reportType, "lost");
  assert.equal(item.status, "open");
  assert.equal(item.category, "backpack");
  assert.equal(item.color, undefined);
  assert.equal(item.brand, undefined);
  assert.match(item.description, /Lost backpack/);
  assert.equal(reportToItem({ ...lost, status: "matched" }).status, "resolved");
});

test("integrates a text-only lost report and private found photo with the existing matcher", async () => {
  const calls = [];
  const result = await matchReports(lost, [found], {
    geminiAvailable: true,
    loadImage: async (report) => { calls.push(`read:${report.id}`); return { base64: "image-bytes", mimeType: "image/png" }; },
    analyzeText: async () => { calls.push("text"); return attributes; },
    analyzeImage: async () => { calls.push("image"); return attributes; },
  });
  assert.deepEqual(calls, ["text", `read:${found.id}`, "image"]);
  assert.equal(result.matches[0]?.item.id, found.id);
  assert.ok(result.matches[0].score >= 60);
  assert.ok(result.matches[0].reasons.some((reason) => reason.includes("category")));
  assert.deepEqual([result.analysis.attempted, result.analysis.succeeded], [2, 2]);
  assert.equal(result.analysis.state, "completed");
});

test("missing Gemini credentials return only real report evidence", async () => {
  const result = await matchReports({ ...lost, category: "backpack" }, [{ ...found, category: "backpack" }], {
    geminiAvailable: false,
    loadImage: async () => { throw new Error("must not run"); },
    analyzeText: async () => { throw new Error("must not run"); },
    analyzeImage: async () => { throw new Error("must not run"); },
  });
  assert.equal(result.matches[0]?.item.id, found.id);
  assert.equal(result.analysis.state, "unavailable");
  assert.equal(result.analysis.attempted, 0);
});

test("quota failures stop further Gemini calls without invented attributes", async () => {
  let calls = 0;
  const result = await matchReports({ ...lost, category: "backpack" }, [{ ...found, category: "backpack" }], {
    geminiAvailable: true,
    loadImage: async () => { throw new Error("must not run"); },
    analyzeText: async () => { calls++; throw Object.assign(new Error("quota"), { status: 429 }); },
    analyzeImage: async () => { throw new Error("must not run"); },
  });
  assert.equal(result.analysis.state, "partial");
  assert.deepEqual(result.analysis.issues, ["quota"]);
  assert.equal(result.analysis.succeeded, 0);
  assert.equal(calls, 1);
  assert.equal(result.matches[0]?.score, 45);
});

test("missing private images fall back to report text", async () => {
  const result = await matchReports(lost, [found], {
    geminiAvailable: true,
    loadImage: async () => null,
    analyzeText: async () => attributes,
    analyzeImage: async () => { throw new Error("must not run"); },
  });
  assert.equal(result.analysis.state, "partial");
  assert.deepEqual(result.analysis.issues, ["missing_image"]);
  assert.equal(result.analysis.succeeded, 2);
  assert.equal(result.matches[0]?.item.id, found.id);
});

test("empty candidate results make no Gemini calls", async () => {
  const result = await matchReports(lost, [], {
    geminiAvailable: true,
    loadImage: async () => { throw new Error("must not run"); },
    analyzeText: async () => { throw new Error("must not run"); },
    analyzeImage: async () => { throw new Error("must not run"); },
  });
  assert.deepEqual(result.matches, []);
  assert.equal(result.analysis.state, "not_needed");
  assert.equal(result.analysis.attempted, 0);
});

test("analysis is capped at four reports even with many candidates", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    ...found,
    id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    image_path: null,
  }));
  let calls = 0;
  const result = await matchReports(lost, candidates, {
    geminiAvailable: true,
    loadImage: async () => { throw new Error("must not run"); },
    analyzeText: async () => { calls++; return attributes; },
    analyzeImage: async () => { throw new Error("must not run"); },
  });
  assert.equal(calls, 4);
  assert.equal(result.analysis.attempted, 4);
});


test("saved-report matching uses explicit item dates and item names", () => {
  const row = { ...lost, item_date: "2026-11-14T10:30:00Z", title: "Black Sony headphones" };
  const item = reportToItem(row);
  assert.equal(item.itemDate, row.item_date);
  assert.equal(item.title, row.title);
});

test("Gemini enriches sparse exact-title matches instead of silently skipping", async () => {
  const source = { ...lost, category: "Bags", title: "SpongeBob scooter",
    description: "SpongeBob scooter" };
  const candidate = { ...found, category: "Bags", title: "SpongeBob scooter",
    description: "SpongeBob scooter", image_path: null };
  let calls = 0;
  const result = await matchReports(source, [candidate], {
    geminiAvailable: true,
    loadImage: async () => null,
    analyzeText: async () => {
      calls++;
      return { category: "Bags", color: "Yellow", brand: null, features: ["SpongeBob"] };
    },
    analyzeImage: async () => { throw new Error("unexpected image"); },
  });
  assert.equal(calls, 2);
  assert.equal(result.analysis.state, "completed");
  assert.ok(result.matches[0].score >= 70);
});
