# Claim and message notifications

The existing bell continues showing possible lost/found matches. It also shows
**New ownership claim** and **New message** alerts.

## How notifications are created

The migration `20261115070000_claim_message_notifications.sql` adds
`public.activity_notifications` and two trusted PostgreSQL triggers.

- **New claim:** whenever a user submits a claim for a found report, notify
  the found report's owner.
- **New message:** when a claimant or finder sends a new chat message, notify
  the **other** conversation participant.
- The message body and private ownership proof are **not** copied into alerts.
- Alerts are created on insert even when the recipient is offline, and the
  existing bell periodically loads new alerts while the app is open.
- Clicking a claim alert navigates to the found report's claim-review section.
- Clicking a message alert opens the corresponding claim conversation.
- Matching notifications remain in the older `notifications` table; the
  activity alerts have separate recipient-only RLS.
- **Old claims/messages are not backfilled.** Test with *new* events after the migration.

## Apply and verify safely

Before deploying the frontend change, check the correct Supabase project:

```powershell
git fetch origin
git switch feature/claim-message-notifications
git pull origin feature/claim-message-notifications
npm run typecheck
npm run lint
npm test
npm run build
npx supabase db push --remote --dry-run
```

The target must be **Lost-Signal-Hackathon**, reference
`lrgahmzbqagagyczeeay`, not CoCart. Review every pending migration.
The new migration should be `20261115070000_claim_message_notifications.sql`.
Do not blindly apply unexpected migrations or alter migration-history records.
Once confirmed, run `npx supabase db push --remote` for the correct project.

## Two-account tests

1. Sign in as permanent account A (finder), create a found report.
2. Sign in as permanent account B, submit a claim on A's report.
3. A should receive a **New ownership claim** alert, even after returning
   from another page or refreshing. Click **Review claim** to open the report.
4. B sends A a new chat message; A receives a **New message** alert and can
   click **Open conversation** to view it.
5. A replies. B should receive the corresponding new message alert; A should
   **not** receive a self-notification for the reply.
6. Verify Mark read works, the badge count updates, and alerts persist
   across refreshes.
7. Verify previously existing possible-match notifications still show up.
8. Verify unrelated account C and guest sessions cannot access these alerts
   using direct database queries or forged API calls.
9. Verify public alerts never contain a message body or claim proof.
10. Test two simultaneous messages and a second claim on the same report.

The bell checks for activity approximately every 15 seconds while the
application is visible, and also refreshes on window focus. This is
**near-real-time polling**, not Supabase Realtime or email/push notifications.
