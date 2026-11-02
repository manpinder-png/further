# Current v2 handoff — November 2, 2026

This is the v2 publication receipt for `further-final:feature/v2` and `further:feature/mani-v2`. The milestone preserves the v1 layout. The earlier replacement layout described below remains rejected. Use [onboarding](ONBOARDING.md), [handoff](HANDOFF.md) and [architecture](ARCHITECTURE.md) for current behavior.

| Fresh snapshot check | Result |
|---|---|
| Install from the staged Git tree, without local configuration/data | `npm ci` passes on Node 24 |
| Types, ESLint and automated tests | Pass; 219 tests pass, five HTTP parents skipped for separate execution |
| Launcher environment parsing | One Python test passes with the real Next env parser and synthetic values |
| Production build | Pass; 60 build-trace privacy checks |
| HTTP against that fresh production build | All 22 tests pass across three isolated PGlite fixture suites, using the real local Meta encoder |
| Publication checks | Source/history credential scan clear; private runtime assets ignored; scoped push guard passes 11 allow/reject cases |

The launcher now reads `.env.local` before provider checks; explicit local/fixture flags isolate storage from inherited AWS configuration. AWS configuration requires the owner's expected account ID. The historical builder console points developers to the current architecture rather than presenting old RLS/MCP/planning claims as implemented.

`npm audit --omit=dev` reports zero vulnerabilities. The full audit reports 14 moderate dependency entries from one minimatch advisory in development tooling. The tested lockfile is retained; compatible upstream remediation remains follow-up work.

These packaging checks use fixtures, not fresh hosted inference or fresh cloud deployment. Earlier live Meta/AWS/Facebook receipts follow. **The colleague's two-machine live acceptance is pending**; follow the onboarding test and record its actual result. No `main` merge is part of this publication.

## Historical verification receipts

All sections below record their state at the time of the check. References to uncommitted work, old branches, parked AWS deployment or unconfigured Facebook are historical, superseded by this handoff and later deployment receipts.

---

# November 2 Facebook login acceptance

- The Facebook Login use case, `email`/`public_profile` permissions, exact Cognito redirect, app domain and website URL were verified in Chrome.
- The app secret was stored privately in Secrets Manager, then referenced by CloudFormation. It was not printed, committed or saved in a local file; no Secrets Manager value-read API was used.
- `enable-facebook-v21-20261102` reached **UPDATE_COMPLETE**, adding only the provider and updating the existing public client without replacement. The region's Cognito console supports versions through v21.0; the rejected v26.0 attempt rolled back safely.
- The actual Facebook → Cognito → local Further flow completed after the owner approved basic-profile/email access. Cognito has an `EXTERNAL_PROVIDER` Facebook user and Further created its private profile in Aurora. This was a real account, not a fixture. The same signed-in profile was restored after the final local server restart.
- A consent request left open longer than Cognito's five-minute limit failed; a fresh authorized request succeeded. Authentication state and one-use/replay handling also pass live against Aurora.
- A local pre-redirect request returned an explicit AWS `ThrottlingException`. Bounded full-jitter retries now cover known rejected throttles; explicit database-resume retries have a longer budget. Unknown write/commit outcomes remain unretried. The sign-in button displays a real connecting state while its request is waiting.
- Final `npm run check`: TypeScript/ESLint pass; 224 tests registered, 219 pass and five HTTP parents remain separate integration suites. All 22 separate HTTP tests pass with fresh isolated PGlite fixtures. The production build and 60 build-trace privacy checks pass. CloudFormation has zero schema findings and all eight Guard rules pass.

The Meta app remains unpublished: Facebook testing is limited to eligible app-role users. Public Facebook release requirements, account linking and local-history imports remain separate work. Email/password signup remains configured. Previous local history is preserved separately. No commits or pushes were made.

