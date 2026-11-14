/** Process-local limits shared across both routes; use distributed limits for
 * multiple instances. User identities come from Supabase, never client headers. */
export class AnalysisLimiter {
  private users = new Map<string, { count: number; reset: number }>();
  private global = { count: 0, reset: 0 };

  take(userId: string, now = Date.now(), perUserLimit = 10): number {
    for (const [id, entry] of this.users) {
      if (entry.reset <= now) this.users.delete(id);
    }
    if (this.global.reset <= now) this.global = { count: 0, reset: now + 60_000 };
    const user = this.users.get(userId) ?? { count: 0, reset: now + 60_000 };
    if (user.count >= perUserLimit || this.global.count >= 60) {
      const reset = user.count >= perUserLimit ? user.reset : this.global.reset;
      return Math.max(1, Math.ceil((reset - now) / 1000));
    }
    user.count++;
    this.global.count++;
    this.users.set(userId, user);
    return 0;
  }
}

export class AnalysisRequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Bound actual streamed bytes, including requests without Content-Length. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new AnalysisRequestError(413, "Request body is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AnalysisRequestError(400, "Request body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AnalysisRequestError(413, "Request body is too large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}
