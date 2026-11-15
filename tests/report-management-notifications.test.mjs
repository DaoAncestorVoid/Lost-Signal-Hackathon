import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { LostSignalApi } from "../lib/frontend-api.ts";
import { validateReportEdit } from "../lib/reports/validation.ts";
import { editConflict, deleteConflict, deleteConfirmation } from "../lib/reports/management.ts";
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === "./matching" || specifier === "./images" ? `${specifier}.ts` : specifier, context); } });
const { MIN_NOTIFICATION_SCORE, newPotentialPairs, potentialNotification, notificationIsVisible } = await import("../lib/notifications.ts");
const { cleanupDetachedImage } = await import("../lib/reports/image-cleanup.ts");

const id = n => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const report = (n, type, overrides = {}) => ({ id: id(n), user_id: type === "lost" ? id(9) : id(8), report_type: type,
  status: "open", title: "Black Sony headphones", description: "Black Sony headphones in a case", category: "Tech",
  location: "Du Bois Library", item_date: null, image_path: null, ai_attributes: {}, created_at: type === "lost" ? "2026-11-14T10:00:00Z" : "2026-11-14T11:00:00Z", ...overrides });

test("edit validation accepts only ordinary report fields, including nullable date", () => {
  assert.deepEqual(validateReportEdit({ title: "  Keys  ", item_date: null }).data, { title: "Keys", item_date: null });
  for (const value of [{}, { status: "resolved" }, { user_id: id(3) }, { ai_attributes: {} }, { title: "" }, { item_date: "today" }])
    assert.ok(validateReportEdit(value).error);
});

test("management conflicts preserve active claim evidence and deletion confirmation is explicit", () => {
  assert.equal(editConflict("open", []), null);
  assert.equal(editConflict("open", [{ status: "rejected" }]), null);
  assert.match(editConflict("open", [{ status: "pending" }]), /active claims/);
  assert.match(editConflict("resolved", []), /Closed/);
  assert.match(deleteConflict([{ status: "pending" }]), /cannot be deleted/);
  assert.match(deleteConflict([{ status: "approved" }]), /cannot be deleted/);
  assert.match(deleteConflict([{ status: "rejected" }]), /cannot be deleted/);
  assert.equal(deleteConflict([]), null);
  assert.match(deleteConfirmation("Keys"), /Permanently delete “Keys”\? This cannot be undone/);
});

test("photo replacement, removal, and report deletion clean only detached owner paths and surface failures", async () => {
  const path = `${id(9)}/${id(1)}/${id(3)}.png`;
  const calls = [];
  const storage = { async remove(paths) { calls.push(paths); return { error: null }; } };
  assert.equal(await cleanupDetachedImage(storage, path, id(9), id(1), "replaced"), undefined);
  assert.equal(await cleanupDetachedImage(storage, path, id(9), id(1), "removed"), undefined);
  assert.equal(await cleanupDetachedImage(storage, path, id(9), id(1), "deleted"), undefined);
  assert.deepEqual(calls, [[path], [path], [path]]);
  const failed = { async remove() { return { error: new Error("Storage offline") }; } };
  const oldError = console.error; console.error = () => {};
  try {
    assert.match(await cleanupDetachedImage(failed, path, id(9), id(1), "deleted"), /storage cleanup failed/);
    assert.match(await cleanupDetachedImage(storage, "another-user/path", id(9), id(1), "removed"), /manual cleanup/);
  } finally { console.error = oldError; }
  assert.equal(calls.length, 3);
});

test("owner edit/delete and photo removal use authenticated API endpoints", async () => {
  const calls = [];
  const api = new LostSignalApi(async (url, init) => {
    calls.push([url, init.method, init.credentials]);
    if (init.method === "PATCH") { assert.deepEqual(JSON.parse(init.body), { title: "Updated" }); return Response.json({ report: report(1, "lost", { title: "Updated" }) }); }
    if (url.endsWith("/image")) return Response.json({ image_path: null, warning: "Storage cleanup failed" });
    return Response.json({ deleted_id: id(1) });
  });
  assert.equal((await api.updateReport(id(1), { title: "Updated" })).title, "Updated");
  assert.equal(await api.removePhoto(id(1)), "Storage cleanup failed");
  assert.equal(await api.deleteReport(id(1)), undefined);
  assert.deepEqual(calls, [[`/api/reports/${id(1)}`, "PATCH", "same-origin"], [`/api/reports/${id(1)}/image`, "DELETE", "same-origin"], [`/api/reports/${id(1)}`, "DELETE", "same-origin"]]);
  await assert.rejects(new LostSignalApi(async () => Response.json({ error: "Report not found" }, { status: 404 })).deleteReport(id(1)), { status: 404 });
  await assert.rejects(new LostSignalApi(async () => Response.json({ error: "Account required" }, { status: 403 })).updateReport(id(1), { title: "X" }), { status: 403 });
});

