import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./reports/validation") return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { blankDraft, nextStep, previousStep, stepError, parseDraft, reportPayload } = await import("../lib/report-wizard.ts");
const { saveReport } = await import("../lib/frontend-api.ts");

const filled = type => ({ ...blankDraft(type), name: "Black backpack", category: "Bags", description: "Red zipper pull", place: "Student Union" });

test("wizard navigation has three grouped steps and retains the same draft values", () => {
  const draft = filled("found");
  assert.equal(nextStep(1), 2);
  assert.equal(nextStep(2), 3);
  assert.equal(nextStep(3), 3);
  assert.equal(previousStep(3), 2);
  assert.equal(previousStep(2), 1);
  assert.equal(previousStep(1), 1);
  assert.deepEqual(draft, filled("found"));
});

test("required details are checked at their step before final schema validation", () => {
  const draft = blankDraft("lost");
  assert.match(stepError(1, draft), /item name/);
  draft.name = "UCard";
  assert.match(stepError(1, draft), /category/);
  draft.category = "Cards";
  assert.match(stepError(1, draft), /description/);
  draft.description = "Red lanyard";
  assert.equal(stepError(1, draft), "");
  assert.match(stepError(2, draft), /location/);
  draft.place = "W.E.B. Du Bois Library";
  draft.itemDate = "invalid";
  assert.match(stepError(2, draft), /date and time/);
  draft.itemDate = "2026-11-14T12:30";
  assert.equal(stepError(2, draft), "");
});

test("tab draft restoration retains lost and found details and rejects malformed saved data", () => {
  for (const type of ["lost", "found"]) {
    const draft = { ...filled(type), itemDate: "2026-11-14T12:30" };
    assert.deepEqual(parseDraft(JSON.parse(JSON.stringify({ draft, step: 2 }))), { draft, step: 2 });
    assert.equal(reportPayload(draft).report_type, type);
    assert.equal(reportPayload(draft).category, "Bags");
    assert.match(reportPayload(draft).item_date, /^2026-11-14T/);
  }
  assert.equal(parseDraft({ draft: { ...filled("found"), description: 4 }, step: 3 }), null);
});

test("successful posting uses one report and photo failure retries its existing ID", async () => {
  const report = { id: "saved-report", report_type: "found" };
  const calls = [];
  let fail = true;
  const api = {
    createReport: async payload => { calls.push(`create:${payload.report_type}`); return report; },
    uploadPhoto: async id => { calls.push(`upload:${id}`); if (fail) throw new Error("upload failed"); },
  };
  const photo = new File(["image"], "item.png", { type: "image/png" });
  const payload = reportPayload(filled("found"));
  const first = await saveReport(api, payload, photo);
  assert.equal(first.report, report);
  assert.match(first.uploadError, /upload failed/);
  fail = false;
  const retry = await saveReport(api, payload, photo, first.report);
  assert.equal(retry.uploadError, null);
  assert.deepEqual(calls, ["create:found", "upload:saved-report", "upload:saved-report"]);
});
