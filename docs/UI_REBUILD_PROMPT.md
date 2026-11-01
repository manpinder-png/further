# Prompt: build the Further UI

Attach `FURTHER_HACKATHON_PLAN.md` with this prompt. The plan defines the product, requirements (F1–F10, N1–N6, E-items), the Meta models, and the 3-minute demo. This prompt defines the UI, the architecture to build it on, and the final learner-facing state.

---

## 0. Role and ground rules

You are a senior UI and frontend engineer. Build the Further web app from the attached plan on a fresh `ui` branch. You may delete everything on that branch and start over.

- **Design direction:** combine Factory.com's "mission control" (dense, dark, hairline panels, mono labels, one orange accent) with a 2D top-down Minecraft-style world for the map. Mission control is the chrome. Minecraft is the map only. Pixel art never appears inside panels, apart from a few small item icons.
- **Every backend requirement, framework, agent and AI tool in the plan needs a place in the code:** a component, an API route, a typed server stub, or a builder-view readout.
- **Two audiences, one flag.** The default build is a clean product for learners. All builder and hackathon tooling stays in the codebase but sits behind `NEXT_PUBLIC_BUILDER_VIEW` (default `false`). With the flag off, none of it renders and builder routes return 404.
- **Honest data.** Fixtures must never be presented as real users or live model output.
  - Learner view: one dismissible banner reading "You're exploring with sample data."
  - Builder view: per-item `DEMO` / `SEED` badges.
- **Security:**
  - Never commit `.env`, keys or credentials.
  - Never put provider keys in `NEXT_PUBLIC_` variables.
  - Add `import "server-only"` to every server module.
  - Validate every API route with Zod.
- **Document as you go** in `docs/DESIGN.md`: process, visual system, layout, a numbered decision table (decision / why / trade-off), a requirement→UI→backend map, an iteration log, and known gaps.
- **Verify with real screenshots.** Use headless Chrome at 1440×900 and 390×844. Fix every overlap and overflow you find before calling it done.

---

## 1. Stack

