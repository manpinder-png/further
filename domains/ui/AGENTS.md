# UI domain

Preserve v1’s full composition and dark, warm-orange/cyan visual identity: journey rail, radial map, right inspector and bottom composer. The user rejected v2’s alternative layout. Make subtle refinements inside v1; do not replace it with a path dashboard.

- Three compact in-canvas views distinguish This question, My knowledge map and Geomind. The question selector scopes the existing radial map; My knowledge map shows all saved topics, including older learning. In focused view the central label describes that question; the global view may show the learner. Preserve the map’s visual language and controls.
- My knowledge map opens at a summarized topic level. A topic click changes abstraction to its constituent canonical concepts; use a clear breadcrumb/back and semantic zoom-out. Overview nodes are aggregate presentation objects, not synthetic concepts or learning scores. Keep saved question paths in their existing separate view/history. Grouping may span several questions; it must never hide concepts or replace their evidence.
- Geomind groups real, consented, currently eligible learners around shared concepts. It is not a physical map or a validated intelligence score. Keep explicit empty/error/loading states; do not invent peers. Broader offline community sharing and optional geography remain separate consented features.
- Use progressive disclosure. A topic opens one lesson; source search and explanation feedback are explicit activities. Do not mount hidden duplicate AI clients.
- Use the real account/session API. Test personas are an explicitly enabled development aid, never sign-in. Google OAuth is parked. Show its sign-in option only if configured; do not prompt for setup during normal email signup.
- UI reads transport contracts, never database drivers or model credentials. Use `lib/client/live.ts` for same-origin requests and explicit rehearsal-mode headers.
- Failed loads/saves remain visible. Do not silently substitute sample people. Keep text drafts and use stable idempotency keys for retry.
- Restore shared rooms from authorized server snapshots. Render only authorized display-name projections; never expose raw peer UUIDs as names.
- Stream real provider output in every supported AI flow. Show the current collaborator/stage, readable provisional draft, cancellation/retry and optional safe activity details. No simulated streaming, private reasoning, prompts, raw tool payloads or secrets.
- A saved explanation is AI-reviewed evidence, not a certificate of mastery. Watching and participating are useful activity, not demonstrated understanding. Avoid percentages-to-understood, XP and levels in the active learner flow.
- Keep provider and protocol diagnostics on development surfaces. Learner copy should make the next action easy to understand.
- Account changes hard-navigate and notify other tabs; never retain a prior account's in-flight client state after login/logout.
