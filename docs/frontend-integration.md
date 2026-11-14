# Frontend/backend integration

Changes are local on `frontend-backend-integration`. No commits, pushes, merges,
backend API changes, migrations, policy changes, or dependency/lockfile changes
are required. `package.json` only expands `npm test` to include the existing
claim/image tests alongside the new frontend tests.

## Implemented flows and contracts

- Authentication: the existing Supabase browser client handles email/password
  sign-in, sign-up, email confirmation messages, sign-out and session changes.
  Private workspace state is unmounted on sign-out/account changes. Missing
  configuration is shown explicitly, with credential submission disabled.
- Browsing: authenticated `GET /api/reports` is the sole source of report data.
  The backend requires sign-in; anonymous browsing is deliberately not added.
  Browse displays only open found reports returned under the existing RLS.
  Search/categories use real title, description, location and category fields.
  My items displays the user's reports, including non-open/lost reports.
  Database UUIDs identify all items. Loading, empty, malformed-response, session,
  network and retry states are distinct; no fake reports are substituted.
- Photos: `GET /api/reports/[id]/image` supplies private signed URLs. Images
  renew after four minutes and report unavailable photos without inventing
  placeholders that resemble uploaded photos. No raw storage URL is inferred.
- Submission: the form reuses `validateNewReport`, then calls `POST /api/reports`
  with `report_type`, `title`, `description`, `category`, and `location` only.
  The prototype's unsupported held-at field is replaced by the real required
  description, whose prompt lets users describe where the item is held.
  No AI or status fields are forged. The existing validator checks photo MIME,
  magic bytes, non-empty contents and the 5 MiB limit before submission.
- Uploads: one photo is sent as multipart `image` to
  `POST /api/reports/[id]/image` after report creation. A failed upload retains
  the confirmed report ID and form; retry uploads the photo against that ID
  rather than creating another report. Users can explicitly finish without
  a confirmed photo. Successful creation and partial success are distinguished.
  The list refreshes after a write; refresh failures are shown separately.
  Object URL previews are revoked on replacement/reset/workspace unmount.
- Claims: `GET /api/claims` supplies RLS-filtered status/proof. Claim submission
  reuses `validateNewClaim` and calls `POST /api/claims` with `report_id` and
  `proof`. Pending/approved/rejected states come from the server. Existing
  claims, claims-loading failures, own reports and non-open/non-found reports
  cannot be submitted through the UI. Only report owners see decision buttons;
  those use `PATCH /api/claims/[id]`. The backend remains the authority on access
  and concurrent decisions. No claims are approved automatically.
- Matching: `POST /api/matches` exists; no report-specific matches GET exists.
  Search requires a category and accepts color/brand plus a description. This
  supplies enough structured evidence for the existing weighted threshold;
  description-only scores cannot pass it. Candidates are authorized open found
  reports, mapped to shared matching types and sent in batches of at most 25.
  The top ten overall scores and server explanations are displayed. Unknown
  AI attributes are omitted; database JSONB is not assumed to match one schema.
  This is weighted matching, not Gemini inference; the UI says so and sends
  no Gemini requests. Existing Gemini endpoints and code are unchanged.
- Messages: no backend routes or schema exist. The navigation and unavailable
  composer remain visible, with sending disabled. Seed conversations and
  in-memory fake sends were removed.
- Design: existing mobile layout, bottom navigation, red/black/white palette,
  CSS classes and dark/light mode are retained. Tailwind's import is restored,
  inputs have keyboard focus states, image selection is keyboard-accessible,
  account text wraps, and page/metadata consistently say Lost Signal.

## Files

- `app/page.tsx`: replaces prototype state with the real flows above.
- `app/components/auth.tsx`: authentication subscription and credential form.
- `app/components/report-photo.tsx`: signed-photo lifecycle and failures.
- `app/components/report-card.tsx`: reusable cards and browse state rendering.
- `lib/frontend-api.ts`: validated API adapter, report/matching mapping,
  filtering and partial upload orchestration. It imports no Gemini server code.
