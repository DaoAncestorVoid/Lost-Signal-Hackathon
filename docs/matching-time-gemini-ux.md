# Better matching: item names, event time, and Gemini

## User-facing improvements

- Explore has a clear **Try Gemini-assisted matching** entry point.
- If a user has saved open reports, the matching tab opens the **Gemini-assisted matches** mode by default. Quick search is explicitly labeled **no Gemini**.
- A simple optional **When did you lose it?** input appears in quick search.
- Saved report matches use the report's existing **item_date** (when it was lost/found); they do **not** substitute the report creation timestamp.
- Results show the candidate's event time if one was provided and explain timing-based scoring.
- Gemini enrichment is attempted for un-analyzed reports, including strong initial title matches, but the matcher still works if Gemini times out or is unavailable.
- New reports no longer silently default to the Bags category.

## Why identical names used to score only ~45%

The previous algorithm awarded 35 for category, 20 for color, 20 for brand,
15 for features, 10 for description, plus a 10-point location bonus. It
never scored the title as its own field. Without Gemini-enriched color/brand
evidence, even identical item names ranked poorly.

Now distinctive multi-word title similarity contributes up to 50; generic
single-word titles contribute up to 22. Category, description, extracted
attributes, location and time are still compared. All scores are capped at
100; this remains a **weighted similarity score, not a statistical
probability of ownership**. Different manually selected categories still
exclude unrelated titles, but exact distinctive item titles can override
a category-entry mistake with a clear explanatory reason.

## Time signals

When *both* lost and found event times exist:
- Found at or up to 3 hours before the reported loss, through 24 hours after:
  +12 (a small tolerance accommodates imprecise reporting)
- Found in 1–7 days: +8
- Found in 7–30 days: +4
- Found more than 3 hours before the reported loss: -12
- More than 30 days apart: neutral
- If either date is absent/invalid: neutral

Time can never create a match on its own. It is simply one
compatibility signal. Timestamp comparisons use stored ISO timestamps
(which were converted from local time by the report form).

## Test before merging

```powershell
git fetch origin
git switch feature/matching-time-gemini-discovery
git pull origin feature/matching-time-gemini-discovery
npm run typecheck
npm run lint
npm test
npm run build
```

Manual two-account test:
1. Make a lost report, a found report with a distinctive identical item name
   and matching category, but no Gemini-derived details. Expect similarity
   clearly above 50 instead of ~45.
2. Give both reports event dates that are 2 hours apart. Confirm
   "Lost and found times are close" is a reason when there is already
   other item evidence.
3. Make a found report whose found date is several days *before* the loss
   date; confirm the contradictory time warning and a lower score.
4. Leave either date empty; ranking must work, with no invented date.
5. Use Quick search (does not call Gemini) and Gemini-assisted saved report
   matching. Test successful Gemini, timeout, and no Gemini API key.
6. Verify it works on mobile, dark mode, and for guest demo mode.
7. Ensure match notifications remain recipient-private and other report
   routes still work.

No Supabase schema migration or new environment variable is required. Existing
item_date values are preserved; missing values remain optional.
