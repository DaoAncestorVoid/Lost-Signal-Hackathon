import { analyzeImage, analyzeItem } from "@/lib/gemini";
import { AnalysisLimiter } from "@/lib/ai-protection";
import {
  matchReports,
  MAX_MATCH_CANDIDATES,
  ReportRowSchema,
  type ReportRow,
} from "@/lib/report-matches";
import {
  isReportImagePath,
  MAX_IMAGE_BYTES,
  REPORT_IMAGE_BUCKET,
  validateImage,
} from "@/lib/reports/images";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limiter = new AnalysisLimiter();
const fields = "id,user_id,report_type,status,title,description,category,location,image_path,ai_description,ai_attributes";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin matching is not allowed" }, { status: 403, headers: noStore });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: "Invalid report id" }, { status: 400, headers: noStore });
  }

  const { data: sourceData, error: sourceError } = await supabase.from("reports")
    .select(fields).eq("id", id).maybeSingle();
  if (sourceError) {
    return Response.json({ error: "Unable to load source report" }, { status: 500, headers: noStore });
  }
  if (!sourceData) {
    return Response.json({ error: "Report not found" }, { status: 404, headers: noStore });
  }
  const sourceResult = ReportRowSchema.safeParse(sourceData);
  if (!sourceResult.success) {
    return Response.json({ error: "Invalid report data" }, { status: 500, headers: noStore });
  }
  const source = sourceResult.data;
  if (source.status !== "open") {
    return Response.json({ error: "Only open reports can be matched" }, { status: 409, headers: noStore });
  }

  const oppositeType = source.report_type === "lost" ? "found" : "lost";
  const { data: candidateData, error: candidateError } = await supabase.from("reports")
    .select(fields)
    .eq("report_type", oppositeType)
    .eq("status", "open")
    .neq("id", source.id)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCH_CANDIDATES);
  if (candidateError) {
    return Response.json({ error: "Unable to load candidate reports" }, { status: 500, headers: noStore });
  }
  const candidates: ReportRow[] = [];
  for (const row of candidateData ?? []) {
    const parsed = ReportRowSchema.safeParse(row);
    if (parsed.success) candidates.push(parsed.data);
  }

  const geminiAvailable = Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_MOCK_MODE !== "true";
  const retryAfter = geminiAvailable && candidates.length ? limiter.take(user.id, Date.now(), user.is_anonymous ? 2 : 10) : 0;
  if (retryAfter) {
    return Response.json({ error: "Too many matching requests" }, {
      status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) },
    });
  }

  const loadImage = async (report: ReportRow) => {
    const path = report.image_path;
    if (!path || !isReportImagePath(path, report.user_id, report.id)) return null;
    const { data: blob, error } = await supabase.storage.from(REPORT_IMAGE_BUCKET).download(path);
    if (error || !blob || blob.size === 0 || blob.size > MAX_IMAGE_BYTES) return null;
    const mimeType = path.endsWith(".jpg") ? "image/jpeg"
      : path.endsWith(".png") ? "image/png" : "image/webp";
    const file = new File([blob], path, { type: mimeType });
    const image = await validateImage(file);
    if ("error" in image) return null;
    return { base64: Buffer.from(image.bytes).toString("base64"), mimeType: image.contentType };
  };

  const result = await matchReports(source, candidates, {
    geminiAvailable,
    loadImage,
    analyzeText: analyzeItem,
    analyzeImage,
  });
  return Response.json({
    source_report_id: source.id,
    count: result.matches.length,
    matches: result.matches.map((match) => ({
      report_id: match.item.id,
      score: match.score,
      reasons: match.reasons,
    })),
    analysis: result.analysis,
  }, { headers: noStore });
}
