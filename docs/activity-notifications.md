# Messaging and notification updates

## Diagnosed hosted failure (November 15, 2026)

Read-only requests to the configured Supabase REST endpoint returned PGRST205
for both public.notifications and public.activity_notifications: neither table
was available in the schema cache. The Auth settings endpoint returned 200;
anonymous access to messages returned 42501 (permission denied), as expected.
No signed-in session was supplied, so authenticated Auth/RLS was not tested
against the hosted project. This diagnosis does not establish migration history:
verify the target project's history and schema before applying anything.

The API now returns 503 with a migration-required explanation for missing tables
or functions. Other database failures remain errors and log only a database code.
RLS remains enabled. Validation failures remain distinct API-contract errors.

## Deployment prerequisite

Review the target project and its pending migrations, including the existing
20261115041000_match_notifications.sql and
20261115070000_claim_message_notifications.sql, followed by the new additive
20261115120000_conversation_reads_and_claim_events.sql.
Use the Supabase migration workflow only after reviewing the correct project.
No hosted migration was applied by this implementation. Do not edit old migrations,
overwrite notification rows, or alter migration-history records to hide failures.

## Behavior and security

- Existing deterministic matches remain in notifications and require no Gemini calls.
- Existing trusted triggers create new claim and message activity records.
- New trusted update trigger creates approval, rejection and handoff events.
  A unique (claim_id, kind) index prevents duplicate non-message events.
  Existing claim uniqueness and message primary keys preserve event identity.
- conversation_reads stores each participant's read cursor. RLS restricts reads
  and writes to the current permanent participant; invoker RPCs retain RLS.
- conversation_summaries returns one latest preview and incoming unread count per
  permitted conversation. It does not download all message bodies to the browser.
- mark_conversation_read validates a loaded message and advances the cursor
  monotonically. Acknowledging an older snapshot leaves newer messages unread.
- Only the visible, explicitly selected, successfully loaded thread acknowledges
  messages. Background summaries and opening the bell never mark messages read.
- The bell replaces individual message activity rows with one alert per unread
  conversation. Opening that conversation clears the shared message alert after
  successful loading. Other alerts provide an explicit Mark read action.
- Claim alerts open the report, refresh its claims and highlight the relevant claim.
- One account-scoped provider refreshes all counts every 12 seconds while visible,
  on focus and on returning to the tab. Matching refreshes every two minutes and
  cannot block the unread request. Sign-out/account changes discard shared state.
- Existing pending/approved messaging eligibility is preserved. Rejected claims
  close their chat as before; rejected/decision events still open the report.
- No proof, account details or message bodies are copied into notification alerts.
- Old messages with no read cursor initially count as unread. Existing event rows
  are preserved. Old claim decisions/handoffs are not backfilled.
- Read state is durable across sessions/devices. Loaded threads show the latest
  100 messages, as before; opening acknowledges through the latest loaded message.

## Verification

Run npm run typecheck, npm run lint, npm test and npm run build.
The optional scripts/verify-inbox-db.mjs runs migrations and RLS regressions in
an isolated embedded PostgreSQL instance. It never connects to Supabase.
Install @electric-sql/pglite into a temporary directory and set PGLITE_MODULE to
the file URL of its dist/index.js, then run node scripts/verify-inbox-db.mjs.
It simulates verified JWT identities, not real Supabase Auth sessions.

After applying reviewed migrations, test with real permanent accounts A and B:

1. A posts two found reports; B claims each. A gets two ownership requests.
2. B sends 2 messages in one thread and 1 in the other. A's Messages badge is 3;
   the bell has two grouped message alerts plus the ownership requests.
3. Open the 2-message thread: Messages becomes 1 and the other thread stays unread.
   Reload and use another device; the cursor persists. A's own replies do not count.
4. Leave the conversation while it loads; it must not mark the abandoned request
   read. Send a new message during loading; later messages must remain unread.
5. Approve one claim and reject another. B gets one event per decision. Retry the
   requests; duplicate events must not appear. Confirm receiving the approved item;
   A receives one handoff event. Automatic rejection of competing claims also alerts.
6. Open the bell: alerts stay unread. Mark one non-message alert read explicitly.
7. Verify match alerts, keyboard controls and desktop/390px layouts.
8. With unrelated account C and a guest, forge direct RPC/read-state/notification
   requests: no private rows or writes should be permitted.

Hosted two-account tests and browser layout inspection require appropriate account
sessions and browser tooling; these were unavailable during implementation.
