export type ClaimStatus = "pending" | "approved" | "rejected";
export function editConflict(status: string, claims: readonly { status: string }[]): string | null {
  if (status !== "open") return "Closed reports cannot be edited";
  if (claims.some(claim => claim.status === "pending" || claim.status === "approved")) return "Reports with active claims cannot be edited";
  return null;
}
export function deleteConflict(claims: readonly { status: string }[]): string | null {
  return claims.length ? "Reports with claims cannot be deleted. Claim evidence must be preserved." : null;
}
export function deleteConfirmation(title: string): string {
  return `Permanently delete “${title}”? This cannot be undone. Reports with claims must remain available as evidence.`;
}
