import assert from "node:assert/strict";
import test from "node:test";
import { LostSignalApi, browseCategories, browseReports, saveReport, toMatchingItem } from "../lib/frontend-api.ts";
import { findMatches } from "../lib/matching.ts";
import { validateNewReport } from "../lib/reports/validation.ts";
import { validateNewClaim } from "../lib/claims/validation.ts";

const id = n => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const report = (n = 1, overrides = {}) => ({
  id: id(n), user_id: id(99), report_type: "found", status: "open", title: "Black bag",
  description: "Black canvas bag", location: "Main Library", category: "Bags",
  created_at: "2026-11-14T12:00:00Z", image_path: null, ai_attributes: {}, ...overrides,
});
const claim = { id: id(50), report_id: id(1), claimant_id: id(100), proof: "Blue lining", status: "pending", created_at: "2026-11-14T12:00:00Z", handoff_confirmed_at: null };
const payload = { report_type: "found", title: "Black bag", description: "Black canvas bag", location: "Main Library", category: "Bags" };
const json = (data, status = 200) => Response.json(data, { status });

test("fetches real report contract with session credentials, search and open-only filtering", async () => {
  const rows = [report(), report(2, { status: "resolved" }), report(3, { report_type: "lost" }), report(4, { status: "matched" })];
  const api = new LostSignalApi(async (url, init) => {
    assert.equal(url, "/api/reports");
    assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store");
    return json({ reports: rows });
  });
  const result = browseReports(await api.reports(), "Bags", "LIBRARY");
  assert.deepEqual(result.map(r => r.id), [id(1)]);
  assert.equal(result[0].title, "Black bag");
  assert.deepEqual(browseReports(rows, "Tech"), []);
  assert.deepEqual(browseReports([], "All"), []);
});

test("empty reports are preserved; failed or malformed responses never become successful data", async () => {
  assert.deepEqual(await new LostSignalApi(async () => json({ reports: [] })).reports(), []);
  for (const [response, status] of [
    [json({ error: "Authentication required" }, 401), 401],
    [json({ error: "Unable to load reports" }, 500), 500],
    [json({ reports: [{ id: 123 }] }), 502],
    [new Response("not json", { status: 502 }), 502],
  ]) await assert.rejects(new LostSignalApi(async () => response).reports(), { status });
  await assert.rejects(new LostSignalApi(async () => { throw new Error("offline"); }).reports(), /offline/);
});

test("creation uses existing validation and exact API payload, without heldAt or AI fields", async () => {
  const validated = validateNewReport(payload);
  assert.ok(validated.data);
  assert.equal(validateNewReport({ ...payload, description: "" }).data, undefined);
  const api = new LostSignalApi(async (url, init) => {
    assert.equal(url, "/api/reports"); assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), payload);
    return json({ report: report() }, 201);
  });
  assert.equal((await api.createReport(validated.data)).id, id(1));
});

test("photo uses one multipart image and private signed URL contract", async () => {
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  const api = new LostSignalApi(async (url, init) => {
    assert.equal(url, `/api/reports/${id(1)}/image`);
    if (init.method === "POST") {
      assert.equal(init.headers, undefined); // Browser must supply the multipart boundary.
      assert.deepEqual([...init.body.keys()], ["image"]);
      assert.equal(init.body.get("image").name, "photo.png");
    }
    return json({ image_path: "private/path", signed_url: "https://example.com/signed", expires_in: 300 });
  });
  await api.uploadPhoto(id(1), file);
  assert.equal(await api.photoUrl(id(1)), "https://example.com/signed");
});

test("partial photo failure retains confirmed report and retries without duplicate creation", async () => {
  let creates = 0; let uploads = 0;
  const api = new LostSignalApi(async (url, init) => {
    if (url === "/api/reports") { creates++; return json({ report: report() }, 201); }
    assert.equal(init.method, "POST"); uploads++;
    return uploads === 1 ? json({ error: "Storage unavailable" }, 500) :
      json({ image_path: "path", signed_url: "https://example.com/signed", expires_in: 300 }, 201);
  });
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  const first = await saveReport(api, payload, file);
  assert.equal(first.report.id, id(1)); assert.equal(first.uploadError, "Storage unavailable");
  const second = await saveReport(api, payload, file, first.report);
  assert.equal(second.uploadError, null);
  assert.equal(creates, 1); assert.equal(uploads, 2);
});

test("creation failure does not attempt upload or manufacture a report", async () => {
  let calls = 0;
  const api = new LostSignalApi(async () => { calls++; return json({ error: "Authentication required" }, 401); });
  await assert.rejects(saveReport(api, payload, new File(["x"], "x.png")), { status: 401 });
  assert.equal(calls, 1);
});

test("claim proof, pending/approved/rejected responses and owner decisions follow the existing API", async () => {
  assert.ok(validateNewClaim({ report_id: id(1), proof: "Blue lining" }).data);
  assert.ok(validateNewClaim({ report_id: id(1), proof: " " }).error);
  const api = new LostSignalApi(async (url, init) => {
    if (init.method === "POST") {
      assert.equal(url, "/api/claims");
      assert.deepEqual(JSON.parse(init.body), { report_id: id(1), proof: "Blue lining" });
      return json({ claim }, 201);
    }
    if (init.method === "PATCH") {
      assert.equal(url, `/api/claims/${claim.id}`);
      const { status } = JSON.parse(init.body);
      return json({ claim: { ...claim, status } });
    }
    if (url === `/api/claims/${claim.id}/handoff`) {
      assert.equal(init.method, "POST");
      return json({ claim: { ...claim, status: "approved", handoff_confirmed_at: "2026-11-15T06:00:00Z" } });
    }
    return json({ claims: [claim] });
  });
  assert.equal((await api.submitClaim(id(1), "Blue lining")).status, "pending");
  assert.equal((await api.decideClaim(claim.id, "approved")).status, "approved");
  assert.equal((await api.decideClaim(claim.id, "rejected")).status, "rejected");
  assert.equal((await api.claims()).length, 1);
  assert.equal((await api.confirmHandoff(claim.id)).handoff_confirmed_at, "2026-11-15T06:00:00Z");
  await assert.rejects(new LostSignalApi(async () => json({ error: "Claim already exists" }, 409)).submitClaim(id(1), "proof"), { status: 409 });
});