- Next.js 15.5 App Router, React 19, **TypeScript 5** (not 7; it breaks Next 15), Tailwind v4 with `@tailwindcss/postcss`, Zod 4, Mermaid, `server-only`.
- ESLint 9 with `eslint-config-next@15.5` via FlatCompat (`eslint.config.mjs`).
- Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`).
- Fonts via `next/font`: Geist (sans), Geist Mono, Silkscreen (pixel). Expose them as CSS variables.
- `next.config.ts`:
  - `devIndicators: false`.
  - A rewrite from `/mcp` to `/api/mcp`.
- `.env.example` (all server-only except the last):
  - `META_API_KEY`, `META_API_URL`, `META_MODEL=muse-spark-1.3`, `META_DEV_MODEL`, `META_TRANSCRIBE_MODEL`, `META_IMAGE_MODEL`.
  - Supabase URL, anon key, service role key.
  - `LLAMA_GUARD_URL`, `LLAMA_GUARD_KEY`, `LLAMA_GUARD_MODEL`.
  - `SENTRY_DSN`, `RATE_LIMIT_EXPANSIONS_PER_HOUR`.
  - `NEXT_PUBLIC_BUILDER_VIEW=false`.
- `.gitignore`: `node_modules`, `.next`, `.env*`, `!.env.example`, `next-env.d.ts`.
- CI (`.github/workflows/ci.yml`): Node 22, `npm ci`, lint, typecheck, build.

---

## 2. Architecture

### 2.1 Demo mode vs live

Each server module checks for its env key. When the key is missing, the module falls back to a demo path that returns the same shape as the live path. Adding keys to `.env.local` switches a system to live without any UI change. `/api/health` reports `live`, `demo` or `down` for each of these systems: muse, transcribe, grounding, guard, presence, supabase, mcp.

### 2.2 `lib/` (shared)

- **`types.ts`:** Concept, Edge, UserNode, Resource, FEvent, Explorer, MatchRequest, Profile, ExpansionLine, AgentName, LogEntry.
- **`schemas.ts`:** Zod schemas for every request and model output: ExpandRequest, intent/node lines, Explain request and result, Moderate, Verify, MatchDecision, McpCall.
- **`math.ts`:** bloom and fade.
  - Interest: open +0.3, dwell +0.2, skip −0.3. Decays with a 72h half-life.
  - Mastery: watch +0.2, explain +(score/3)×0.5, session +0.2.
  - A concept is understood at mastery ≥ 0.7.
  - A block draws 2×2 at mastery ≥ 0.45.
  - Opacity = 0.25 + 0.75 × interest.
  - Exports `applyEvent` and `replay(events)`. Replay drives both the live map and the time-lapse.
- **`matching.ts`:**
  - Score = 0.5 × overlap + 0.3 × complementarity + 0.2 × recency.
  - Overlap uses a rank-weighted **overlap coefficient**, not Jaccard. Jaccard scored the demo pair 0.58, just under the threshold.
  - `MATCH_THRESHOLD = 0.6`, `HANDSHAKE_MS = 60000`.
- **`canonicalize.ts`:**
  - Cosine similarity with threshold 0.88.
  - Demo mode uses a 384-dim trigram embedding plus an alias table (gpu, matmul, hbm, floating point). Production uses pgvector.
- **`layout.ts`:** world size 64×44 tiles; `placeNear()` places a new node with a ring search around its parent.
- **`mcp-tools.ts`:** `add_curiosity`, `get_my_map`, `next_to_explore`, `find_peers`. Keep these out of the route file, because Next rejects non-route exports from route files.
- **`requirements.ts`:** F1–F10, N1–N6, Meta models, trust items and pipeline stages, each with a status of live / ui / stub / todo. The builder `/ops` page renders this file.
- **`builder.ts`:** `export const BUILDER_VIEW = process.env.NEXT_PUBLIC_BUILDER_VIEW === "true"`.
- **`demo/seed.ts`:**
  - 23-concept AI & Tech catalog, 9 of them on the starting map with positions, plus catalog edges.
  - `NEAR` attach hints, e.g. hbm → memory-bandwidth.
  - A canned expansion for a chips prompt that includes a near-duplicate, to show canonicalization.
  - Real public YouTube and Wikipedia resources (3Blue1Brown, NVIDIA).
  - Mermaid diagrams.
  - `seedEvents(now)` covering 7 days.
  - Seed explorers: Amit, Rhea, Kofi, Lena (not open to match), Yuki (ja).
  - A demo profile and a demo explain-back transcript.
- **`server/`:**
  - `config.ts` (env and `systemStatus`).
  - `meta.ts`:
    - `chat`, `streamLines`, `transcribe`.
    - EXPAND, GRADE and FACILITATOR system prompts.
    - Leave a TODO on the web-search grounding parameter.
  - `moderation.ts`: Llama Guard, or a regex heuristic in demo mode.
  - `ratelimit.ts`: in-memory sliding window, 30 per hour.
  - `observability.ts`: Sentry stub.
  - `store.ts`: inbox for off-app captures, plus the demo MCP token `fur_demo_7f3a9c`.
- **`client/store.tsx`:**
  - `StoreProvider` built on `useReducer`.
  - **The event log is the single source of truth.** Nodes are computed as `replay(events)`.
  - Persist to localStorage under `further:map:v1`, so a reload doesn't reset the map.
  - Actions: hydrate, concept, edge, event, select, log, mission, missionPatch, match, profile, status, session, fit, note, rail.
  - `useMapStats()` is the only source for counts (concepts, understood, explored, on map, sessions, quests). The map and the profile both read it.
- **`client/hooks.ts`:**
  - `useExpand`: parses SSE; after canonical reuse, remaps `edge.from` through the alias table.
  - `useRecorder`: MediaRecorder with a level meter; webm, or mp4 on Safari.
  - `transcribeBlob`.
  - `useInbox`: polls every 2s, standing in for Supabase Realtime.
  - `useMatchJob`:
    - Compares your top 5 active concepts by interest.
    - "You teach" is your freshest concept with mastery ≥ 0.4.
    - No re-match with someone you had a session with in the last 24h.
  - Mission IDs come from a module counter seeded with `Date.now()`.
- **`client/format.ts`:**
  - `STATE_LABEL`: seeded → "On your map", explored → "Explored", understood → "Understood".
  - `plural`.
  - `personName`: strips "(seed)".
  - `relTime`: e.g. "2m ago".

### 2.3 API routes (`app/api/`), all Zod-validated

| Route | Behaviour |
|---|---|
| `health` | Status of each system |
| `expand` | SSE, one JSON object per line (plan §5.2). Rate limited. Sends an `x-further-mode` header. Demo mode streams the canned expansion. A query naming a single known concept ("what is HBM memory") adds only that node, attached near its neighbour |
| `transcribe` | Voice to text |
| `explain` | Grades an explain-back, 0–3 |
| `resources/verify` | YouTube oEmbed or an HTTP HEAD check, with a host allowlist as an SSRF guard |
| `card/[slug]` | The concept card |
| `match` | Scores you against explorers. Handshake accept/decline |
| `session/[id]/message` | Moderates first, then replies with Muse Spark or a scripted 4-turn demo |
| `mcp` | JSON-RPC: `initialize`, `tools/list`, `tools/call`. Bearer token auth |
| `inbox` | Off-app captures |

Also write `supabase/migrations/0001_init.sql`:

- Tables:
  - profiles (with `is_adult`).
  - concepts (with an HNSW vector index).
  - concept_edges.
  - user_nodes (with `learned_with`).
  - resources.
  - events.
  - match_requests (`from_accepted`, `to_accepted`, `expires_at`).
  - sessions, blocks, reports, mcp_tokens, rate_hits.
- Enable RLS on every table and add policies.

---

## 3. Visual system

### 3.1 Tokens

Define these in `app/globals.css` under `@theme`. Put every custom class inside `@layer components`. Unlayered CSS overrides Tailwind utilities such as `lg:hidden`.

| Token | Value | Role |
|---|---|---|
| bg / panel / panel-2 | `#0a0a0b` / `#111113` / `#16161a` | Surfaces |
| line / line-2 | `#232327` / `#2e2e34` | 1px hairlines. Panels are separated by lines, not shadows |
| text | `#ece9e4` | Body |
| muted | `#a3a3ab` | Secondary text, 7.5:1 contrast |
| dim | `#85858d` | Tertiary text, ≥ 4.8:1 contrast |
| faint | `#3a3a40` | Decoration only, never text |
| accent | `#f26b1d` (hover `#ff7d33`, soft `#3a1d0c`) | **Only** for the primary CTA, the current selection and the active tab |
| success | `#3ddc84` | Online, safety-checked, understood badge |
| mastery | `#4ddfe6` (soft `#0f2a2c`) | Understood blocks, mastery bars |
| err | `#ff6b6b` | Errors only |
| warn | `#f5c542` | — |