- `app/globals.css`: Tailwind import, focus/disabled states and layout fixes.
- `app/layout.tsx`: consistent metadata branding.
- `package.json`: include existing backend unit tests in the test command.
- `tests/frontend-api.test.mjs`: report creation/fetch, upload retries,
  authentication failures, claims and matching contracts using mocked HTTP.
- `tests/frontend-render.test.mjs`: real card/form and browse-state rendering.
- This document: contracts, remaining blockers and manual checks.

## Verification limits and remaining work

Final local results: `npm run typecheck` passed; `npm run lint` passed with
the existing unused `_headers` warning in `lib/supabase/server.ts`; `npm test`
passed all 32 tests; `npm run build` passed. Node emits the existing typeless
ES-module warning during tests. No package-lock changes were made.

Local Supabase URL/publishable-key variables are absent. Live sign-in, RLS,
report persistence, signed Storage delivery and the two-account claim workflow
have **not** been verified against a running Supabase project. Automated HTTP
contract tests use mocks only within tests; application requests never do.
There is no browser automation installed, so interaction/visual checks must
also be performed manually. The production build and server-render tests do
not prove an end-to-end deployed workflow.

Messaging and report-based `GET /api/reports/[id]/matches` are missing backend
features. Existing POST matching is fully wired without inventing either API.
AI enrichment persistence is not exposed by the report creation API; this UI
does not attempt to write protected `ai_attributes` fields or spend Gemini
quota enriching every candidate. Report deletion is not exposed by an API,
so the prototype's local-only Remove action was removed.

Backend requests are cookie-authenticated and retain existing RLS. Configure
the Supabase Auth site URL/allowed confirmation redirects for the deployment.
No secret/service-role key belongs in NEXT_PUBLIC variables. API errors stay
visible, and session-dependent actions verify the current user before writing.
The browser's state is not an authorization boundary; the backend enforces it.

The existing report POST has no idempotency-key contract. If the connection
fails after an unconfirmed create request, inspect My items before retrying:
the UI cannot know whether the server committed a request whose response was
lost. Photo retry after a confirmed creation is protected from duplicate
creation. Existing backend validation/RPCs prevent duplicate claims and enforce
owner-only decisions. No database behavior was changed to mask these limits.

## Manual test instructions

1. In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the existing project. Leave
   Gemini secrets server-side. Ensure the team's existing report, image Storage
   and claim-workflow migrations have been applied to that project; this change
   does not apply them. Configure localhost/deployment Auth redirects.
2. Run `npm run dev`, open the printed localhost URL, and check mobile width.
   Sign up as student A and confirm email if required. Sign in. An empty project
   should show an empty state, not seed reports; a failed API must show an error.
3. Tap +. Enter a title, required public description, category and location.
   Choose a real PNG/JPEG/WebP no larger than 5 MiB. Replace the photo and verify
   the preview changes. Submit once. Confirm the saved message, My items entry,
   database report row and private Storage image. Refresh the page and verify
   persistence. Own items must not offer a claim submission form.
4. Test an unsupported/oversize photo and missing required fields; no false
   success should appear. To test partial success, block only the image POST in
   browser DevTools, then submit a valid report/photo. Check that the report ID
   is retained, unblock uploads, and retry. Confirm there is only one report.
   Also test the explicit finish-without-photo path.
5. Sign out and use a separate browser/incognito window as student B. Browse A's
   open found report, search/filter it, and verify the actual photo loads. Open
   it, supply private ownership proof, and request the claim. Confirm pending
   status survives reload and another submission form is unavailable.
6. Return to A, open My items and the report, review B's proof, and approve or
   reject through the visible controls. Refresh B's claims and verify the server
   status. An approved/resolved report should disappear from open browsing.
7. Open AI search, select the report's exact category and enter its description
   and any known color/brand. Inspect Network for `POST /api/matches` (not a
   nonexistent matches GET or Gemini call). Verify score/explanation and the
   empty/error states. Choose Messages and verify sending is unavailable.
8. Toggle dark mode, refresh, and test keyboard focus and narrow-screen bottom
   navigation. Sign out and verify private workspace data disappears. Test an
   expired session/network failure and confirm a visible error rather than
   success or fabricated data.
9. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
