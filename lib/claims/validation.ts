const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function validateNewClaim(value: unknown):
  | { data: { report_id: string; proof: string }; error?: never }
  | { data?: never; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Request body must be a JSON object" };
  }

  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "report_id" && key !== "proof")) {
    return { error: "Unsupported claim field" };
  }
  if (typeof body.report_id !== "string" || !isUuid(body.report_id)) {
    return { error: "report_id must be a UUID" };
  }
  if (typeof body.proof !== "string" || body.proof.trim().length < 1 || body.proof.trim().length > 2000) {
    return { error: "proof must be between 1 and 2000 characters" };
  }
  return { data: { report_id: body.report_id, proof: body.proof.trim() } };
}

export function validateDecision(value: unknown):
  | { status: "approved" | "rejected"; error?: never }
  | { status?: never; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Request body must be a JSON object" };
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || (body.status !== "approved" && body.status !== "rejected")) {
    return { error: "status must be approved or rejected" };
  }
  return { status: body.status };
}
