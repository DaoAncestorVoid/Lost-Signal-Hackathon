import { scoreMatch } from "./matching";
import type { Report } from "./frontend-api";
import type { Item } from "../types/item";

export const MIN_NOTIFICATION_SCORE = 50;
function known(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !/^(other|unknown|n\/a)$/i.test(trimmed) ? trimmed : undefined;
}
function evidence(report: Report): Item {
  const attributes = report.ai_attributes;
  return {
    id: report.id, reportType: report.report_type,
    status: report.status === "open" ? "open" : "resolved",
    title: report.title,
    itemDate: report.item_date,
    description: `${report.title} ${report.description}`,
    category: known(report.category),
    location: report.location,
    color: known(attributes.color),
    brand: known(attributes.brand),
    features: attributes.features?.filter(feature => known(feature)),
  };
}

export function potentialNotification(lost: Report, found: Report, recipientId: string): number | null {
  if (lost.report_type !== "lost" || found.report_type !== "found" || lost.status !== "open" || found.status !== "open") return null;
  if (lost.user_id !== recipientId || found.user_id === recipientId || Date.parse(found.created_at) <= Date.parse(lost.created_at)) return null;
  // Automated push-style suggestions stay conservative when manually selected
  // categories disagree; users can still explore distinctive matches in search.
  const lostCategory = known(lost.category)?.toLowerCase();
  const foundCategory = known(found.category)?.toLowerCase();
  if (lostCategory && foundCategory && lostCategory !== foundCategory) return null;
  const score = scoreMatch(evidence(lost), evidence(found)).score;
  return score >= MIN_NOTIFICATION_SCORE ? score : null;
}

export function newPotentialPairs(lostReports: readonly Report[], foundReports: readonly Report[], recipientId: string, existing: ReadonlySet<string>) {
  const seen = new Set(existing);
  const pairs: Array<{ lost_report_id: string; found_report_id: string; score: number }> = [];
  for (const lost of lostReports) for (const found of foundReports) {
    const key = `${lost.id}:${found.id}`;
    if (seen.has(key)) continue;
    const score = potentialNotification(lost, found, recipientId);
    if (score === null) continue;
    pairs.push({ lost_report_id: lost.id, found_report_id: found.id, score });
    seen.add(key);
  }
  return pairs;
}

export function notificationIsVisible(lost: Report | undefined, found: Report | undefined, recipientId: string): found is Report {
  return Boolean(lost && found && lost.status === "open" && found.status === "open" && lost.user_id === recipientId && found.user_id !== recipientId);
}
