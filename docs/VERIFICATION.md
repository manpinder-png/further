# Verification — November 1, 2026

Baseline: `15528f3f0b3848430de05a9058fbd61e8bd2aafe` from the merged iteration-nov1 branch. Working branch: `feature/agentic-local`. No new commit, push or deployment was performed.

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
