# Confirming a physical item handoff

## What changes

An accepted ownership claim is **not** proof that the physical item has changed hands.
The new flow adds a separate claimant-confirmed handoff, while preserving the existing
approval and messaging workflow:

1. The finder reviews a claim and selects **Approve**.
2. The found report is marked **resolved** as before; the two users can still message.
3. After receiving the actual item, the claimant selects **I received this item** and
   confirms the browser dialog.
4. Supabase stores the server-generated `handoff_confirmed_at` timestamp.
5. The finder sees **Return confirmed** instead of **Awaiting claimant confirmation**.
6. The finder earns 50 Campus Karma points for the confirmed return. Milestones
   are based on completed confirmed returns.

Only the claimant may confirm a previously approved claim. Guest users, unrelated
accounts, and the finder cannot confirm it. Repeated confirmations are rejected.
There is no client-provided timestamp or alternate write path.

## Database migration

`20261115060000_confirm_handoff.sql` adds the nullable
`claims.handoff_confirmed_at` column, a limited
`confirm_claim_handoff(uuid)` function, and changes the existing Karma RPC
to count **approved claims with a confirmed handoff**.

**Important migration impact:** Existing approved claims do *not* get a
confirmation timestamp automatically. Their finders' Campus Karma totals can
temporarily decrease (possibly to zero) until the claimants confirm they received
those items. This avoids incorrectly treating approval as proof of delivery.

The migration must be applied **before** deploying the updated app because the
claim API now returns `handoff_confirmed_at`.

## Setup

```powershell
git fetch origin
git switch feature/confirm-item-handoff
git pull origin feature/confirm-item-handoff
npm run typecheck
npm run lint
npm test
npm run build
npx supabase db push --remote --dry-run
```

Verify the target is **Lost-Signal-Hackathon** and that only the expected new
migration is pending. Then explicitly decide whether to apply it to production:

```powershell
npx supabase db push --remote
```

## Manual verification (two registered accounts plus an outsider)

- [ ] Finder A posts a found item, claimant B submits a claim.
- [ ] A approves. Report becomes resolved; Karma does not increase yet.
- [ ] B sees an **I received this item** button on the claim and in My activity.
- [ ] B first uses Messages to arrange a safe public handoff.
- [ ] B confirms actual receipt. Timestamp appears on both sides after refresh.
- [ ] A's Campus Karma gains +50 for this confirmed return.
- [ ] Repeated confirmation is rejected; there are no duplicate rewards.
- [ ] A, an unrelated permanent account C, and an anonymous guest cannot
      call the RPC or API to confirm B's claim.
- [ ] Pending or rejected claims cannot be confirmed.
- [ ] Any prior approvals remain unconfirmed until claimant confirmation.
- [ ] Existing claim decisions, matching, messaging, and mobile layout still work.

This is a **recipient attestation**, not independently verified proof of handoff.
