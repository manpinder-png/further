# Further: UI Design Log

A running record of how the `ui` branch UI was designed and why. Newest decisions are added at the bottom of each section. The spec is the hackathon build plan (kept outside the repo). Its 3-minute demo (plan §2) is the acceptance test for every screen here.

---

## 1. Process

1. **Start from the demo, not the feature list.** The five demo beats (voice → bloom, explore a node, time-lapse, live match, off-app capture) became the five things the main screen has to do without navigating away. Anything else (profile, ops, connectors) lives on secondary routes.
2. **Map every plan requirement to a place in the UI.** Before drawing anything, each functional requirement (F1–F10), non-functional requirement (N1–N6), Meta model and backend system in the plan got a home: a component, an API route, or a status readout. The full table is in §5 and is also rendered live on `/ops`.
3. **Pick two references and find what each is good at.**
   - *Factory's mission control* (multi-agent "Missions" view): dense, dark, monospaced, with every agent's state visible at once. Good at making invisible work (agents, models, queues) legible and trustworthy.
   - *2D Minecraft* (top-down tile world): fog of war, blocks that upgrade from dirt to diamond, torches, paths, player heads. Good at making progress feel physical and owned.
4. **Assign each reference a job.** Mission control is the *chrome*: bars, panels, logs, status. Minecraft is the *world*: the map only. Mixing them inside one surface would make both worse, so the boundary is strict: pixel art lives inside the map canvas and a few small "item" icons, never in panels.
5. **Build with demo data that is labeled as demo.** Every fake peer, transcript, grade and source carries a visible `DEMO` tag (repo rule: never present fixtures as real users or live model output). Each demo path sits behind the same function the real backend will implement, so swapping in the real thing doesn't touch UI code.

---

## 2. Visual system

### 2.1 The chrome: mission control

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0b` | Page |
| `--panel` | `#111113` | Panels |
| `--line` | `#232327` | 1px hairlines; panels are separated by lines, not shadows |
| `--text` / `--muted` | `#ece9e4` / `#85858c` | Body / labels |
| `--signal` | `#f26b1d` | The one accent: live, active, primary action. Factory-style orange |
| `--ok` `--warn` `--err` | green / amber / red | System status only |

- **Type:** Geist Mono for all chrome, uppercase with letter spacing for labels (`[ MISSIONS ]`). Geist Sans only for long-form reading (node hooks, chat) because mono is tiring in paragraphs.
- **Bracket labels** `[ LIKE THIS ]` name every panel, so a judge can point at any part of the screen and read what system it is.
- **Status pills** in the top bar show each backend dependency with a dot: green = live, orange = demo, red = down. This is how the UI is honest about what's real at any moment.
- **The agent log** (left column) prints each pipeline step as it happens (`TRANSCRIBE → EXPAND → CANONICALIZE → STREAM`). It turns the 20% "technical depth" score into something visible instead of something we have to claim.

### 2.2 The world: 2D Minecraft map

| Map concept | Minecraft metaphor | Driven by (plan §5.4) |
|---|---|---|
| Concept, `seeded` | Cobblestone block with a `?` | state |
| Concept, `explored` | Ore block: iron, then gold as mastery rises | state + mastery |
| Concept, `understood` | Diamond block with a torch and glow particles | state = understood |
| Node size | 1×1 → 2×2 tiles | mastery |
| Node opacity | Same block, faded | `0.25 + 0.75 × interest` |
| Skipped / decayed | Fog of war creeps back over it | interest decay |
| Unexplored space | Fog of war (dithered black) | — |
| `prerequisite` edge | Rail track | edge kind |
| `part_of` edge | Stone-brick road | edge kind |
| `related` edge | Dirt path | edge kind |
| Another explorer present | Player head + nametag | Presence |
| Time-lapse | World generation replay, `DAY 1 … DAY 7` | `events` table |

- **All textures are generated in code** from seeded noise on a 16×16 grid (no image assets, no licensing questions, nothing copied from Minecraft). Rendered on a `<canvas>` with smoothing off so pixels stay sharp at any zoom.
- **Terrain is decorative, fog is data.** Grass, water and trees come from noise and mean nothing. Fog is computed from your nodes' interest, so the visible world *is* your understanding.
- **Labels are nametags** (dark translucent box, white text), the one place Minecraft styling touches text, because a floating tag reads well over any terrain.

---

## 3. Layout