Evidence: ignored `.local/verification/facebook-deployment.json`, `facebook-{check,build,server}.log`, `facebook-*.png` and `aws-oauth-data-acceptance.log`. See [AWS receipt](AWS_DEPLOYMENT.md#facebook-deployment-receipt--november-2) and [authentication boundaries](AUTHENTICATION.md).

---

# November 2 AWS data and Cognito deployment acceptance

`further-dev` reached **CREATE_COMPLETE** in `us-east-1`. Re-read resource properties confirmed private encrypted Aurora PostgreSQL 17.9, Data API, the zero-to-two ACU development policy, Cognito Lite and private S3. Facebook remains unconfigured because a Facebook Login app ID/secret is required.

- Final `npm run check`: TypeScript and ESLint pass; 221 registered tests, 216 pass and five HTTP parents are executed separately.
- All 22 HTTP tests pass with each suite using a fresh isolated PGlite fixture database. Running independent semantic-matching suites against one shared fixture population can match each other's synthetic learners; isolation avoids that test interference.
- Final production build passes, including all 60 build-trace privacy checks.
- CloudFormation schema validation reports zero findings; seven Guard rules pass and the public-database negative fixture is rejected.
- Live Aurora acceptance covers migrations/pgvector, large Unicode cursor paging, typed UUID/JSON/vector/array parameters, rollback, subject identity, hierarchy/cycle protection, durable index recovery, vector search, shared-room consent/messages/completion and concurrent event retries.
- Live Cognito acceptance uses one synthetic user with all invitations suppressed. It verifies wrong passwords, unverified-email denial, actual JWT login, saved profile edits, session/actor isolation, token expiry and logout/replay. Administrative verification is used only for this synthetic test account.
- Chrome successfully signed in and streamed a real `muse-spark-1.3` question, saving four concepts and one question to Aurora. Six locally computed Meta vectors became ready. The signed-in browser restored the same map after a local server restart. Runtime collaborators remain actual model-selected calls; a specialist does not need a separate top-level run row to participate in an internal delegation.
- Real S3 put/read and authenticated image HTTP read pass; anonymous object access returns 403, anonymous API access returns 401 and a different owner cannot retrieve the media. Synthetic media and isolated database fixtures were removed.

See [AWS deployment receipt and boundaries](AWS_DEPLOYMENT.md#verified-deployment--november-2-2026), [authentication](AUTHENTICATION.md) and [media storage](MEDIA_STORAGE.md). Evidence is ignored under `.local/verification/aws-*`. These are functional development checks, not measured scale, cost or model-quality claims. Real inbox delivery/manual email confirmation and Facebook federation are not yet verified. Previous local history remains intact and is not linked by email automatically. Source changes remain uncommitted.

---

# November 2 local semantic matching and nested-map acceptance

- `npm run check`: TypeScript and ESLint pass; 203 tests registered, 198 pass, 5 HTTP parents skipped for separate execution.
- Isolated HTTP run: all 22 tests pass across backend, Geomind and knowledge overview suites. These use a separate fixture database and the real local Meta encoder; test-only synthetic vectors are confined to unit helpers.
- `npm run build`: passes, including the privacy check across 55 build trace manifests.
- Live isolated walkthrough: five explicitly temporary profiles; four semantic neighbors and nine retained cross-ID topic pairs at setup. GPU parallelism → SIMD execution and GPU memory → memory bandwidth were visibly offered in Chrome. No invitations or shared sessions were initiated in the walkthrough.
- Live Meta provenance: the knowledge-map overview and a parent-concept learning-companion lesson succeeded through the configured Meta Spark 1.3 route. Older fixture records in the reused demo database remain labelled and are not reused as live output.
- Main-workspace acceptance: all 29 saved concepts and seven questions survived migration/reload. Live Meta organized the main overview into six topics, then lazily grouped the eight-concept AI-hardware branch into two subtopics across earlier questions.
- Chrome acceptance: four nested knowledge levels, canonical parent lesson access at a 390px mobile breakpoint, one-level return, saved overview reload, community selection, zoom/fit, and a verified pan transform. Browser warning/error collection was empty. Temporary viewport override was reset.
- Separate focused coverage: durable indexing/reopen and lease recovery; unchanged-content deduplication; obsolete-result/space rejection; private metadata excluded from peer targets; cross-topic invitations and owner-specific completion; empty/unindexed unrelated peers cannot block a ready pair; weak relative-band pairs cannot be promoted by isolating an invitation request; 250-concept bounded hierarchy generation and owner/cache isolation.

Current matching remains experimental. Raw cosine is not confidence or expertise; the frozen reference-centered encoder and operating point need a larger project-specific relevance evaluation. Small synthetic evaluation improvements and remaining misses are recorded in `docs/retrieval/README.md`. The viewport's radius represents viewer-relative semantic similarity; bearing is illustrative and is not a global or physical coordinate system. The repository still scans eligible local learners and replays their histories; no population-scale benchmark is claimed.

All implementation remains local and uncommitted. AWS deployment, cloud API hosting, Supabase integration and physical geolocation remain parked. The main workspace is on port 3000; port 3001 is an isolated temporary community walkthrough with live inference and real local vectors. Pending index jobs survive restarts, but processing requires a running local server/worker.

---

# Verification — November 1, 2026

This document retains earlier checks for traceability. The v1 snapshot is committed and pushed as `fadcef728450bcaab7bbc44debf41d6bf876fee4` on `feature/v1`. The v2 redesign was subsequently rejected. Current local work is on `feature/v1-refinement`; its final section below records the restored v1 composition with retained backend/account fixes. Those later changes remain uncommitted and undeployed.

Earlier v1 verification baseline: `15528f3f0b3848430de05a9058fbd61e8bd2aafe` from the merged iteration-nov1 branch. These checks ran on `feature/agentic-local`, before the subsequently requested snapshot commit and push.

## Automated checks

| Check | Result | Scope |
|---|---|---|
| TypeScript | Passed | Current integrated source |
| ESLint | Passed | Current integrated source, excluding local runtime files |
| Unit/provider/route checks | 102 passed, 0 failed | Includes real PGlite, provider SSE parsing, early draft delivery, cancellation, retry subscribers, privacy, budgets, audio formats, UI state and quest rehydration |
| HTTP checks | 11 passed, 0 failed | Production build on a separate fixture-mode database; independent cookie jars, real routes and storage |
| Production build | Passed | Next.js 15.5.28 / Node 24.22.2 |
| Build trace privacy | Passed | 41 manifests contain no local databases, environment files or downloaded model assets |
| Credential-value scan | Passed | Neither configured provider key appears in nonignored repository files |

The normal unit command skips three HTTP parent suites unless `FURTHER_TEST_URL` is supplied. Those suites were run separately against the isolated server. The HTTP test counts include nested test cases; they are not eleven browser sessions.

HTTP evidence covers empty new maps, cookie/signature/origin protection, actor isolation, consent/time/presence filtering, busy-peer filtering, dual acceptance and exact room IDs, saved messages, changed-input retry conflicts, one facilitator response per human message, concurrent completion once, persistent blocks/reports, no blocked-room credit, independently invoked agents, and restored quest history.

## Live provider checks

Actual authenticated SDK/API calls, with synthetic content:

- Meta Spark 1.3 knowledge map delegated to Baseten's exact `meta-models/muse-spark-open-1026` metadata model. The verified tool loop used four model calls and two delegated/tool actions; reported usage was 6,544 input / 2,626 output tokens.
- Meta Spark solo learning returned a structured lesson.
- Uploaded synthetic red/white/blue image returned an appropriate learning question through the perception API; image and extraction provenance were saved locally.
- Meta search grounding returned a real PyTorch documentation annotation. Verification took about 5.2 seconds, using one model call and three bounded search actions, reporting 13,905 input / 845 output tokens.
- Meta Voice Transcribe accepted the app's mono PCM WAV upload and returned an empty transcript for a silent fixture. This verifies request format/authentication/response handling, **not spoken-audio accuracy or microphone hardware**.

A real integration defect was fixed during these checks: Meta search commentary preceded the final JSON. The adapter now separates commentary from the final answer while preserving all required replay items. Built-in search is capped and consumes the shared tool budget. Provider tests retain regressions for both behaviors.

## Browser checks

The live production build was opened in the browser with an initially empty identity:

1. A new learner received an empty map, without sample peers.
2. “How do GPUs speed up matrix multiplication?” produced six saved concepts through live inference.
3. A synthetic profile rename saved correctly.
4. A concept opened a real lesson and a cited AMD documentation source.
5. A typed explanation received Meta feedback and one persisted score event.
6. After stopping/restarting the server, profile, six topics, feedback evidence and the quest restored.
7. At a 390px layout width, document width remained 390px and the mobile concept sheet was usable. The Inspector is mounted conditionally, so desktop and phone variants do not simultaneously request lessons.
8. The architecture page's domain selection, agent registry, data-table inventory, model routing and local health rendered. No browser console warnings/errors were captured during the checked flow.

The two-person full session flow was verified by HTTP clients. It has not been exhaustively rehearsed in two physical browsers with microphone hardware.

## Streaming follow-up

The November 1 follow-up uses real provider SSE through the production app, without a fixture header. Small synthetic requests verified these measured observations (one run each, not a latency benchmark):

| Experience | First readable draft | Final response | Draft updates |
|---|---:|---:|---:|
| Map with Meta → Baseten metadata delegation | 3.92s | 13.25s | 37 |
| Solo lesson | 2.88s | 3.73s | 13 |
| Cited PyTorch source search | 7.51s | 8.31s | 30 |
| Cited CUDA source search after prose-format correction | 8.15s | 8.81s | 33 |
| Image understanding | 3.34s | 4.22s | 28 |
| Short course | 2.26s | 5.53s | 15 |
| Explain-back feedback | 2.55s | 2.77s | 9 |
| Meta transcription of synthetic spoken audio (final build) | 0.77s | 1.61s | 14 |

The map request's initial activity arrived in 18ms and included actual map reading, metadata delegation, saving and local indexing. Reusing its saved retry key returned in 3ms with a restored-result status and zero pretend draft updates. Source search exposed actual search-tool activity. The spoken test clip was generated locally for testing. Meta returned the intended sentence in the first run; the final-build repeat duplicated the word “matrix.” This is a protocol and small-fixture check, not a speech-accuracy benchmark, microphone hardware verification or product TTS.

Browser checks confirmed visible live delegation and provisional drafts, final graph persistence, cancellation with an unapplied draft, retry, and explicit failure when a search result lacked sufficient provider citation evidence. The 390px layout stayed 390px wide, mounted one Inspector, and streamed the lesson and source independently. No browser warnings/errors were captured. A missing-citation response remains an error instead of becoming a fictional grounded source.

The CUDA query reproduced missing final citations when resource search was asked to emit a JSON object. The resource guide now follows Meta's documented cited-prose pattern and the runtime builds the public structured envelope from that prose plus actual provider annotations. The same query with documentation preference then passed with a final NVIDIA citation and 33 early draft updates. A subsequent browser request with any-source preference still lacked usable citation evidence and failed visibly. The change improves compatibility but does not establish reliable citations for every request. Search remains bounded, and an uncited answer still fails; model-written URLs never establish provenance.

A bounded wire diagnostic confirmed the missing citations originate upstream: five searches completed, but no citation-added events and no annotations appeared in completed content parts, message items or the terminal response. No supported annotation-enabling option was found in the current official recipe. Unresolved long numeric citation markers are removed from readable text; that cleanup grants no source authority. Normal dagger notation is preserved.

Regression tests cover split UTF-8/CRLF, replacement transcripts, new-turn draft reset, encrypted replay preservation, private-reasoning exclusion, incomplete streams, safe failures, one/all subscriber cancellation and human-message durability. Review also fixed an ASR finality edge: `final:true` now completes transcription even if the upstream connection remains open. The activity and text events report actual work; there are no timer-generated progress stories or artificial token delays.

## Remaining limits

PGlite is a single-process local development database. Production identity, native PostgreSQL, distributed workers, high-concurrency behavior, room/presence push updates, microphone-to-provider WebSocket streaming, video calls, TTS and standards-compliant external MCP/A2A delegation remain unimplemented. AI responses and uploaded audio transcription do stream. RoBERTa retrieval passed three tiny sanity comparisons but is not a production-quality retrieval benchmark. Automated content classification and a report-review operation are not configured.

Local evidence files and screenshots are stored under ignored `.local/verification/` and `.local/*verification*.json`. They contain synthetic test content and safe metadata, not keys. The running app and encoder are managed by `scripts/dev.py`; use `scripts/stop.py` to stop that launcher.

## Visible Chrome walkthrough — November 1 evening

Used the live production app on port 3000 in Chrome, starting with an empty browser identity. Test profile was renamed `Chrome walkthrough (test)`. No fixture AI was used; no application source was changed during this walkthrough.

| Flow | Observed result |
|---|---|
| Curiosity → map | Chatbot memory question produced six concepts in about 13 seconds; visible metadata delegation and provisional drafts; reload preserved the map and quest. |
| Solo lesson | Context-window lesson and interaction completed through Meta. |
| Source discovery | Real IBM context-window citation returned; separate URL checker displayed “Couldn't check this link.” |
| Explain-back | Typed explanation received 3/3 feedback in about three seconds and appeared in saved activity. |
| Photo | Synthetic red/white/blue image produced an editable flags/colour-symbolism question in about three seconds. Map change remained behind explicit confirmation, which was not clicked. |
| Availability and matching | Empty presence was honest. A separately authenticated, explicitly labelled synthetic test peer sharing the concept was then added through the local HTTP API. Mutual acceptance opened the exact shared room. |
| Shared text conversation | Main learner posted through Chrome, second test learner through HTTP. Both messages appeared in Chrome; two real Meta Spark 1.3 facilitator responses carried live provenance. First response took about three seconds. This was not a second human or a two-browser rehearsal. |
| Finish session | Success page confirmed persistence; map showed one session and updated progression. Test peer was opted out after the demonstration. |
| Personal guide | Read the saved map, delegated metadata and learning assistance, streamed readable drafts, and returned next-step advice in about 23 seconds. |
| Architecture | Domain diagram, independent agent contracts, routing, schema and live configuration rendered in a second Chrome tab. |
| Browser console | No captured warnings/errors during the walkthrough. |

### Problems exposed by the walkthrough

- Progress copy conflicts with its underlying heuristic. A 3/3 explain-back adds 0.5, while `Understood` requires 0.7. The next-step label still says “Explain it back to finish” because it does not consider successful explain history. This is not lost persistence or stale state.
- A session adds 0.2 after both participants send a message, without validating duration or understanding. Consequently a brief exchange after one 3/3 explanation triggers `Understood`. Participation should not be presented as independently verified mastery.
- Session history, learned-with connections and activity show a peer UUID. Completion events store the peer ID, while display helpers do not resolve that ID to the stored display name. Matching itself shows the name correctly.
- The match dialog uses “You teach / peer teaches” even for overlapping novice interests. The backend explanation correctly describes exploring together.
- The guide describes the heuristic mastery value as a “confirmed strength” and presents oldest-first truncation as a universal default. Prompts, evidence labels and technical-answer evaluation need refinement; a successful model call does not establish correctness.
- Source citations worked in this run, but IBM URL verification was unsupported. Earlier intermittent missing-citation failures remain unresolved.

Microphone hardware/permission flow was not exercised. Earlier synthetic-audio ASR checks do not establish that the physical microphone works. Voice/video rooms and product text-to-speech remain unimplemented. Production auth, distributed scale, external agent protocol adapters and moderation operations remain outside this local demonstration.

Screenshots: `.local/verification/chrome-walkthrough/{explain-back,photo,shared-room,guide,final-map}.jpg`. Synthetic second-peer response and provenance are in `peer-message.json` in the same ignored directory. The room was completed, and both Chrome app and architecture tabs were left open. No commit, push or deployment was performed.

## V2 experience and local accounts — November 1 evening

The requested v1 snapshot was committed and pushed before changing the experience. Its local and remote branch tips both resolve to `fadcef728450bcaab7bbc44debf41d6bf876fee4`. The following work is local and uncommitted on `feature/v2-experience`.

### Integrated checks

| Check | Result |
|---|---|
| TypeScript and ESLint | Passed |
| Unit/provider/route tests | 140 passed, 0 failed; three HTTP parent suites intentionally skipped by this command |
| Isolated HTTP journeys | 11 passed on the final backend build; fixture server stopped and port 3001 confirmed closed |
| Real local account HTTP checks | 18 passed, including independent accounts, stale-actor rejection, login restoration and revoked-session denial; no model calls |
| Production build | Passed; 50 trace manifests exclude local data, environment files and downloaded model assets |
| Credential-value scan | Two configured provider credentials checked across 194 nonignored files; no hits |
| Source dependency inventory | Regenerated: 120 source files and 350 local imports |
| Final Chrome console | No captured warnings/errors during the final reviewed flow |

Regression coverage includes ownership/mode/depth-scoped saved lessons after database reopen, practice associated with the exact lesson run, safe retry after confirmed pre-save failure, no fresh mutation after partial-save/unknown outcome, and question-scoped matching that rejects foreign or unknown concepts. A final mobile-only title-clipping correction was rebuilt after these checks; backend code was unchanged.

### Chrome journey with actual provider calls

Created a clearly synthetic test account through the real signup form. No test-persona switch or fixture model was used for this journey.

| Flow | Observed result |
|---|---|
| Signup | Real local email/password account, username and display name; initially empty workspace. Google button accurately reports missing configuration. |
| First question | A chatbot/context-window question produced a five-topic path. No profile node appears in the centre. |
| Learn | Meta returned a concrete explanation and example in about four seconds, distinguishing the model limit from the application's history-management policy. |
| Explain | A typed explanation received saved feedback in about three seconds. The topic reads **Explained**, offers the next topic, and does not claim independently verified mastery. |
| Second question | A bread/yeast question produced a separate four-topic path. Switching back restored the chatbot path and reviewed explanation. |
| Guide | The guide received the selected older question, used its actual saved explanation, and returned one next step with a button to an existing topic in about six seconds. The two-question/nine-concept map remained unchanged. |
| Sources | Real provider search returned an Anthropic context-window documentation citation in about seven seconds. The link was honestly labelled not checked; citation provenance and URL reachability are separate claims. |
| Connections | Optional overview contains only the current question's topics. Mobile switches to a readable list. |
| Account edits | Display name and username saved successfully. Sign-out cleared private UI; sign-in restored the same account, both questions and saved explanation. |
| Peer entry | Matching remains an explicit **Learn together** action, with a clear availability setup state for a new account. No automatic match popup interrupted learning. |
| Reopen after rebuild | The original lesson restored immediately with **Saved lesson · reopened without a new AI request**. Reviewed feedback also restored. |
| Narrow layout | 320px layout exposes an expandable full question; 390px Connections uses content-height cards, and document width remains 390px. Temporary emulation was removed. |
| Architecture | Refreshed domain map includes account tables and live model routing; local embedding service reports ready. App and architecture Chrome tabs remain open. |

Actual provider timings here are individual observations, not latency benchmarks or learner-outcome measurements. A separate synthetic account verified live SSE delivery: the source response emitted seven nonempty text deltas, beginning at 5.576 seconds before its 5.890-second result; the guide emitted thirteen, beginning at 4.704 seconds before its 5.065-second result. Captured events rendered provisional text through the actual progress reducer and ActivityPanel. That UI replay is not a browser timing observation; these short draft windows are easy to miss by eye. The app adds no artificial typing delay. Search/tool/wait/save phases are visible throughout.

### Current boundaries

Google federation is implemented with the official verification library, PKCE, nonce and one-use browser-bound state, but **live Google sign-in has not been tested** because client credentials are not configured. See [the local setup instructions](AUTHENTICATION.md). Local email signup does not verify email ownership or provide recovery. App data remains local; inference and Google authentication use their configured hosted services.

Missing provider citations can still cause a visible source-search failure. New prompts and link verification do not establish factual accuracy for every model answer. Physical microphone testing, video rooms, product TTS, multi-device access, distributed scale and external MCP/A2A compliance remain outside this iteration. Production dependencies have zero reported audit vulnerabilities; fourteen moderate development-tool findings remain, without forcing unrelated major upgrades.

The usability target is substantially clearer learning and collaboration. No claim of a measured tenfold improvement is made. Evidence and screenshots are under ignored `.local/verification/v2/`; account credentials, local data and screenshots are excluded from Git.

## V1 layout refinement — November 1

The user reaffirmed v1 as the layout baseline and asked for subtle simplification rather than a replacement. The rejected v2 source and working diff were backed up under ignored `.local/backups/` before editing. The published `feature/v1` snapshot remains unchanged. Current branch: `feature/v1-refinement`, with no additional commit or push.

Restored the collapsible left journey rail, radial map, narrow right inspector, Map / Session / Profile navigation and bottom composer. Progress, Activity, Connections and Sessions start collapsed; Path and Questions stay visible. A compact Focus selector switches saved questions or All topics within the same canvas. The global view retains the learner hub; focused view labels the question. Level/XP claims and fading blur remain removed. Saved lessons, account isolation, source handling and backend retry fixes were preserved. Google OAuth is parked, with the unconfigured setup prompt removed.

Verification: TypeScript, ESLint and 140 automated tests passed (three HTTP parent suites skipped; unchanged backend HTTP evidence is recorded above). Final production build passed with 50 clean trace manifests. Dependency inventory regenerated: 119 source files, 346 local imports.

Chrome showed the v1 pane composition with the existing three saved questions and 13 total topics. Question focus switched correctly between GPU and bread; All topics restored the full map and learner hub. A saved GPU lesson reopened in the right inspector without new inference. One actual guide request showed **Path guide · Model connection established**, streamed its response and completed in about four seconds without creating another question. At 390px, the journey drawer closed when a topic was selected and the lesson opened visibly in the bottom sheet; document width stayed 390px. Temporary emulation was cleared. No browser warnings/errors were captured.

Screenshots: `.local/verification/v1-refinement/{final,live-persona,mobile}.jpg`. The live app remains open in Chrome on port 3000. This verifies the implemented layout and interactions; the user's design judgment remains the next review.

## Cumulative knowledge and Geomind — November 1

The existing v1 workspace now has three in-canvas views: This question, My knowledge map and Geomind. The full private map includes all saved topics across questions; the current-question preference is remembered separately. Geomind uses real eligible available-now candidate projections, with an explicit named invitation and no fabricated people. Google OAuth remains parked. These changes are local and uncommitted on `feature/v1-refinement`.

Integrated verification passed: TypeScript, ESLint and **151 automated tests**, with four HTTP parent suites skipped in that command. The separately started isolated fixture server passed **15 HTTP tests**, including the new consented-neighborhood and targeted-invitation journey, and was stopped afterward. The production build passed its privacy trace check with **52 manifests**. The regenerated inventory contains **126 source files and 374 local imports**.

New checks cover owned topic scopes, strict request shapes, private-field exclusion, blocks, opt-out, expired presence, time fit, response limits, exact person/topic targeting, retry reuse and mutual acceptance. Transactional tests change a peer's time from twenty to five minutes after candidate lookup and confirm that no invitation is persisted. Competing invitations reserve a participant once; incompatible pending reservations disappear from discovery, while reciprocal retries preserve the same invitation and topic. Acceptance also rechecks the ten-minute minimum.

Chrome review used the actual existing local account for cumulative history and a separate database/origin for synthetic peer tests:

- The actual account showed **17 saved topics across 4 questions**, including its saved explanation evidence. Switching between the complete map and This question restored the remembered question. No learning data was removed or recreated.
- The actual account's Geomind view correctly requested adult confirmation/availability; those settings were not changed for the demonstration.
- Isolated learners explicitly named **Geomind QA viewer**, **Geomind QA Ada** and **Geomind QA Ravi** produced two shared-topic neighborhoods. Selecting Ada displayed the real common topics and available minutes. Choosing the second topic survived a refresh without resetting the inspector.
- A mobile invitation targeted Ada on the chosen topic, displayed the first learner's saved acceptance and waited for the second. Cancelling worked. The independent HTTP journey separately verified both acceptances and exact room linkage.
- At 390 × 844, the three view controls remained accessible, the full map retained pan/zoom, and a selected learner used the existing mobile detail sheet. Temporary viewport overrides were cleared.
- No browser warnings/errors were captured in the isolated Geomind flow. Browser fixture data and processes are separate from the user's workspace and were stopped after review. No paid model call was needed for this database-backed feature.

Evidence is under ignored `.local/verification/geomind/`, including `my-knowledge-map.jpg`, `consent-state.jpg`, `mobile-knowledge.jpg`, `isolated-neighborhood.jpg`, `mobile-neighbor.jpg`, `mobile-invitation.jpg`, test logs and the HTTP report. A final copy correction ensures the journey rail points to saved questions when no overall recommendation is available instead of suggesting the learner has no saved work.

This verifies a local available-now discovery slice, not an offline community directory or a scale benchmark. Exact shared concepts determine current neighborhoods; semantic vector ranking, independently consented offline sharing and optional geography remain future work. The current candidate query still scans eligible learners and replays histories. See [Geomind](GEOMIND.md) for the bounded-retrieval scale plan and privacy boundaries.

## Topic overview and semantic zoom — November 1 evening

My knowledge map now starts with Meta-generated topic summaries across all saved questions. Selecting a topic reveals its original concepts; selecting a concept opens the existing lesson. Breadcrumb, centre/back control and zoom-out restore the overview. The v1 composition, separate question view and Geomind remain intact. This work is local and uncommitted on `feature/v1-refinement`; HEAD remains the published v1 snapshot.

### Verification

| Check | Result |
|---|---|
| TypeScript, ESLint and automated suite | Passed: 172 tests, no failures; five HTTP parent suites intentionally skipped in this command |
| Isolated HTTP journeys | 21 passed, no failures or skips; fixture server stopped; no paid calls |
| Production build and privacy trace check | Passed; 53 trace manifests exclude local data, environment files and downloaded model assets |
| Source dependency inventory | Regenerated: 131 source files and 397 local imports |
| Actual Meta overview | 17 canonical concepts covered exactly once in three coherent groups, including one group spanning the two GPU/AI-hardware questions |
| Saved-learning preservation | Before/after concepts, edges, events, metadata and current-intent hash identical; 70 learning events unchanged by summary generation |
| Cache reuse | Reopening and reloading returned the same saved live run; no repeat summary inference |
| Chrome navigation | Topic click revealed eight GPU/AI concepts; three zoom-out steps restored overview; breadcrumb/back worked on a phone-sized viewport |
| Existing saved lesson | Context Window Explained reopened from its summary group with the saved-lesson/no-new-request indicator |
| Phone layout | Readable compact overview at 390 × 844, no horizontal document overflow; emulation cleared after verification |

The first isolated HTTP attempt exposed invalid test fixture domain values; these were corrected to the existing route contract, then the full HTTP journeys passed. Final regression coverage includes stale-actor rejection on GET and POST, exact coverage and duplicate rejection, unchanged graph and intent, owner/mode cache separation, cache survival beyond 100 unrelated runs, concurrent coalescing, stale-source rejection and safe versus unknown retry outcomes. The compact-layout invariant checks stable finite geometry and no overlap between topic cards or the learner hub.

Chrome review also exposed inconsistent topic/concept counts and overlapping progress categories. Counts now distinguish aggregate topics from original concepts; Reviewed, Exploring and Not started partition owned concepts without changing learning evidence. A captured actor header protects both summary requests during account changes. Directly selected saved concepts remain accessible while an overview is loading or fails.

Summary generation showed the real Path guide waiting state. Exact live token arrival timing was not measured in this browser run; automated streaming checks exercise actual SSE parsing and the HTTP journey verifies the streamed contract with explicitly labelled fixture inference. The final overview is a validated Meta result, not a scripted taxonomy. Topic labels remain a model proposal; complete membership validation does not establish perfect grouping quality. Current complete-source bounds are documented in [Geomind](GEOMIND.md).

Evidence is in ignored `.local/verification/knowledge-overview/`: final build/check logs, isolated HTTP report, before/after/cache records and desktop/mobile screenshots. Google OAuth remains parked. No new commit, push or deployment was performed.
