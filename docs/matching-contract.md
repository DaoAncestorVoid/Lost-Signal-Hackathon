# Item matching contract

Frontend and backend consumers should import `Item` and `ItemMatch` from
`types/item.ts`. Reports now require `reportType: "lost" | "found"` and
`status: "open" | "resolved"`. The former `status: "lost" | "found"` field
must be mapped to `reportType`; callers must supply the actual resolution
status separately. Do not infer that an existing report is open.

No existing frontend or backend consumer uses these types yet; the matches API
route is empty. Future API payloads should follow this shared contract. Storage
adapters are responsible for mapping database fields into it.

`location` is optional free-text campus location. Matching uses normalized word
overlap, so shared building words can provide partial credit. It does not infer
geographic distance, aliases, or adjacency between different building names.

Core evidence weights remain category 35, color 20, brand 20, features 15,
description 10. Missing attributes earn zero points against the fixed 100-point
total. Conflicting categories reject the match. Location can add up to 10 points
when some item evidence matches; scores are capped at 100. A different location
does not reject an otherwise plausible match. Scores express weighted similarity,
not ownership probability. Only open reports of opposite types are eligible.

Run `npm test` on Node.js 22.6+ with TypeScript stripping support (Node.js 24
recommended), and `npm run typecheck`. Tests use only Node's test runner and
the pure matching module; no Gemini credentials, network, or database is needed.
