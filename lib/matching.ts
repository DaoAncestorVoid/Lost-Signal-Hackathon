import type { Item, ItemMatch } from "@/types/item";

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "for", "found", "i", "in", "is", "it",
  "lost", "my", "of", "on", "the", "to", "was", "with",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(values: string[]): Set<string> {
  return new Set(
    values.flatMap((value) => normalize(value).split(/\s+/))
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / (left.size + right.size - intersection);
}

/** Base evidence weights: category 35, color 20, brand 20, features 15,
 * description 10. Report-title similarity adds up to 50 for distinctive titles; location up to 10;
 * event-time proximity up to 12. Positive evidence is capped at 100 before
 * subtracting contradictory-time penalties. The number is a
 * similarity ranking, NEVER an ownership probability. Unknown fields are neutral.
 */
export function scoreMatch(source: Item, candidate: Item): ItemMatch {
  const reasons: string[] = [];
  if (
    source.id === candidate.id ||
    source.reportType === candidate.reportType ||
    source.status !== "open" || candidate.status !== "open"
  ) {
    return { item: candidate, score: 0, reasons };
  }

  const leftTitle = tokens([source.title ?? ""]);
  const rightTitle = tokens([candidate.title ?? ""]);
  const distinctiveExactTitle = leftTitle.size >= 2 &&
    leftTitle.size === rightTitle.size &&
    [...leftTitle].every(token => rightTitle.has(token));

  let earned = 0;
  let timePenalty = 0;
  for (const [field, weight] of [
    ["category", 35], ["color", 20], ["brand", 20],
  ] as const) {
    const left = normalize(source[field] ?? "");
    const right = normalize(candidate[field] ?? "");
    if (!left || !right) continue;
    if (left === right) {
      earned += weight;
      reasons.push(`Same ${field}: ${candidate[field]}`);
    } else if (field === "category") {
      // Categories can be user-selected inconsistently. Only override this
      // mismatch when the exact multi-word item name is distinctive.
      if (!distinctiveExactTitle) return { item: candidate, score: 0, reasons: [] };
      reasons.push("Different report categories — verify details");
    }
  }

  const leftFeatures = tokens(source.features ?? []);
  const rightFeatures = tokens(candidate.features ?? []);
  if (leftFeatures.size && rightFeatures.size) {
    const similarity = overlap(leftFeatures, rightFeatures);
    earned += 15 * similarity;
    if (similarity > 0) reasons.push("Shared distinguishing features");
  }

  const leftDescription = tokens([source.description]);
  const rightDescription = tokens([candidate.description]);
  if (leftDescription.size && rightDescription.size) {
    const similarity = overlap(leftDescription, rightDescription);
    earned += 10 * similarity;
    if (similarity > 0) reasons.push("Similar description");
  }

  // Titles are especially useful for manually entered reports where AI
  // extraction is missing. Exact matching titles are meaningful even when
  // the two descriptions have different levels of detail.
  if (leftTitle.size && rightTitle.size) {
    const similarity = overlap(leftTitle, rightTitle);
    if (similarity > 0) {
      // A descriptive exact title ("SpongeBob scooter") is stronger than a
      // generic single word ("keys"). Avoid awarding 50 for generic names.
      const distinctive = Math.min(leftTitle.size, rightTitle.size) >= 2;
      earned += (distinctive ? 50 : 22) * similarity;
      reasons.push(similarity === 1 ? "Matching item name" : "Similar item name");
    }
  }

  // Compare when the item was lost against when it was found, not when the
  // user submitted a report. Missing/invalid dates are NOT interpreted as now.
  const lost = source.reportType === "lost" ? source : candidate;
  const found = source.reportType === "found" ? source : candidate;
  const lostTime = lost.itemDate ? Date.parse(lost.itemDate) : NaN;
  const foundTime = found.itemDate ? Date.parse(found.itemDate) : NaN;
  if (earned > 0 && Number.isFinite(lostTime) && Number.isFinite(foundTime)) {
    const gapHours = (foundTime - lostTime) / 3_600_000;
    if (gapHours >= -3 && gapHours <= 24) {
      earned += 12;
      reasons.push("Lost and found times are close");
    } else if (gapHours > 24 && gapHours <= 168) {
      earned += 8;
      reasons.push("Found within a week of the loss");
    } else if (gapHours > 168 && gapHours <= 720) {
      earned += 4;
      reasons.push("Found within a month of the loss");
    } else if (gapHours < -3) {
      timePenalty = 12;
      reasons.push("Found time predates reported loss");
    }
  }

  // Token overlap allows "Main Library entrance" and "Main Library lobby"
  // to contribute partial evidence without requiring exact location agreement.
  const locationSimilarity = overlap(
    tokens([source.location ?? ""]),
    tokens([candidate.location ?? ""]),
  );
  if (earned > 0 && locationSimilarity > 0) {
    earned += 10 * locationSimilarity;
    reasons.push("Similar campus location");
  }

  return {
    item: candidate,
    score: Math.max(0, Math.min(100, Math.round(earned)) - timePenalty),
    reasons,
  };
}

/** Return open reports of the opposite type, ordered by descending similarity. */
export function findMatches(
  source: Item,
  candidates: readonly Item[],
  options: { minScore?: number; limit?: number } = {},
): ItemMatch[] {
  const { minScore = 30, limit = 10 } = options;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    throw new RangeError("minScore must be between 0 and 100");
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("limit must be a nonnegative integer");
  }

  return candidates
    .map((candidate) => scoreMatch(source, candidate))
    .filter((match) => match.score > 0 && match.score >= minScore)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit);
}
