import { notificationDatabaseError } from "@/lib/notification-errors";
import { createClient } from "@/lib/supabase/server";
import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { ReportSchema } from "@/lib/frontend-api";
import { newPotentialPairs, notificationIsVisible } from "@/lib/notifications";

async function context() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  if (!canWriteAsPermanentUser(user)) return { response: permanentAccountRequired() };
  return { supabase, user };
}

export async function GET() {
  const current = await context();
  if (current.response) return current.response;
  const { supabase, user } = current;
  const rows = await supabase.from("notifications").select("id,recipient_id,lost_report_id,found_report_id,score,read_at,created_at").eq("recipient_id", user.id).order("created_at", { ascending: false });
  if (rows.error) return notificationDatabaseError("matches", rows.error);
  const ids = [...new Set((rows.data ?? []).flatMap(row => [row.lost_report_id, row.found_report_id]))];
  if (!ids.length) return Response.json({ notifications: [] });
  const reports = await supabase.from("reports").select("*").in("id", ids);
  if (reports.error) return Response.json({ error: "Unable to load notification reports" }, { status: 500 });
  const byId = new Map((reports.data ?? []).flatMap(value => { const parsed = ReportSchema.safeParse(value); return parsed.success ? [[parsed.data.id, parsed.data] as const] : []; }));
  const notifications = (rows.data ?? []).flatMap(row => {
    const lost = byId.get(row.lost_report_id), found = byId.get(row.found_report_id);
    return notificationIsVisible(lost, found, user.id) ? [{ ...row, found_report: found }] : [];
  });
  return Response.json({ notifications });
}

export async function POST() {
  const current = await context();
  if (current.response) return current.response;
  const { supabase, user } = current;
  const [lostRows, foundRows, existing] = await Promise.all([
    supabase.from("reports").select("*").eq("user_id", user.id).eq("report_type", "lost").eq("status", "open"),
    supabase.from("reports").select("*").eq("report_type", "found").eq("status", "open").neq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("notifications").select("lost_report_id,found_report_id").eq("recipient_id", user.id),
  ]);
  if (lostRows.error || foundRows.error || existing.error) return notificationDatabaseError("match refresh", lostRows.error ?? foundRows.error ?? existing.error!);
  const lost = (lostRows.data ?? []).flatMap(row => { const result = ReportSchema.safeParse(row); return result.success ? [result.data] : []; });
  const found = (foundRows.data ?? []).flatMap(row => { const result = ReportSchema.safeParse(row); return result.success ? [result.data] : []; });
  const known = new Set((existing.data ?? []).map(row => `${row.lost_report_id}:${row.found_report_id}`));
  let created = 0;
  for (const pair of newPotentialPairs(lost, found, user.id, known)) {
    const result = await supabase.from("notifications").insert({ recipient_id: user.id, ...pair });
    if (result.error && result.error.code !== "23505") return Response.json({ error: "Unable to save match notifications" }, { status: 500 });
    if (!result.error) created++;
  }
  return Response.json({ created });
}
