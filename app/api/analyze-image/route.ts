import { analyzeImage } from "@/lib/gemini";
import { MAX_IMAGE_BYTES, validateImage } from "@/lib/reports/images";
import { authorizeAnalysis, analysisError } from "@/lib/ai-request";
import { readLimitedBody, AnalysisRequestError } from "@/lib/ai-protection";

export async function POST(request: Request) {
  try {
    const denied = await authorizeAnalysis(request);
    if (denied) return denied;
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      throw new AnalysisRequestError(415, "Content-Type must be multipart/form-data");
    }
    // Permit 64 KiB multipart overhead beyond the shared 5 MiB file limit.
    const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES + 64 * 1024);
    let form: FormData;
    try {
      form = await new Response(Buffer.from(bytes), { headers: { "Content-Type": contentType } }).formData();
    } catch { throw new AnalysisRequestError(400, "Invalid multipart form"); }
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0][0] !== "image" || !(entries[0][1] instanceof File)) {
      throw new AnalysisRequestError(400, "Provide one image file in the image field");
    }
    const image = await validateImage(entries[0][1]);
    if ("error" in image) throw new AnalysisRequestError(400, image.error);
    const attributes = await analyzeImage(Buffer.from(image.bytes).toString("base64"), image.contentType);
    return Response.json({ success: true, attributes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return analysisError(error); }
}
