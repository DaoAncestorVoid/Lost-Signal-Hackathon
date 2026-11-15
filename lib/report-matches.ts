import { z } from "zod";
import { ItemAttributesSchema, type ItemAttributes } from "./gemini";
import { findMatches } from "./matching";
import type { Item } from "../types/item";

export const MAX_MATCH_CANDIDATES = 25;
export const MAX_ANALYSIS_CALLS = 4;
export const MATCH_LIMIT = 10;
export const MIN_MATCH_SCORE = 30;

export const ReportRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  report_type: z.enum(["lost", "found"]),
  status: z.enum(["open", "matched", "resolved"]),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.string(),
  item_date: z.string().nullable().optional(),
  image_path: z.string().nullable(),
  ai_description: z.string().nullable(),
  ai_attributes: z.unknown(),
});

export type ReportRow = z.infer<typeof ReportRowSchema>;

function known(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^(unknown|other|n\/a)$/i.test(trimmed)) return undefined;
  return trimmed;
}

export function storedAttributes(report: ReportRow): ItemAttributes | null {
  const result = ItemAttributesSchema.safeParse(report.ai_attributes);
  return result.success ? result.data : null;
}

export function reportToItem(report: ReportRow, attributes = storedAttributes(report)): Item {
  const description = [report.title, report.description, report.ai_description]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  const features = attributes?.features.filter((feature) => known(feature));
  return {
    id: report.id,
    reportType: report.report_type,
    status: report.status === "open" ? "open" : "resolved",
    description,
    title: report.title,
    itemDate: report.item_date,
    category: known(report.category) ?? known(attributes?.category),
    color: known(attributes?.color),
    brand: known(attributes?.brand),
    features: features?.length ? features : undefined,
    location: report.location,
  };
}

export type MatchAnalysis = {
  state: "not_needed" | "unavailable" | "completed" | "partial";
  attempted: number;
  succeeded: number;
  issues: Array<"missing_image" | "quota" | "timeout" | "provider_unavailable">;
};

type Dependencies = {
  geminiAvailable: boolean;
  loadImage: (report: ReportRow) => Promise<{ base64: string; mimeType: string } | null>;
  analyzeText: (text: string) => Promise<ItemAttributes>;
  analyzeImage: (base64: string, mimeType: string) => Promise<ItemAttributes>;
};

function issueFor(error: unknown): MatchAnalysis["issues"][number] {
  if (typeof error === "object" && error !== null) {
    const status = "status" in error ? Number(error.status) : undefined;
    if (status === 429) return "quota";
    if (status === 503) return "provider_unavailable";
    const name = "name" in error ? String(error.name) : "";
    const message = "message" in error ? String(error.message) : "";
    if (name === "AbortError" || /timeout|timed out/i.test(message)) return "timeout";
  }
  return "provider_unavailable";
}

/** Optionally enrich saved reports with Gemini, even for promising initial matches; baseline similarity always remains available if AI fails. */
export async function matchReports(source: ReportRow, candidates: ReportRow[], deps: Dependencies) {
  const items = new Map<string, Item>([
    [source.id, reportToItem(source)],
    ...candidates.map((report) => [report.id, reportToItem(report)] as const),
  ]);
  const rank = () => findMatches(items.get(source.id)!, candidates.map((report) => items.get(report.id)!), {
    minScore: MIN_MATCH_SCORE,
    limit: MATCH_LIMIT,
  });
  const baseline = rank();
  const analysis: MatchAnalysis = { state: "not_needed", attempted: 0, succeeded: 0, issues: [] };
  if (!candidates.length) {
    return { matches: baseline, analysis };
  }

  const targets = [source, ...candidates
    .filter((report) => !storedAttributes(report))
    .sort((left, right) => Number(Boolean(right.image_path)) - Number(Boolean(left.image_path)))
    .slice(0, MAX_ANALYSIS_CALLS - 1)]
    .filter((report) => !storedAttributes(report));
  if (!targets.length) return { matches: baseline, analysis };
  if (!deps.geminiAvailable) {
    analysis.state = "unavailable";
    return { matches: baseline, analysis };
  }

  for (const report of targets) {
    try {
      let attributes: ItemAttributes;
      if (report.image_path) {
        const image = await deps.loadImage(report).catch(() => null);
        if (image) {
          analysis.attempted++;
          attributes = await deps.analyzeImage(image.base64, image.mimeType);
        } else {
          analysis.issues.push("missing_image");
          analysis.attempted++;
          attributes = await deps.analyzeText(`${report.title} ${report.description}`.slice(0, 2000));
        }
      } else {
        analysis.attempted++;
        attributes = await deps.analyzeText(`${report.title} ${report.description}`.slice(0, 2000));
      }
      const parsed = ItemAttributesSchema.parse(attributes);
      items.set(report.id, reportToItem(report, parsed));
      analysis.succeeded++;
    } catch (error) {
      analysis.issues.push(issueFor(error));
      // A provider failure is unlikely to recover during this request. Keep
      // the evidence already available instead of spending more quota.
      break;
    }
  }

  analysis.state = analysis.issues.length ? "partial" : "completed";
  return { matches: rank(), analysis };
}
