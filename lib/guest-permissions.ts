/** Supabase anonymous sessions are authenticated, but are not permanent accounts.
 * Fail closed for write permissions if the verified user is missing this flag.
 * Only pass a user returned by supabase.auth.getUser(), never client-provided JSON.
 */
export function canWriteAsPermanentUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
  return user?.is_anonymous === false;
}

export function permanentAccountRequired(): Response {
  return Response.json(
    { error: "Create or sign in to a permanent account to post items or manage claims." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