```
┌──────────────────────── TOP BAR: brand · system status pills · nav ───────────────────────┐
│ [ MISSIONS ]        │                                             │ [ INSPECTOR ]          │
│  curiosity history  │              WORLD MAP (canvas)              │  node card:            │
│ [ AGENT LOG ]       │   fog · blocks · paths · player heads        │  hook + citation       │
│  live pipeline      │                                             │  source clip           │
│ [ EXPLORERS ]       │   ── time-lapse scrubber (overlay) ──       │  flowchart             │
│  presence list      │                                             │  explain-it-back       │
├─────────────────────┴──────── COMMAND BAR: mic · text · lens ─────┴────────────────────────┤
```

- **Mobile (N2):** the map is full screen; missions/log and the inspector become bottom sheets; the command bar stays pinned. The demo runs on phones, so phone layout is not an afterthought.
- **Match requests** arrive as a modal over the map with a 60-second countdown ring, because a two-way handshake with expiry (F7) needs undivided attention and a visible deadline.

---

## 4. Decisions

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D1 | Wiped the Python prototype; Next.js App Router + TS + Tailwind | The build plan (§3) picks this stack; one repo with API routes, Vercel previews | Teammates need Node; old prototype is still on `main` and `feature/*` |
| D2 | Custom canvas tile renderer instead of `react-force-graph-2d` | The plan suggests force-graph, but a Minecraft world needs a tile grid, fog and textures. Force layout is still used, snapped to tiles | We own ~400 lines of rendering code |
| D3 | Strict split: mission control chrome, Minecraft world | Each reference does one job well; mixing them muddies both | Map and chrome can feel like two products if the palette drifts; shared orange accent ties them |
| D4 | Every backend dependency has a status pill and a typed stub | Judges score production readiness; teammates get a clear plug-in point | Stubs must be kept honest (`DEMO` labels) |
| D5 | Demo data is visibly labeled everywhere | Repo rule and plan §9: never let a bot pose as a human | Slightly less "magical" demo; more trustworthy |
| D6 | Streaming expansion uses SSE from a Route Handler, one JSON object per line | Matches plan §5.2 exactly; demo mode streams the same format with delays | — |
| D7 | Demo sources are checked live with YouTube oEmbed in the UI | Anti-slop: even demo links must prove they exist. Dead ones show as dead | Needs network during the demo |
| D8 | MCP endpoint answers JSON-RPC directly in a route for now | Gets E8 demoable today; swapping to the official TS SDK is a contained change | Not yet Streamable HTTP-complete |
| D9 | Off-app captures reach the map through a polled inbox in demo mode | Stand-in for Supabase Realtime Broadcast so step 5 works without Supabase | Polling every 2s; replaced by a channel subscription later |
| D10 | Mastery shown as a Minecraft-style XP bar, interest as a row of pips | Familiar, glanceable, and doesn't feel like a test score (the team dislikes quizzes) | — |
| D11 | The event log is the only source of truth on the client; node state is replayed from it | Same code path powers the live map and the time-lapse (plan §5.4: "no extra storage") | Replays on every event; fine at hundreds of events, revisit at tens of thousands |
| D12 | "Understood" at mastery ≥ 0.7, 2×2 block at ≥ 0.45 | Watch (+0.2) + a 3/3 explain-back (+0.5) = understood: one honest learning loop lights a node | Thresholds are ours, not the plan's. Tune with evals |
| D13 | Match overlap uses an overlap coefficient (÷ smaller side), not Jaccard | Jaccard punished a big map matching a small one: the demo pair scored 0.58 under a 0.6 threshold for the wrong reason | Slightly more generous matching overall |
| D14 | Your "teaches" piece = your freshest concept with mastery ≥ 0.4 | The first version offered "Transformers" (oldest, strongest) when you'd just learned matrix multiplication. Fresh knowledge is what you're excited to explain | — |
| D15 | No re-match with someone you had a session with in the last 24h | A second request for the same peer popped up right after a session | — |
| D16 | Session summary *suggests* new concepts (HBM) instead of adding them | Keeps demo beat 5 meaningful: the suggestion becomes the MCP capture, and the node appears live | One extra step for the user |
| D17 | A capture that names a known concept ("what is HBM memory") adds just that node, attached to its neighbour | Plan §2 step 5 is "the node appears", not "five nodes appear" | Demo-path heuristic; Muse Spark decides this in live mode |
| D18 | Session route is `/session`, not `/session/[id]` | One active session per user in the MVP; keeps nav simple. API stays `/api/session/:id/message` | Add `[id]` when multiple concurrent sessions exist |
| D19 | Camera holds still during time-lapse | Auto-fit zoomed into the 3 nodes of day 1 and the "world growing" moment was lost | User can still pan manually |
| D20 | Inspector "Recent" list is clickable | The canvas isn't keyboard-navigable; this gives keyboard and screen-reader users a path to every card | — |