- All text must have ≥ 4.5:1 contrast on bg, panel and panel-2.
- No orange on timestamps, links or message borders. No red outside errors.

### 3.2 Type

Type scale (no text below 11px):

| Token | Size |
|---|---|
| `2xs` | 11px |
| `xs` | 12 |
| `sm` | 13 |
| `base` | 14 |
| `md` | 15 |
| `lg` | 17 |
| `xl` | 20 |
| `2xl` | 24 |
| `3xl` | 34 |

Font roles:

- **Pixel (Silkscreen):** game moments only. The logo, "Day N" in the replay, and explain-back results.
- **Mono:** small uppercase section labels (`.label`, letter-spacing 0.12em).
- **Sans:** everything else, including chat, hooks and inspector text.

### 3.3 Components

Defined in `globals.css`:

- `.label`, `.pixel`, `.dot`, `.field`, `.map-btn`.
- `.chip` with variants `-success`, `-mastery`, `-accent`, `-err`, `-demo` (`-demo` is builder only).
- `.btn` with `-primary` (accent background, dark text), `-ghost` and `-icon`. Default height is 36px.
- `.scroll` (hairline scrollbar).
- `.grid-bg` (faint 16px dot grid).
- Animations: `.enter`, `.enter-left`, `.scanbar` shimmer, `.cursor-blink`.

Rules:

- Under 768px and on coarse pointers, buttons and map buttons are 44px.
- Focus ring is `2px solid text` with offset 2 on every interactive element.
- `prefers-reduced-motion` turns off all animation and transitions.

`components/ui/bits.tsx`:

- `BlockIcon`, `NodeIcon`, `Head` (pixel player head).
- `XpBar`: cyan, labeled "Level N of 10".
- `Pips`: labeled "Interest".
- `Demo`: badge that returns `null` unless `BUILDER_VIEW` is on.
- `Panel`, `ShieldIcon`, `CloseIcon`, `useReducedMotion`, `useNow`.

`components/ui/Mermaid.tsx`: lazy-loaded, dark theme, strict security level, with a `large` prop for the modal.

