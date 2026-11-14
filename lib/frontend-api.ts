import { z } from "zod";
import type { NewReport } from "./reports/validation";
import type { Item } from "../types/item";

const Attributes = z.object({
  category: z.string().optional(), color: z.string().optional(),
  brand: z.string().nullable().optional(), features: z.array(z.string()).optional(),
}).passthrough();
export const ReportSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(),
  report_type: z.enum(["lost", "found"]), status: z.enum(["open", "matched", "resolved"]),
  title: z.string(), description: z.string(), category: z.string(), location: z.string(),
  image_path: z.string().nullable(), created_at: z.string(),
  // Database JSONB is not constrained to the current AI schema. Unknown shapes
  // must not prevent browsing; only validated attributes feed the matcher.
  ai_attributes: z.unknown().transform(value => {
    const parsed = Attributes.safeParse(value);
    return parsed.success ? parsed.data : {};
  }),
});
export type Report = z.infer<typeof ReportSchema>;
const ClaimSchema = z.object({
  id: z.string().uuid(), report_id: z.string().uuid(), claimant_id: z.string().uuid(),
  proof: z.string(), status: z.enum(["pending", "approved", "rejected"]), created_at: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;
export type RankedReport = { report: Report; score: number; reasons: string[] };
export const ReportMatchAnalysisSchema = z.object({
  state: z.enum(["not_needed", "unavailable", "completed", "partial"]),
  attempted: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  issues: z.array(z.enum(["missing_image", "quota", "timeout", "provider_unavailable"])),
});
export type ReportMatchAnalysis = z.infer<typeof ReportMatchAnalysisSchema>;
export type ReportMatchesResult = { matches: RankedReport[]; analysis: ReportMatchAnalysis };


export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Browser-only API adapter; uses the existing cookie session, never service keys. */
export class LostSignalApi {
  private fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = (...args) => fetch(...args)) { this.fetcher = fetcher; }

  private async request<T>(url: string, schema: z.ZodType<T>, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await this.fetcher(url, { ...init, signal, credentials: "same-origin", cache: "no-store" });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ApiError("The server returned an unreadable response. Please retry.", response.status); }
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(body);
      throw new ApiError(response.status === 401 ? "Your session has expired. Sign in again." :
        error.success ? error.data.error : `Request failed (${response.status})`, response.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError("The server response does not match the API contract.", 502);
    return parsed.data;
  }

  async reports(signal?: AbortSignal): Promise<Report[]> {
    return (await this.request("/api/reports", z.object({ reports: z.array(ReportSchema) }), { signal })).reports;
  }
  async claims(signal?: AbortSignal): Promise<Claim[]> {
    return (await this.request("/api/claims", z.object({ claims: z.array(ClaimSchema) }), { signal })).claims;
  }
  async createReport(payload: NewReport): Promise<Report> {
    return (await this.request("/api/reports", z.object({ report: ReportSchema }), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    })).report;
  }
  async uploadPhoto(id: string, file: File): Promise<void> {
    const form = new FormData(); form.set("image", file);
    await this.request(`/api/reports/${encodeURIComponent(id)}/image`, z.object({
      image_path: z.string(), signed_url: z.string().url(), expires_in: z.number(),
    }), { method: "POST", body: form });
  }
  async photoUrl(id: string, signal?: AbortSignal): Promise<string> {
    return (await this.request(`/api/reports/${encodeURIComponent(id)}/image`, z.object({
      signed_url: z.string().url(), expires_in: z.number(),
    }), { signal })).signed_url;
  }
  async submitClaim(report_id: string, proof: string): Promise<Claim> {
    return (await this.request("/api/claims", z.object({ claim: ClaimSchema }), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id, proof }),
    })).claim;
  }
  async decideClaim(id: string, status: "approved" | "rejected"): Promise<Claim> {
    return (await this.request(`/api/claims/${encodeURIComponent(id)}`, z.object({ claim: ClaimSchema }), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    })).claim;
  }
  /** Match a saved report against opposite-type reports in Supabase using optional Gemini enrichment. */
  async reportMatches(reportId: string, reports: readonly Report[]): Promise<ReportMatchesResult> {
    const response = await this.request(
      `/api/reports/${encodeURIComponent(reportId)}/matches`,
      z.object({
        source_report_id: z.string().uuid(),
        count: z.number().int().min(0),
        matches: z.array(z.object({
          report_id: z.string().uuid(),
          score: z.number().min(0).max(100),
          reasons: z.array(z.string()),
        })),
        analysis: ReportMatchAnalysisSchema,
      }), {}, 90_000,
    );
    if (response.source_report_id !== reportId) {
      throw new ApiError("Matching returned the wrong source report.", 502);
    }
    const byId = new Map(reports.map(report => [report.id, report]));
    const matches = response.matches.map(match => {
      const report = byId.get(match.report_id);
      if (!report) throw new ApiError("Refresh reports before viewing matches.", 409);
      return { report, score: match.score, reasons: match.reasons };
    });
    return { matches, analysis: response.analysis };
  }
  async matches(description: string, reports: readonly Report[], attributes: { category?: string; color?: string; brand?: string } = {}): Promise<RankedReport[]> {
    // Free-text quick search remains available; saved reports use reportMatches above.
    const candidates = reports.filter(r => r.report_type === "found" && r.status === "open");
    const source: Item = { id: "search", reportType: "lost", status: "open", description,
      category: known(attributes.category), color: known(attributes.color), brand: known(attributes.brand) };
    const results: RankedReport[] = [];
    for (let start = 0; start < candidates.length; start += 25) {
      const batch = candidates.slice(start, start + 25);
      const response = await this.request("/api/matches", z.object({
        success: z.literal(true), matches: z.array(z.object({
          item: z.object({ id: z.string() }), score: z.number().min(0).max(100), reasons: z.array(z.string()),
        })),
      }), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, candidates: batch.map(toMatchingItem) }) });
      for (const match of response.matches) {
        const report = batch.find(r => r.id === match.item.id);
        if (!report) throw new ApiError("Matching returned an unknown report.", 502);
        results.push({ report, score: match.score, reasons: match.reasons });
      }
    }
    return results.sort((a, b) => b.score - a.score || a.report.id.localeCompare(b.report.id)).slice(0, 10);
  }
}

