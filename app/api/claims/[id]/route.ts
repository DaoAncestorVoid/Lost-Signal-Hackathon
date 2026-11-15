import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { claimErrorResponse } from "@/lib/claims/errors";
import { isUuid, validateDecision } from "@/lib/claims/validation";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid claim id" }, { status: 400 });
  }

  const { data: claim, error } = await supabase
    .from("claims")
    .select("id,report_id,claimant_id,proof,status,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: "Unable to load claim" }, { status: 500 });
  }
  if (!claim) {
    return Response.json({ error: "Claim not found" }, { status: 404 });
  }
  return Response.json({ claim });
}

export async function PATCH(request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid claim id" }, { status: 400 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = validateDecision(body);
  if (!result.status) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { data: claim, error } = await supabase.rpc("decide_claim", {
    p_claim_id: id,
    p_decision: result.status,
  });
  if (error) return claimErrorResponse(error.code, "decide");
  return Response.json({ claim });
}
