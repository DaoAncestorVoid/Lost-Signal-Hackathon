# Return journey — polished UX review

## What changed

The finder/claimant flow now uses a **compact status summary**, rather than
a long four-step timeline and explanatory paragraphs in every card.

- One immediately recognizable status: **Awaiting review**, **Ready for pickup**,
  **Returned**, or **Declined**, with a small progress bar on the detail screen.
- One short contextual next step for each role; full explanations are hidden
  behind an optional **How item returns work** disclosure.
- Ownership proof is inside a disclosure for each claim, so several claims
  don't create walls of text. The finder can expand it before approving.
- A visually distinct **Your next steps** section focuses on actionable claims.
- **Campus Karma stays at the bottom** of My Activity, separate from workflow
  tasks. No change to Karma calculation or claim rules.
- The actual database operations and confirmation modal are unchanged.

## QA required before merge

1. Account B claims account A's found report; confirm B sees **Awaiting review**
   and can open Messages.
2. A opens report, expands **View private ownership proof**, verifies ownership,
   and approves or declines.
3. After approval, both sides see **Ready for pickup** and can message each other.
4. B only presses **Confirm receipt** *after* physically receiving the item.
   A then earns 50 points and both see **Returned**.
5. Check **Declined** claims, no claim state, My Activity action queue, unread
   messages and notification links.
6. Check dark mode, light mode, ~375px mobile, tablet and desktop.
7. Ensure each interactive disclosure is keyboard accessible.
8. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

The frontend change needs no new migration. PR #29 stays draft until tested.