test("notification scoring is deterministic, conservative, and excludes irrelevant pairs", () => {
  const lost = report(1, "lost"), found = report(2, "found");
  assert.ok(potentialNotification(lost, found, lost.user_id) >= MIN_NOTIFICATION_SCORE);
  assert.equal(potentialNotification(lost, report(2, "found", { category: "Bags" }), lost.user_id), null);
  assert.equal(potentialNotification(lost, report(2, "found", { title: "Laptop", description: "Silver laptop", location: "Du Bois Library" }), lost.user_id), null);
  assert.equal(potentialNotification(lost, report(2, "found", { user_id: lost.user_id }), lost.user_id), null);
  assert.equal(potentialNotification(lost, report(2, "found", { created_at: lost.created_at }), lost.user_id), null);
  assert.equal(potentialNotification(lost, report(2, "found", { status: "resolved" }), lost.user_id), null);
  assert.equal(potentialNotification({ ...lost, status: "resolved" }, found, lost.user_id), null);
  assert.equal(potentialNotification(lost, found, id(77)), null);
});

test("notification pair generation deduplicates and needs no Gemini service", () => {
  const lost = report(1, "lost"), found = report(2, "found");
  const first = newPotentialPairs([lost, lost], [found, found], lost.user_id, new Set());
  assert.equal(first.length, 1);
  assert.equal(newPotentialPairs([lost], [found], lost.user_id, new Set([`${lost.id}:${found.id}`])).length, 0);
});

test("deleted, resolved, and other-user reports disappear from notification listings", () => {
  const lost = report(1, "lost"), found = report(2, "found");
  assert.equal(notificationIsVisible(lost, found, lost.user_id), true);
  assert.equal(notificationIsVisible(undefined, found, lost.user_id), false);
  assert.equal(notificationIsVisible(lost, undefined, lost.user_id), false);
  assert.equal(notificationIsVisible(lost, { ...found, status: "resolved" }, lost.user_id), false);
  assert.equal(notificationIsVisible({ ...lost, status: "resolved" }, found, lost.user_id), false);
  assert.equal(notificationIsVisible(lost, found, id(77)), false);
});

test("notification API keeps unread/read status and rejects other-user errors", async () => {
  const found = report(2, "found");
  const item = { id: id(4), recipient_id: id(9), lost_report_id: id(1), found_report_id: id(2), score: 55, read_at: null, created_at: found.created_at, found_report: found };
  const api = new LostSignalApi(async (url, init) => {
    if (url === "/api/notifications" && init.method === "POST") return Response.json({ created: 1 });
    if (url === "/api/notifications") return Response.json({ notifications: [item] });
    return Response.json({ id: item.id });
  });
  await api.refreshNotifications();
  assert.equal((await api.notifications()).filter(row => !row.read_at).length, 1);
  await api.markNotificationRead(item.id);
  await assert.rejects(new LostSignalApi(async () => Response.json({ error: "Notification not found" }, { status: 404 })).markNotificationRead(item.id), { status: 404 });
});

test("new RLS migrations guard owners, guests, claim evidence, and notification isolation", async () => {
  const management = await readFile(new URL("../supabase/migrations/20261115040000_report_management.sql", import.meta.url), "utf8");
  const notifications = await readFile(new URL("../supabase/migrations/20261115041000_match_notifications.sql", import.meta.url), "utf8");
  assert.match(management, /before delete on public\.reports/);
  assert.match(management, /auth\.uid\(\)/);
  assert.match(management, /is_anonymous/);
  assert.match(management, /claims c where c\.report_id = old\.id/);
  assert.match(notifications, /unique \(lost_report_id, found_report_id\)/);
  assert.match(notifications, /recipient_id = \(select auth\.uid\(\)\)/);
  assert.match(notifications, /is_anonymous/);
  assert.match(notifications, /read_at/);
});