### 3.4 The world (canvas, `components/map/`)

**`pixels.ts`:** every texture is generated in code from seeded noise on a 16×16 grid. No image assets and nothing copied from Minecraft.

- Terrain:
  - Grass, water and trees.
  - Mossy stone only above noise 0.9, so stone doesn't swamp the blocks.
- Block textures:
  - cobble: seeded, with a `?` mark.
  - iron, then gold: explored, as mastery rises.
  - diamond: understood, with a torch and glow particles.
  - Every block gets a bevel and a 1px black outline.
- Path textures:
  - rail = prerequisite.
  - stone-brick road = part_of.
  - dirt = related.
- `drawHead` for player heads.

**`WorldMap.tsx`:**

- **Rendering:** `<canvas>` with image smoothing off. 16px tiles. Ordered-dither fog with 4 sub-cells per tile, computed from interest (fog is data; terrain is decoration). Chunk grid. L-shaped paths. Corner-bracket selection.
- **Animation:** drop-in for new blocks; skipped when reduced motion is on.
- **Camera:** fit with min zoom 0.9 and zoom range 0.6–7. A `holdCamera` prop keeps the camera still during the time-lapse.
- **Labels** are drawn in screen space:
  - 12px sans on a solid dark plate.
  - Placement tries above, below, right, then left. If all four collide with another label, a block or the screen edge, the label is skipped.
  - Visibility priority: selected > focused > hovered > neighbours of the selected block > understood > added in the last 6s (only after first load) > every label once zoom ≥ 3.2.
  - Peer avatars draw **under** labels.
  - No floating "w/ Amit" text on the map.
- **Keyboard layer:** a transparent focusable button over each block. Tab and arrow keys move to the nearest block in that direction; Enter opens the card; Esc closes it. Each button's aria-label is "Title, State".
- **Zoom buttons:** +, − and FIT, each with an aria-label and a tooltip.
- **Robustness:** the resize handler must null-check the canvas after unmount.
- **Reduced motion:** no particles, bounce, flicker or camera easing.

---

## 4. Screens (final learner state)

Every screen must avoid these words in visible text, titles and aria-labels: `demo`, `seed`, `muse spark`, `llama guard`, `oembed`, `canonical`, `jigsaw`, `mission control`, `postgres`, `supabase`, `/api/`, `score`, `ms ·`, `cobble`.

### 4.1 Top bar (`components/shell/TopBar.tsx`)

- Height 48px. It must never wrap, even at 390px.
- **Below 1280px on the map:** a hamburger button opens the left rail as a drawer. It has `aria-expanded` and `aria-controls="left-rail"`.
- **Logo:** pixel diamond plus the word "FURTHER" in the pixel font (hidden below 380px). No subtitle.
- **Nav: Map · Session · Profile.**
  - The active tab gets a 2px orange inset underline and `aria-current="page"`.
  - Session is disabled (`aria-disabled`, dim text) with the tooltip "Start a session from a match on the map" unless a match is pending, waiting or accepted.
- **Builder view only:**
  - Connectors and Ops tabs.
  - Status pills for Muse Spark, Voice, Grounding, Llama Guard, Presence, Postgres and MCP, with dots: green live, orange demo, red down.

### 4.2 Map (`app/page.tsx`)

**Layout:**

| Width | Layout |
|---|---|
| ≥1280 | Three columns: left rail 320px · map · inspector 380px |
| 768–1279 | Map plus a 360px inspector; left rail is a drawer |
| <768 | Full-screen map; inspector opens as a bottom sheet; left rail is a drawer |

The command bar is pinned at the bottom.

**Banner:** the dismissible "You're exploring with sample data." banner sits at the top of the map.

**Map header:** the world name only, in title case: "AI & Tech". No concept count.

**Left rail (`LeftRail.tsx`):**

1. **Your quests**
   - Header count is pluralized ("1 quest" / "2 quests").
   - Each card shows the quest text and "Added N concepts".
   - No source or status metadata.
2. **Activity**
   - At most 5 plain-language lines in sans, each with a relative time.
   - Examples: "Added *Tensor cores* to your map", "Matched with Amit on CUDA".
   - Lines are derived from the event log plus `note` entries for matches. A burst of adds collapses into one line.
3. **Learning now**
   - Each row: avatar, name, concept, and "on a concept near yours" where relevant.
   - A green dot appears **only** for people who are open to match. No "not open" text.