function known(value: string | null | undefined): string | undefined {
  return value && value.trim().toLowerCase() !== "unknown" ? value : undefined;
}
export function toMatchingItem(report: Report): Item {
  const attributes = report.ai_attributes;
  return {
    id: report.id, reportType: report.report_type,
    status: report.status === "open" ? "open" : "resolved",
    description: report.description.slice(0, 2000),
    category: known(report.category)?.slice(0, 100),
    location: report.location.slice(0, 200),
    color: known(attributes?.color)?.slice(0, 100), brand: known(attributes?.brand)?.slice(0, 100),
    features: attributes?.features?.slice(0, 20).map(f => f.slice(0, 200)),
  };
}

/** Creation is confirmed independently of upload; callers retain this ID on failure. */
export async function saveReport(api: LostSignalApi, payload: NewReport, photo: File | null, saved?: Report) {
  const report = saved ?? await api.createReport(payload);
  if (photo) {
    try { await api.uploadPhoto(report.id, photo); }
    catch (error) { return { report, uploadError: error instanceof Error ? error.message : "Photo upload failed" }; }
  }
  return { report, uploadError: null };
}

/** Case-insensitive category options, retaining familiar built-in labels. */
export function browseCategories(reports: readonly Report[], defaults: readonly string[]): string[] {
  const labels = new Map<string, string>();
  for (const value of [...defaults, ...reports.map(report => report.category)]) {
    const label = value.trim();
    if (label && !labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label);
  }
  return ["All", ...labels.values()];
}

export function browseReports(reports: readonly Report[], category = "All", query = ""): Report[] {
  const search = query.trim().toLowerCase();
  const chosenCategory = category.trim().toLowerCase();
  return reports.filter(r => r.report_type === "found" && r.status === "open" &&
    (chosenCategory === "all" || r.category.trim().toLowerCase() === chosenCategory) &&
    `${r.title} ${r.description} ${r.location} ${r.category}`.toLowerCase().includes(search));
}