test("report matching uses saved report GET and preserves analysis and ranked report data", async () => {
  const source = report(91, { report_type: "lost" });
  const found = report(1, { image_path: "private/path" });
  let calls = 0;
  const api = new LostSignalApi(async (url, init) => {
    calls++;
    assert.equal(url, `/api/reports/${source.id}/matches`);
    assert.equal(init.method, undefined); assert.equal(init.body, undefined);
    assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store");
    return json({ source_report_id: source.id, count: 1,
      matches: [{ report_id: found.id, score: 75, reasons: ["Same category", "Shared details"] }],
      analysis: { state: "completed", attempted: 2, succeeded: 2, issues: [] } });
  });
  const result = await api.reportMatches(source.id, [source, found]);
  assert.equal(calls, 1);
  assert.deepEqual(result.matches, [{ report: found, score: 75, reasons: ["Same category", "Shared details"] }]);
  assert.equal(result.analysis.state, "completed");
});

test("matching keeps Gemini-unavailable fallback distinct and rejects missing or malformed reports", async () => {
  const source = report(91, { report_type: "lost" });
  const fallback = { source_report_id: source.id, count: 1,
    matches: [{ report_id: report().id, score: 45, reasons: ["Same category"] }],
    analysis: { state: "unavailable", attempted: 0, succeeded: 0, issues: [] } };
  const api = new LostSignalApi(async () => json(fallback));
  const result = await api.reportMatches(source.id, [source, report()]);
  assert.equal(result.analysis.state, "unavailable"); assert.equal(result.matches[0].score, 45);
  await assert.rejects(api.reportMatches(source.id, [source]), { status: 502 });
  await assert.rejects(new LostSignalApi(async () => json({ ...fallback, count: 2 })).reportMatches(source.id, [source, report()]), { status: 502 });
  await assert.rejects(new LostSignalApi(async () => json({ error: "Too many matching requests" }, 429)).reportMatches(source.id, [source, report()]), { status: 429 });
  await assert.rejects(new LostSignalApi(async () => json({ error: "Authentication required" }, 401)).reportMatches(source.id, [source, report()]), { status: 401 });
});

test("saved found reports map only open lost reports from the GET response", async () => {
  const source = report(1);
  const lost = report(2, { report_type: "lost" });
  const response = { source_report_id: source.id, count: 1,
    matches: [{ report_id: lost.id, score: 60, reasons: ["Shared details"] }],
    analysis: { state: "not_needed", attempted: 0, succeeded: 0, issues: [] } };
  const api = new LostSignalApi(async () => json(response));
  assert.equal((await api.reportMatches(source.id, [source, lost])).matches[0].report.id, lost.id);
  await assert.rejects(api.reportMatches(source.id, [source, { ...lost, status: "resolved" }]), { status: 502 });
  await assert.rejects(api.reportMatches(source.id, [source, { ...lost, report_type: "found" }]), { status: 502 });
});

test("separate quick search retains weighted POST matching without Gemini", async () => {
  const rows = Array.from({ length: 28 }, (_, n) => report(n + 1));
  let calls = 0;
  const api = new LostSignalApi(async (url, init) => {
    calls++;
    assert.equal(url, "/api/matches"); assert.equal(init.method, "POST");
    const { source, candidates } = JSON.parse(init.body);
    assert.equal(source.reportType, "lost"); assert.equal(source.category, "Bags");
    assert.ok(candidates.length <= 25);
    return json({ success: true, matches: findMatches(source, candidates) });
  });
  const matches = await api.matches("Black canvas bag", rows, { category: "Bags" });
  assert.equal(calls, 2); assert.equal(matches.length, 10);
  const item = toMatchingItem(report(1, { ai_attributes: { color: "Unknown", brand: null, features: ["strap"] } }));
  assert.equal(item.color, undefined); assert.equal(item.brand, undefined);
  assert.deepEqual(item.features, ["strap"]);
});
test("matching handles empty results, API errors and unknown result IDs without fake matches", async () => {
  const empty = new LostSignalApi(async () => json({ success: true, matches: [] }));
  assert.deepEqual(await empty.matches("bag", [report()]), []);
  assert.deepEqual(await empty.matches("bag", []), []);
  const fail = new LostSignalApi(async () => json({ error: "Matching unavailable" }, 503));
  await assert.rejects(fail.matches("bag", [report()]), { status: 503 });
  const unexpected = new LostSignalApi(async () => json({ success: true, matches: [{ item: { id: "unknown" }, score: 90, reasons: [] }] }));
  await assert.rejects(unexpected.matches("bag", [report()]), { status: 502 });
});

test("category buttons deduplicate different casing, and filtering includes every case", () => {
  const rows = [
    report(10, { category: "other" }),
    report(11, { category: "Other" }),
  ];
  assert.deepEqual(browseCategories(rows, ["Bags", "Other"]), ["All", "Bags", "Other"]);
  assert.equal(browseReports(rows, "Other").length, 2);
  assert.equal(browseReports(rows, "other").length, 2);
});