---

## 5. Where every plan requirement lives

The live version of this table (with status) is on `/ops`, generated from `lib/requirements.ts`. Update that file as backend work lands.

| Plan item | UI | Backend hook | Owner |
|---|---|---|---|
| F1 voice + text input | `components/mission/CommandBar.tsx` | `POST /api/transcribe` → `lib/server/meta.transcribe` | Sirpreet / Connor |
| F2 streaming expansion + canonicalization | Map bloom, Missions, Agent log | `POST /api/expand` (SSE) · `lib/canonicalize.ts` → pgvector | Connor |
| F3 node card, cited source, flowchart | `components/mission/Inspector.tsx` | `GET /api/card/:slug` · `POST /api/resources/verify` | Connor / Manpinder |
| F4 explain-back | Inspector → Explain it back | `POST /api/explain` | Connor |
| F5 interest/mastery, bloom/fade | `components/map/WorldMap.tsx` | `lib/math.ts` | Sirpreet |
| F6 time-lapse | `components/mission/TimeLapse.tsx` | `lib/math.replay` over `events` | Sirpreet |
| F7 matching + handshake | Explorers panel, `MatchModal.tsx` | `POST /api/match` · `lib/matching.ts` · Presence | Amit |
| F8 jigsaw session | `app/session/page.tsx` | `POST /api/session/:id/message` · Broadcast | Amit / Connor |
| F9 three-layer profile | `app/profile/page.tsx` | `profiles` table | Sirpreet |
| F10 MCP | `app/connectors/page.tsx`, Profile token | `POST /api/mcp` · `lib/mcp-tools.ts` | Connor |
| E9 / N3 production trust | `/ops` → Production trust | `supabase/migrations/0001_init.sql`, `lib/server/*`, `lib/schemas.ts` | Connor |
| N4 safety | Session Guard chips, Block, Report, 18+ toggle | `lib/server/moderation.ts` | Amit |
| Curiosity Lens (stretch) | Lens modal in CommandBar | `POST /api/lens` (not built) | Amit |
| Muse Image covers | Inspector cover strip | not built; `concepts.cover_url` | Connor |

**Demo vs live.** Every server module checks for its key (`META_API_KEY`, `LLAMA_GUARD_*`, Supabase) and falls back to a labeled demo path. The top bar shows which is which. Adding keys to `.env.local` switches each system to live with no UI change.

---

## 6. Iteration log

What changed after looking at real screenshots of the running app (headless Chrome, 1512×900 and 390×844):

1. **Stone terrain drowned the blocks.** Big grey patches competed with iron/cobble blocks. Raised the stone threshold, tinted stone mossy, and gave every block a 1px black outline.
2. **Mobile-only buttons showed on desktop.** Custom `.btn` CSS was unlayered and beat Tailwind's `lg:hidden`. Moved component classes into `@layer components`.
3. **Nametags collided** ("Matrix multiplication" over "Tensor cores"). Added collision avoidance: tags nudge upward until clear; the selected tag draws last.
4. **Match fell just short** (0.58 < 0.6). See D13.
5. **Wrong "you teach" concept.** See D14.
6. **Duplicate match after a session; MCP beat diluted.** See D15–D17.
7. **Time-lapse zoomed in.** See D19.
8. **`scrollIntoView` returns a Promise in current Chrome**, which React treated as an effect cleanup and crashed. Switched to setting `scrollTop`.
9. **Hydration mismatches** on Connectors (`window.location` in render) and the Ops countdown (`Date.now()` in render). Both moved to after mount.
10. **Mobile top bar overflowed.** Shortened "Demo mode" to "Demo" under `sm`, tightened gaps, and allowed the map to fit at a lower zoom.

## 7. Known gaps (UI side)

- The canvas map has no keyboard focus model. The Recent list is the accessible path; a full list view would be better.
- Pinch-to-zoom isn't implemented; mobile uses the +/− buttons and drag.
- The demo session peer is scripted. In the live demo, Amit's phone replaces it through Supabase Broadcast.
- Explain-back and curiosity voice clips are recorded for real, but transcribed by a canned demo response until `META_API_KEY` is set.
