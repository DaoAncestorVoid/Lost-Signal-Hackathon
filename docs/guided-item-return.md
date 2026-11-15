# Guided item return UX

## What changed

This is a **frontend-only** UX change. The existing database claim, messaging,
handoff-confirmation and Campus Karma rules are unchanged.

- Found-item claim requests now explain **what happens after approval** before the
  user submits private proof.
- Both participants see a **four-step return guide** on claim details:
  **Claim sent → Ownership reviewed → Arrange pickup → Return confirmed**.
- The guidance identifies the next action differently for the finder and claimant:
  - Finder: review proof, approve/decline, then arrange a safe pickup using Messages.
  - Claimant: submit proof, wait for review, arrange pickup, then confirm **only after
    physically receiving** the item.
- The finder is explicitly told that approval marks the found listing resolved, but
  Karma is earned **only when the claimant confirms receipt**.
- **My Activity** starts with a **What needs your attention** section for new
  claims on the user’s found reports and approved claims awaiting their own
  receipt confirmation.
- **Campus Karma** is now **below** the report and claim history rather than at
  the top of the activity screen. No new navigation tab was added.

## Important distinctions

- Approving a claim is not proof of a physical handoff.
- Only the claimant can attest that they received an item.
- The finder earns 50 points **after** claimant confirmation.
- Declining a claim does not complete a return.
- A listing can be marked resolved at approval even while the physical exchange
  is being arranged; the UI now explains this explicitly.

## Test plan

1. As A, post a found item. Verify empty claim state explains what happens next.
2. As B, view the report. Check that the request form explains private proof,
   finder review, Messages, and eventual receipt confirmation.
3. As B, submit a claim. Verify pending journey guidance and a clear Message finder CTA.
4. As A, check the **What needs your attention** block in My Activity.
   Select Review claim; verify that private proof and approval controls are visible.
5. As A, approve B’s claim. Verify the finder’s next step says to arrange pickup.
6. As B, confirm the My Activity action block says to message the finder first.
   Check that **I received this item** still requires explicit confirmation.
7. As B, confirm receipt after the handoff. Verify the journey displays completed
   and the finder’s Karma awards +50 after refresh.
8. Check rejected claims and closed report UI for misleading next steps.
9. Verify existing notifications, messaging and direct claim links still work.
10. Check small screens (narrow mobile) and both light/dark themes.

## Before merging

```powershell
git fetch origin
git switch feature/return-journey-ux
git pull origin feature/return-journey-ux
npm run typecheck
npm run lint
npm test
npm run build
```

No migration or new environment variable is needed.
