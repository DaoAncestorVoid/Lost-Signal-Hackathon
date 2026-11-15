import { karmaFromApprovedClaims } from "@/lib/karma";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401, headers });
  }
  if (user.is_anonymous !== false) {
    return Response.json({ error: "Campus Karma requires a permanent account" }, { status: 403, headers });
  }

  const { data, error } = await supabase.rpc("get_karma_approved_claim_count");
  if (error || typeof data !== "number") {
    return Response.json({ error: "Unable to load Campus Karma" }, { status: 503, headers });
  }
  try {
    return Response.json(karmaFromApprovedClaims(data), { headers });
  } catch {
    return Response.json({ error: "Invalid Campus Karma data" }, { status: 500, headers });
  }
}
