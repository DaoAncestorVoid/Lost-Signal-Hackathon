import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { claimErrorResponse } from "@/lib/claims/errors";
import { isUuid } from "@/lib/claims/validation";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

// The recipient confirms *after* receiving their item; neither guests nor
// the finder can complete this step on the claimant's behalf.
export async function POST(request: Request, { params }: Context) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401, headers });
  }
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid claim id" }, { status: 400, headers });
  }
  // Require same-origin requests if browsers provide Origin; deny cross-site writes.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin action denied" }, { status: 403, headers });
  }
  const { data: claim, error } = await supabase.rpc("confirm_claim_handoff", { p_claim_id: id });
  if (error) return claimErrorResponse(error.code, "confirm");
  return Response.json({ claim }, { headers });
}
