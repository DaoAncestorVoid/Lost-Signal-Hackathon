# Usability polish checklist

This branch changes the existing screens; it does not add a new backend table or migration.

## 1. Report-draft privacy

- Unfinished report drafts are saved in `sessionStorage` under keys containing the
  **signed-in user ID** and report type, so returning to the same tab as another user
  will not restore someone else's draft.
- The old draft-key format (which lacked an account ID) is discarded when the
  reporting form mounts.
- Drafts stay client-side in the current tab only, and are cleared after successful
  report submission.
- Test by starting a draft as account A, signing out, signing into B in the same
  tab, and opening the same report type: B should get a blank draft.
- Test that returning to account A can still restore A's new-account-scoped draft
  in the same tab.

## 2. Sensitive photo reminder

Before uploading an item photo, the form asks users to **blur or cover** names,
ID numbers, bank card numbers, barcodes, and other sensitive details using their
phone's photo editor. This is guidance only; the app does not automatically
redact uploaded images. Manual review remains important.

## 3. Shareable item link

- In an item's detail screen, press **Share item link** to copy a URL such as
  `https://lostsignal.boston/?report=<report_uuid>`.
- The app reads this query parameter after loading accessible report data and
  opens the requested report. If the report is unavailable, the app displays a
  notice rather than fabricating details.
- An account must still be authorized to view any associated private claims;
  this link **never** grants access to private proof or messaging.
- Test in a **different browser session**, including a guest session, and after a
  hard refresh. Test an invalid UUID as well.
- The URL is cleared when the visitor returns to browsing or navigates away.

## 4. Messaging polish

- Opens the first eligible conversation automatically when the inbox is entered
  without a specific claim.
- Shows each conversation's latest available message preview and time.
- Scrolls to the latest message as history or new messages load.
- Conversation preview summaries refresh every 10 seconds while the view is
  active. Existing open-thread refresh remains 5 seconds.
- Previews come from the same RLS-protected messages table, not public claims
  or search indexes.
- Review mobile layout, switching chats, delayed network responses, and whether
  the scroll moves as expected.

## Before merging

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
Then test account A/B drafts, a shared link, and two-account conversations.
No database migration is needed for this branch.
