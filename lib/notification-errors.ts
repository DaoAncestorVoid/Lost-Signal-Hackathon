/** Log database codes, never message bodies, account data or private proof. */
export function notificationDatabaseError(scope: string, error: { code: string }) {
  console.error("Notification database failure", { scope, code: error.code });
  const missing = ["PGRST205", "42P01", "PGRST202"].includes(error.code);
  return Response.json({ error: missing
    ? "Notifications require pending Supabase migrations. Ask the project maintainer to apply them."
    : "Unable to load notifications. Please retry; the server log contains the database error code." },
  { status: missing ? 503 : 500, headers: { "Cache-Control": "no-store" } });
}
