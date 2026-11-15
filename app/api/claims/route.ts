import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { claimErrorResponse } from "@/lib/claims/errors";
import { validateNewClaim } from "@/lib/claims/validation";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = validateNewClaim(body);
  if (!result.data) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { data: claim, error } = await supabase.rpc("submit_claim", {
    p_report_id: result.data.report_id,
    p_proof: result.data.proof,
  });
  if (error) return claimErrorResponse(error.code, "submit");
  return Response.json({ claim }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: claims, error } = await supabase
    .from("claims")
    .select("id,report_id,claimant_id,proof,status,created_at,handoff_confirmed_at")
    .order("created_at", { ascending: false });
  if (error) {
    return Response.json({ error: "Unable to load claims" }, { status: 500 });
  }
  return Response.json({ claims });
}