**Time-lapse (`TimeLapse.tsx`):**

- Opened by a "▶ Your brain this week" button.
- Replays the event log in ≤ 10s.
- Play/pause button with an aria-label.
- Scrubber with labeled days and the aria-label "Replay position".
- "Day N" title in the pixel font.
- With reduced motion, it steps one day at a time.

**Command bar (`CommandBar.tsx`):**

- Mic button with the aria-label and tooltip "Ask by voice", plus a level meter while recording.
- Input:
  - Placeholder "What are you curious about?  (press / )".
  - While busy: "Growing your map…".
  - `/` focuses the input.
- "Enter ↵" button on `sm` and up.
- Lens button with the aria-label "Curiosity Lens: ask about something with your camera". It opens the Lens modal, a stretch feature.

**Inspector (`Inspector.tsx`):**

- **Empty state:**
  - Intro: "Tap a block on the map to open its card. Blocks you explore grow brighter. Ones you skip fade back into fog."
  - Stats: Understood / Explored / On your map.
  - Legend:
    - The four block states.
    - The three path types.
    - "Bigger blocks = deeper understanding."
  - Recent list: clickable, using state words (never material names).
- **Concept card**, in this order:
  1. Title and state badge, plus "Learned with Amit" when it applies.
  2. Mastery: `XpBar` "Level N of 10". Interest: `Pips`.
  3. Hook text with [1] citations.
  4. Source:
     - Compact row with a YouTube thumbnail that opens a nocookie iframe at the start time.
     - Opening it logs a `watch` event.
     - Shows "✓ Verified source" when verification passes.
  5. **Explain it back:**
     - Labeled "Optional · never a quiz".
     - Voice or typed answer; the result shows in the pixel font.
     - A "Not now" button logs a skip.
     - Must sit fully above the fold on a 1440×900 viewport (target y ≈ 413–547).
  6. **Diagram:**
     - Collapsed by default, with the caption "AI sketch · may simplify".
     - Tapping it opens a large Mermaid modal.
- **Never shown:** load timings, cover-image labels, the slug, or verification jargon.

**Match modal (`MatchModal.tsx`):**

- Bottom-aligned on phones, centered on `sm` and up.
- Header: "Someone to learn with".
- Countdown:
  - 60s ring with the number in the centre.
  - A screen-reader `aria-live` line, "Expires in N seconds", announced at 60, 45, 30, 15, 10 and 5.
  - With reduced motion, the ring stays full and only the number counts down.
- Reason sentence, always naming a concept.
- Body: "Learn together for 10 minutes? You both have to say yes."
- Two cells: "You teach X" and "Amit teaches Y", each with a pixel head.
- Buttons: `Not now` | `Learn together · 10 min` (primary, autofocused, `whitespace-nowrap`).
- After you accept, the modal shows "Waiting for Amit…" with a shimmer. In demo mode the peer accepts after 1.8s; the app then logs an Activity note and routes to `/session?m=<id>`.
- Decline means no re-match for 24h.
- If the timer expires, the request clears.
- **Builder view only:** a seed-peer badge and `score 0.65`.

**Auto-match:** trigger after a quest or an explain-back. Measure against a baseline taken at mount, so restored state doesn't fire a match on load.

### 4.3 Session (`app/session/page.tsx`)

- Route is `/session`, one active session at a time.
- **Header:**
  - "with Amit".
  - Timer in mono with tabular figures (not the pixel font).
  - Block and Report, always visible.
- **Phase stepper:** You explain → Peer explains → Joint question → Summary. Each step shows a number and label; completed steps get a ✓. Must not overflow at 390px.
- **Left panel:**
  - "Today's swap": You teach / Amit teaches / Both exploring X.
  - Safety, in plain language:
    - Messages are checked before delivery.
    - Block and Report are always one tap away.
    - 18+ only.
- **Messages:**
  - The facilitator is labeled "Guide" and gets a neutral border with a subtle left accent.
  - Safety-checked messages show a small green shield icon with the tooltip "Checked for safety".
