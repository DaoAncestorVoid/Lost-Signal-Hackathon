import { z } from "zod";
import { analyzeItem } from "@/lib/gemini";
import { authorizeAnalysis, analysisError } from "@/lib/ai-request";
import { readLimitedBody, AnalysisRequestError } from "@/lib/ai-protection";

const BodySchema = z.object({ description: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  try {
    const denied = await authorizeAnalysis(request);
    if (denied) return denied;
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new AnalysisRequestError(415, "Content-Type must be application/json");
    }
    const bytes = await readLimitedBody(request, 16 * 1024);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new AnalysisRequestError(400, "Invalid JSON body"); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new AnalysisRequestError(400, "Invalid description");
    const attributes = await analyzeItem(parsed.data.description);
    // Preserve the analysis key and also match the image endpoint's attributes key.
    return Response.json({ success: true, analysis: attributes, attributes }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return analysisError(error); }
}
