/** Approved claims on found reports count toward Karma.
 * Approval alone does not verify a completed physical handoff.
 */
export const KARMA_PER_APPROVED_CLAIM = 50;

export const KARMA_BADGES = [
  { id: "first-signal", label: "First Signal", emoji: "🤝", threshold: 1 },
  { id: "campus-hero", label: "Campus Hero", emoji: "🌟", threshold: 5 },
  { id: "lost-legend", label: "Lost Legend", emoji: "🏆", threshold: 10 },
] as const;

export function karmaFromApprovedClaims(approvedClaims: number) {
  if (!Number.isSafeInteger(approvedClaims) || approvedClaims < 0) {
    throw new Error("Invalid approved-claim count");
  }
  const points = approvedClaims * KARMA_PER_APPROVED_CLAIM;
  if (!Number.isSafeInteger(points)) throw new Error("Karma points overflow");

  const badges = KARMA_BADGES.map(badge => ({
    ...badge,
    unlocked: approvedClaims >= badge.threshold,
  }));
  const nextBadge = badges.find(badge => !badge.unlocked) ?? null;

  return {
    approvedClaims,
    points,
    badges,
    nextBadge: nextBadge ? { id: nextBadge.id, label: nextBadge.label, remaining: nextBadge.threshold - approvedClaims, threshold: nextBadge.threshold } : null,
  };
}