- **Wrap-up:** "Session wrapped. End it to update both maps." with an `End & update maps` button.
  - Ending logs a `session` event (with the peer's name) on both concepts.
  - It *suggests* a new concept such as HBM instead of adding it, so the later MCP capture adds it live.
- **Phones:** chat-first, with "Today's swap" and "Safety" as tabs above the chat.
- **Empty state:** explains that sessions start from a match on the map.

### 4.4 Profile (`app/profile/page.tsx`)

- **Header:** display name, plus a stats strip (Concepts / Understood / Sessions / Quests) from `useMapStats()`. These numbers must equal the map's after a reload.
- **Three cards:**
  - **Who you are** ("You set this"): display name, role, background.
  - **How you learn** ("Inferred · editable"): style and pace, plus a "Why we think this…" explanation.
  - **Right now** ("What you're working toward"): current goal.
- **Matching:**
  - Switch "Open to learn with others".
  - Switch "I'm 18 or older".
  - Language select: en, es, hi, pa, ja.
- **Inventory:** grid of `NodeIcon` tiles sorted by mastery. Every tile is focusable and has a title and aria-label of "Name · State".
- **Connected apps:**
  - Copy: "Let AI assistants like Meta AI add questions to your map without opening Further. Treat this key like a password."
  - Key shown masked as `fur_••••3a9c`, with buttons:
    - Reveal / Hide (`aria-pressed`).
    - Copy (shows "Copied").
    - Regenerate (disabled, "Coming soon").
  - A "How to connect" `<details>` holding an `mcpServers` JSON snippet with `${origin}/mcp` and `Bearer <your key>`. Set `origin` after mount to avoid a hydration mismatch.

### 4.5 Builder-only routes

The pages at `app/ops/page.tsx` and `app/connectors/page.tsx` are server wrappers: `if (!BUILDER_VIEW) notFound();`. Each one renders a client component from `components/builder/`.

- **`OpsConsole.tsx`:**
  - Countdowns to the hackathon deadlines. Compute time after mount.
  - Pipeline stages, Meta stack, production-trust list, and requirement tables from `lib/requirements.ts`.
- **`ConnectorConsole.tsx`:** JSON-RPC request and response console, a "Try bad token" button, and the tool list.
- **`AgentLog.tsx`:**
  - Live pipeline lines: TRANSCRIBE → EXPAND → CANONICALIZE → STREAM → MATCH, including the scoring formula.
  - A `MATCH ▶` button.
  - Autoscroll by setting `scrollTop`. Don't use `scrollIntoView`: Chrome returns a Promise, which React treats as an effect cleanup and crashes.

---

## 5. Demo flow to support (plan §2)

1. Speak or type a curiosity. The map blooms over SSE, and the near-duplicate is merged.
2. Open a node and watch the clip. Explain it back; the block upgrades, reaching diamond at mastery 0.7.
3. "Your brain this week" replays 7 days of the world growing, with the camera held still.
4. A match pops up. Accept, have a guided 4-phase session, and end it to update both maps.
5. An off-app MCP capture ("what is HBM memory") arrives through the inbox, and one node appears next to memory bandwidth.

---

## 6. Accessibility

- Every icon-only button has an aria-label **and** a tooltip.
- Dialogs use `role="dialog"`, `aria-modal`, `aria-labelledby` and `aria-describedby`.
- The canvas is keyboard-navigable (§3.4).
- Use `aria-live` for the match countdown and the waiting state.
- Respect `prefers-reduced-motion` everywhere (map, replay, match ring).

---

## 7. Acceptance checks

- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.
- [ ] A learner build has no dev indicator or error overlay.
- [ ] A learner build returns 404 for `/ops` and `/connectors`. A build with `NEXT_PUBLIC_BUILDER_VIEW=true` returns 200 for both and shows the pills, agent log and badges.
- [ ] The banned-word grep over visible learner text is clean.
- [ ] Nav shows only Map, Session and Profile.
- [ ] Profile counts equal the map counts after a full reload.
- [ ] No overlapping map labels at default zoom, including the known pairs "Matrix multiplication"/"Tensor cores" and "Memory bandwidth"/"AI accelerators".
- [ ] Explain it back is visible without scrolling at 1440×900.
- [ ] The token is masked by default.
- [ ] No horizontal overflow at 390px. The header doesn't wrap, the stepper fits, and the match button text doesn't wrap.
- [ ] Screenshots of Map, Inspector, Match, Session and Profile at 1440 and 390 are saved in `docs/screenshots/learner/`.
- [ ] `localStorage.clear()` resets the map and the banner.
- [ ] Update `README.md`, `AGENTS.md` (the sample-data rule: one banner for learners, per-item badges in builder view) and `docs/DESIGN.md`.
