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

/** Fixed evidence weights: category 35, color 20, brand 20, features 15,
 * description 10. Missing evidence earns no points rather than inflating scores.
 * Location adds up to 10 bonus points, capped at 100, only with item evidence.
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

  let earned = 0;
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
      // Explicitly different categories should never be suggested as matches.
      return { item: candidate, score: 0, reasons: [] };
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
    score: Math.min(100, Math.round(earned)),
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
