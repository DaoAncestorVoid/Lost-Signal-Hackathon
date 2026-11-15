import type { Claim, Report } from "@/lib/frontend-api";

export type ChatMessage = {
  id: string;
  claim_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function canMessageOnClaim(
  claim: Pick<Claim, "claimant_id" | "report_id" | "status">,
  report: Pick<Report, "user_id" | "report_type"> | undefined,
  userId: string
): boolean {
  return !!report && report.report_type === "found"
    && (claim.status === "pending" || claim.status === "approved")
    && (claim.claimant_id === userId || report.user_id === userId)
    && claim.claimant_id !== report.user_id;
}

export function normalizeMessageBody(body: string): string | null {
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
}
