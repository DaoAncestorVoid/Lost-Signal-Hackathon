import { createClient } from "@/lib/supabase/server";
import { AnalysisLimiter, AnalysisRequestError } from "@/lib/ai-protection";

const limiter = new AnalysisLimiter();
export async function authorizeAnalysis(request: Request): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin analysis is not allowed" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const retryAfter = limiter.take(user.id);
  if (retryAfter) {
    return Response.json({ error: "Too many analysis requests" }, {
      status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    });
  }
  return null;
}

export function analysisError(error: unknown): Response {
  if (error instanceof AnalysisRequestError) {
    return Response.json({ success: false, error: error.message }, { status: error.status });
  }
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number(error.status) : 500;
  if (status === 429 || status === 503) {
    return Response.json({ success: false, error: "Gemini is temporarily unavailable. Try again later." }, {
      status, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
  // Avoid logging descriptions, image data, credentials or raw provider errors.
  console.error("AI analysis failed", { status });
  return Response.json({ success: false, error: "Unable to analyze item" }, { status: 500 });
}
