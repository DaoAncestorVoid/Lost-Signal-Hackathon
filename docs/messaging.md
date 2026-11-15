# Secure messaging implementation

Claim-based messaging lets the finder of a **found** report communicate privately
with the person who submitted an ownership claim. There is **no public user search**.

## Setup

1. Merge or check out `feature/secure-claim-messaging` locally.
2. Run `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
3. Check the migration with `npx supabase db push --remote --dry-run` against
   the **intended** Supabase project. Review all pending changes.
4. When ready, apply the pending approved migration using
   `npx supabase db push --remote`.
5. After deployment, verify the live app uses the same database as the migration.

## Usage

- A permanent account posts a found item.
- Another permanent account submits a claim on it.
- Both accounts open **Messages** from navigation, or **Message finder /
  Message claimant** in claim details.
- Messages are saved in `public.messages`. The current conversation refreshes
  while visible every five seconds; this does not require enabling Realtime.
- Approved claims retain messaging to coordinate handoff; rejected claims do not.
- On small screens the inbox is stacked above the conversation.

## Security checks (required)

Use three different signed-in accounts, plus an anonymous guest.

- Account A creates a found report; B claims it. A and B can read/send in that claim.
- Account C cannot read or insert messages into the claim, even via a direct
  Supabase client call using the claim UUID.
- A guest cannot send or read messages, including through the PostgREST API.
- A and B cannot spoof one another's `sender_id`.
- Two separate claims on the same found report have different message histories.
- Rejected claims cannot be messaged; approved claims can still be messaged.
- Reload the page and verify messages persist.
- Check no private claim proof is copied into chat automatically.

Important: Supabase RLS on `public.messages` must be applied before exposing
this UI publicly. Frontend checks are UX, not a security boundary.

## Not implemented

This MVP does not provide typing indicators, read receipts, attachments, push
notifications, a user directory, blocking/reporting, or instant Realtime delivery.
Conversation updates poll every 5 seconds to stay easy to test and deploy.
