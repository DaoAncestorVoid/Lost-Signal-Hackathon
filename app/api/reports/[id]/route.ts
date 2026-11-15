import { createClient } from "@/lib/supabase/server";
import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { validateReportEdit } from "@/lib/reports/validation";
import { REPORT_IMAGE_BUCKET } from "@/lib/reports/images";
import { cleanupDetachedImage } from "@/lib/reports/image-cleanup";
import { editConflict, deleteConflict } from "@/lib/reports/management";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: "Invalid report id" }, { status: 400 });
  }

  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Unable to load report" }, { status: 500 });
  }
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  return Response.json({ report });
}

type Context = { params: Promise<{ id: string }> };

async function ownerContext(params: Context["params"]) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  if (!canWriteAsPermanentUser(user)) return { response: permanentAccountRequired() };
  const { id } = await params;
  if (!uuidPattern.test(id)) return { response: Response.json({ error: "Invalid report id" }, { status: 400 }) };
  const result = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (result.error) return { response: Response.json({ error: "Unable to load report" }, { status: 500 }) };
  if (!result.data || result.data.user_id !== user.id) return { response: Response.json({ error: "Report not found" }, { status: 404 }) };
  const claimResult = await supabase.from("claims").select("id,status").eq("report_id", id);
  if (claimResult.error) return { response: Response.json({ error: "Unable to check report claims" }, { status: 500 }) };
  return { supabase, user, report: result.data, claims: claimResult.data ?? [], id };
}

export async function PATCH(request: Request, { params }: Context) {
  const context = await ownerContext(params);
  if (context.response) return context.response;
  const { supabase, user, report, claims, id } = context;
  const conflict = editConflict(report.status, claims);
  if (conflict) return Response.json({ error: conflict }, { status: 409 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = validateReportEdit(body);
  if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const result = await supabase.from("reports").update(parsed.data).eq("id", id).eq("user_id", user.id).eq("status", "open").select("*").maybeSingle();
  if (result.error) return Response.json({ error: "Unable to update report" }, { status: 500 });
  if (!result.data) return Response.json({ error: "Report changed while editing. Refresh and try again." }, { status: 409 });
  return Response.json({ report: result.data });
}

export async function DELETE(_request: Request, { params }: Context) {
  const context = await ownerContext(params);
  if (context.response) return context.response;
  const { supabase, user, report, claims, id } = context;
  const conflict = deleteConflict(claims);
  if (conflict) return Response.json({ error: conflict }, { status: 409 });
  const result = await supabase.from("reports").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (result.error) return Response.json({ error: result.error.code === "23514" ? "Reports with claims cannot be deleted" : "Unable to delete report" }, { status: result.error.code === "23514" ? 409 : 500 });
  if (!result.data) return Response.json({ error: "Report changed while deleting. Refresh and try again." }, { status: 409 });
  const warning = report.image_path ? await cleanupDetachedImage(supabase.storage.from(REPORT_IMAGE_BUCKET), report.image_path, user.id, id, "deleted") : undefined;
  return Response.json({ deleted_id: id, warning });
}
