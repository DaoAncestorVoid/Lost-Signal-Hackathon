# Hackathon demo and release checklist

Use this before the final Devpost submission and for an end-to-end demonstration.

## Submission assets

- [ ] Devpost project story: inspiration, features, how it was built, challenges, lessons learned, next steps
- [ ] Correct live URL: https://lostsignal.boston
- [ ] GitHub repository link: https://github.com/DaoAncestorVoid/Lost-Signal-Hackathon
- [ ] 2–3 minute demo video (unlisted YouTube link if accepted by the event)
- [ ] Screenshots of the real UI: homepage, AI match reasons, map, claim workflow, Campus Karma
- [ ] Verify challenge-category selection and any requested Gemini **project number** (not the API key)

## Build and deploy

- [ ] Merge only reviewed branches; verify production deployed the intended commit
- [ ] Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- [ ] Confirm environment variables are configured in the deployment, without leaking secrets
- [ ] Verify Supabase migrations are applied to the correct project; don't repeat migration pushes blindly
- [ ] Test the deployment on desktop and narrow mobile viewports
- [ ] Remove misleading sample data and obvious test posts from public browsing

## Demo flow (two test accounts)

1. Sign in as **finder A** and post a clearly labeled **found** item with an image and a mapped UMass location.
2. Sign in as **owner B** (separate browser or private window) and post the corresponding **lost** item.
3. Show browsing and filtering, then switch to **Map** and open the found item's marker.
4. Run **Find matches** and explain what the similarity score and match reasons mean. If Gemini is unavailable, explicitly say weighted fallback is running.
5. As B, submit a **private ownership claim** for A's found item.
6. As A, review the proof and approve the claim; show that the found report becomes **resolved**.
7. Open A's **My activity** and show the **Campus Karma** approved-claim count and unlocked badge.
8. Open a guest session: browse works, but posting and submitting claims require a permanent account.
9. If messaging is merged and verified, demonstrate a conversation with appropriate read/write permissions; otherwise omit it.

## Security sanity checks

- [ ] A guest cannot create a report, upload an image, submit a claim, or decide someone else's claim.
- [ ] A permanent account cannot approve a claim on a different user's report.
- [ ] Only the claimant and finder can view private ownership proof.
- [ ] Public reports avoid publishing personal phone numbers, keys, IDs, or private details.
- [ ] Do not expose API keys, Supabase database credentials, or access tokens in screenshots, videos, logs, or the repository.
- [ ] The app explains that approving a claim is **not** proof of physical handoff.

## If time is short

Prioritize a **working live URL**, a **reliable recorded demo**, the **Devpost submission**, and **one real screenshot per standout feature** before implementing new features.
