# Muse Build Brief — Discover · Learn · Connect

Use this brief alongside `EXECUTIVE_SUMMARY.md` and `ARCHITECTURE.md`.

## Mission
Build a **working responsive web/PWA prototype** of an AI-native learning platform with three pillars: **Discover** (curiosity), **Learn** (adaptive learning moments and long-term journeys), and **Connect** (optional, purposeful peer learning). Build the application using Muse and use **available Meta runtime model APIs** for topic interpretation, activity generation, facilitation, and assessment. Verify the actual API contract and credentials before wiring calls. Never fake a working model integration.

## Demo outcome
In three real browser sessions, participants express different interests around GPUs/parallel computing, get calibrated, complete an individual learning moment, see an optional compatible group recommendation, join a synchronized shared challenge, and finish with independent reflection and a visible next step. A solo user can complete the entire learning loop without a match.

## Required screens
1. **Discover:** Topic input with examples; curated mini-feed; journey resume.
2. **Calibrate:** 1–3 short adaptive questions; no lengthy onboarding.
3. **Learn:** Guided explanation + interactive challenge; hints and retry; mobile-first.
4. **Journey:** Concepts, prerequisites, states, next suggested steps; short or deep goals.
5. **Connect:** Opt-in match suggestions with shared learning objective and duration.
6. **Session:** Real-time text, shared challenge steps, AI facilitator, leave/report/block.
7. **Reflect:** Independent question, feedback with uncertainty, progress update, continue/branch options.

## Engineering requirements
- TypeScript frontend/backend; clean component boundaries; Postgres persistence; real WebSocket synchronization.
- Server-side `MetaModelProvider` abstraction; validated structured JSON outputs and fallback content.
- Seed a small verified GPU concept graph and deterministic demo data; no arbitrary model-generated executable code.
- Authentication or explicit demo identity switching; enforce room membership and authorization.
- Accessible responsive layouts for touch, keyboard, mobile and desktop; graceful errors and loading states.
- Tests for topic mapping, activity schema, prerequisite decisions, match eligibility, session state, and assessment persistence.
- README with setup, env vars, Meta API configuration, migrations, seed script, and exact demo walkthrough.

## Implementation sequence
**Milestone 1:** App shell + responsive navigation + seed data.  
**Milestone 2:** Topic interpretation + calibration + journey state.  
**Milestone 3:** Two activity templates + assessment + Meta provider.  
**Milestone 4:** Match suggestions + real-time group session.  
**Milestone 5:** End-to-end QA + polished demo + README.

## Acceptance tests
- A vague request like “GPUs confuse me” becomes a sensible starting objective.
- A learner who misses a prerequisite receives a targeted explanation or remediation.
- A learner can switch between short exploration and a deep journey without losing progress.
- Activity JSON is validated before rendering; failure produces a usable fallback.
- Two browser clients see the same shared challenge state in real time.
- Matchmaking is optional; no available peers never blocks learning.
- A novel post-activity question updates a provisional concept state, not a fake certification.
- All main flows work on a narrow mobile viewport and desktop browser.

## Scope guardrails
Prioritize **one exceptional learning loop** over a large superficial product. Do not build video calls, public reputation scores, minors' social networking, unbounded AI-generated games, or an endless feed. If time runs short, preserve the Learn loop and one real multiplayer demonstration.

## Suggested kickoff instruction to Muse
> Read `EXECUTIVE_SUMMARY.md`, `ARCHITECTURE.md`, and this file. First inspect the repository and propose a concrete milestone plan with file structure, data schema, Meta API integration points, and acceptance tests. Then implement milestone by milestone, running checks after each. Ask for unavailable Meta API details rather than inventing endpoints. Build a responsive, polished, functional app; do not substitute mock UI for required end-to-end functionality. Keep demo fixtures explicitly labeled.
