import { createClient } from "@/lib/supabase/server";
import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Authentication required" }, { status: 401, headers });
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();

  const result = await supabase.from("activity_notifications")
    .select("id,kind,report_id,claim_id,read_at,created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(75);
  if (result.error) return Response.json({ error: "Unable to load activity notifications" }, { status: 500, headers });

  const rows = result.data ?? [];
  const reportIds = [...new Set(rows.map(row => row.report_id))];
  const reports = reportIds.length
    ? await supabase.from("reports").select("id,title").in("id", reportIds)
    : { data: [], error: null };
  if (reports.error) return Response.json({ error: "Unable to load notification items" }, { status: 500, headers });
  const titles = new Map((reports.data ?? []).map(row => [row.id, row.title]));
  return Response.json({ notifications: rows.map(row => ({
    ...row, report_title: titles.get(row.report_id) ?? "Found item",
  })) }, { headers });
}
