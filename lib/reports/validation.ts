export type NewReport = {
  report_type: "lost" | "found";
  title: string;
  description: string;
  category?: string;
  location: string;
  item_date?: string | null;
};

type ValidationResult =
  | { data: NewReport; error?: never }
  | { data?: never; error: string };

const allowedFields = new Set([
  "report_type",
  "title",
  "description",
  "category",
  "location",
  "item_date",
]);

function requiredText(value: unknown, name: string, max: number): string | null {
  if (typeof value !== "string") return `${name} must be a string`;
  const length = value.trim().length;
  if (length < 1 || length > max) {
    return `${name} must be between 1 and ${max} characters`;
  }
  return null;
}

export function validateNewReport(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Request body must be a JSON object" };
  }

  const body = value as Record<string, unknown>;
  const unsupported = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unsupported) return { error: `Unsupported field: ${unsupported}` };

  if (body.report_type !== "lost" && body.report_type !== "found") {
    return { error: "report_type must be lost or found" };
  }

  for (const [name, max] of [
    ["title", 120],
    ["description", 3000],
    ["location", 200],
  ] as const) {
    const error = requiredText(body[name], name, max);
    if (error) return { error };
  }

  if (body.category !== undefined) {
    const error = requiredText(body.category, "category", 60);
    if (error) return { error };
  }

  if (body.item_date !== undefined && body.item_date !== null) {
    if (
      typeof body.item_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.item_date) ||
      Number.isNaN(Date.parse(body.item_date))
    ) {
      return { error: "item_date must be an ISO 8601 timestamp with a timezone" };
    }
  }

  const data: NewReport = {
    report_type: body.report_type,
    title: (body.title as string).trim(),
    description: (body.description as string).trim(),
    location: (body.location as string).trim(),
  };

  if (body.category !== undefined) data.category = (body.category as string).trim();
  if (body.item_date !== undefined) data.item_date = body.item_date as string | null;

  return { data };
}
