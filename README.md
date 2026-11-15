# Lost Signal 📡

**Lost something? Find your signal.**

Lost Signal is an AI-assisted lost-and-found web app built for the **UMass Amherst** community during HackUMass. Instead of relying on Snapchat stories or buried group-chat messages, students can report missing belongings, browse found items, compare potential matches, and securely request ownership.

**Live app:** https://lostsignal.boston

## Features

- **Lost and found reports:** Sign in to post item descriptions, categories, campus locations, and optional photos.
- **AI-assisted matching:** Google Gemini analyzes item descriptions and images. A weighted comparison algorithm ranks potential lost/found matches and explains the similarities. If Gemini is unavailable or rate-limited, the app can still show weighted matches.
- **Campus discovery map:** Browse found-item reports on an interactive UMass Amherst map, search landmarks, and choose a campus location when posting. Unrecognized locations remain text-only instead of showing a guessed map pin.
- **Private ownership claims:** People who believe an item belongs to them can provide private proof. The report owner can approve or reject the claim; approval resolves the found report.
- **Campus Karma:** Finders earn **50 points per approved claim** on their found-item reports. Badges unlock at **1, 5, and 10 approvals**. These represent approved claims, *not independently verified physical returns*.
- **Guest mode and security:** Guests can browse and try limited matching. Permanent accounts are required to post, upload, claim, or make claim decisions. Authorization is enforced by server checks and Supabase database policies.
- **Responsive interface:** Browse, find matches, report items, and track your activity on desktop or mobile.

> **Status:** Hackathon prototype. Matching scores indicate similarity, **not proof of ownership**. Use the private claim process to verify an item before handing it over.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Server | Next.js route handlers / Node.js |
| AI | Google Gemini API; custom weighted matching |
| Data | Supabase PostgreSQL |
| Auth and photos | Supabase Auth and Supabase Storage |
| Maps | Leaflet, React Leaflet, OpenStreetMap |
| Deployment | Vercel |
| Collaboration | Git and GitHub |

## Run locally

**Prerequisites:** Node.js compatible with the project's Next.js version (Node.js 22 recommended), npm, and access to a configured Supabase project. Gemini is required for live model analysis, but not for fallback weighted matching.

1. Clone the project and install dependencies.

   ```bash
   git clone https://github.com/DaoAncestorVoid/Lost-Signal-Hackathon.git
   cd Lost-Signal-Hackathon
   npm ci
   ```

2. Create a `.env.local` file in the project root:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   GEMINI_API_KEY=your_gemini_api_key
   # Optional: overrides the model configured in lib/gemini.ts
   # GEMINI_MODEL=your_available_gemini_model
   ```

   Obtain the Supabase URL and publishable key from your own Supabase project's API settings. Obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/api-keys). **Do not commit `.env.local`, API keys, database passwords, or service-role keys.** Never prefix a secret with `NEXT_PUBLIC_`.

3. Set up the database. The Supabase project must have the schema, image-storage bucket/policies, claim-workflow functions, guest restrictions, and Karma migration from `supabase/migrations/`. Use a **separate development Supabase project** rather than running setup commands against the hackathon production database.

   After authenticating and linking the Supabase CLI to *your development project*, review pending migrations before applying them:

   ```bash
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

   Configure Supabase Auth's allowed local and deployment redirect URLs in its dashboard, as appropriate for your setup.

4. Start the app.

   ```bash
   npm run dev
   ```

   Open **http://localhost:3000**.

## How to use

1. **Browse:** Continue as a guest or sign in; search reports by name/category or explore the campus map.
2. **Report:** Sign in with a permanent account, choose **Lost** or **Found**, add a description, choose a campus location, and optionally attach a photo.
3. **Find matches:** Select one of your reports to compare against open reports of the opposite type. Review the ranked results and explanations.
4. **Claim:** Open a found report, submit private ownership proof, and wait for the finder to review it.
5. **Resolve:** The finder approves or rejects the claim. Approved found-report claims contribute to the finder's Campus Karma total.

## Testing

Run these checks before submitting changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Manual integration checks matter too: verify guest write restrictions, two-account claim submission/approval, Karma updates, photo uploads, AI fallback, map location selection, and mobile layout. See [demo and release checklist](docs/demo-checklist.md).

## Security and privacy

- Guest accounts use Supabase anonymous sessions, but cannot perform permanent-account writes.
- Database Row Level Security (RLS) and restricted claim functions enforce access beyond the interface.
- Ownership proofs should not appear in public report descriptions.
- Item images are served through controlled access and signed URLs.
- AI similarity is only a suggestion; avoid sharing sensitive identifying information in public listings.
- API rate limiting is a hackathon-scale safeguard, **not** a distributed production abuse-prevention system.

## Project structure

```text
app/                   Next.js UI, components, and API routes
lib/                   Supabase clients, matching, claims, Karma, validation
supabase/migrations/   Database, storage, security, and Karma SQL
tests/                 Unit and integration-contract tests
docs/                  Technical notes and demo checklist
```

## Future ideas

Real-time match notifications, QR-code lost-item flyers, expanded Karma achievements, and multi-campus support.

## Team and acknowledgments

Created as a team project for **HackUMass**. Thanks to the HackUMass organizers and to the maintainers of the technologies and mapping data used in this prototype.

---

**Lost something? Find your signal.**
