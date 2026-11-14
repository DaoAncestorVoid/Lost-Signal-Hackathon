# PR #6 AI review and integration notes

Scope: https://github.com/DaoAncestorVoid/Lost-Signal-Hackathon/pull/6

The weighted matcher, shared item types, matching route and original matching
tests are preserved. No frontend, database migrations, or existing Supabase
backend source is changed.

## Endpoint changes

Both analysis routes call the existing cookie-based Supabase server client and
verify the session with `auth.getUser()` before reading request data or calling
Gemini. Requests without a valid session receive 401. Explicit cross-origin
requests receive 403. Non-browser tools must send a valid Supabase session cookie;
these routes do not add a separate bearer-token authentication contract.

The two routes share process-local fixed-window quotas: 10 attempts per user
per minute and 60 per process per minute, including malformed authenticated
requests. Rejections return 429 and Retry-After. Expired entries are removed;
the global quota bounds active entries. These limits reset on restart and are
not a distributed production quota. Gemini retries are disabled to avoid
amplifying overload or quota failures; individual calls have a 15-second timeout.

Text request bodies are bounded to 16 KiB and descriptions to 2,000 characters.
Multipart bodies are bounded to 5 MiB plus 64 KiB envelope overhead. Both
Content-Length and actual streamed bytes are checked. Exactly one image is
accepted. The existing Supabase image validator enforces the same 5 MiB file
limit, JPEG/PNG/WebP types and magic-byte checks. No upload limit divergence.

Both models request JSON-schema output and validate it locally with the same
Zod schema: `{ category: string, color: string, brand: string | null,
features: string[] }`. Unknown category/color use `Unknown`, unknown brand uses
null, and unknown features use an empty array. Output string/array lengths are
bounded. Text responses retain `analysis` as a structured object and add
`attributes`, matching the image response key. Consumers expecting prose in
`analysis` must adapt. Analysis responses use no-store. Raw provider errors and
user data are not logged. Interactions use `store: false`; development mock
image mode is ignored in production.

## Verification

`npm test` runs the original eight matcher tests plus session, cross-origin,
quota, bounded-body, structured-output and image-validation tests. Session tests
mock Supabase, not live authentication. A production build is also required.

`node --env-file=.env.local --experimental-strip-types scripts/verify-gemini.mjs`
explicitly disables mock mode, checks the configured model with the API, then
makes real text and image requests. The image is Google's public scones photo
at https://storage.googleapis.com/generativeai-downloads/images/scones.jpg;
no user photo is uploaded by this smoke test. It is opt-in, billable, and
excluded from the default test suite. `GEMINI_MODEL` may override the default
`gemini-3.8-flash`; credentials must remain server-side.

Local review results (2026-11-14): TypeScript passed, all 14 tests passed
(including the unchanged eight matching tests), and the production build passed.
Lint passed with the pre-existing unused `_headers` warning in
`lib/supabase/server.ts`. Node's test runner also emits the existing typeless
ES-module warning; it does not fail the tests.

The live model metadata request succeeded for `models/gemini-3.8-flash`.
An initial real text request returned 503 high demand and the real image call
timed out. With automatic retries disabled, both final non-mock requests
returned 429: the key's 20-request daily free-tier model quota was exhausted.
The public photograph was downloaded and submitted to Gemini; this was not a
mock result. Successful provider-side structured text/image output remains a
merge verification blocker until quota resets or a funded key is supplied.
The metadata check confirms model availability, not successful inference.

## Remaining Supabase integration (separate from AI analysis)

- Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
  Neither exists in the current local env file. Verify a real signed-in and
  expired session against both endpoints on the target Supabase project.
- The analysis routes only return suggestions. Persist user-confirmed
  attributes through the existing report API and ownership/RLS controls.
  No service-role bypass or automatic report writes were added.
- Map database `report_type` into matching `reportType` and resolution status
  into `open`/`resolved`. Convert unknown brand null to an omitted Item.brand
  and avoid treating `Unknown` as strong matching evidence. Source candidates
  from authorized open opposite-type reports; the current matches endpoint
  still takes client-supplied reports rather than loading Supabase candidates.
- Connect the authenticated upload/report workflow to analysis without making
  private Storage URLs public. Verify existing Storage/RLS behavior separately.
- Before multi-instance deployment, enforce distributed account/global quotas
  and ingress body/time limits using hosting infrastructure or a shared store.
  Account creation controls and provider budget caps are also deployment work.

These integration tasks require no matcher dependency on Gemini or Supabase.
