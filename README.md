# Further

Learn something. Move forward together.

Further connects people who are available now and want to understand a specific concept. AI helps turn a vague interest into a useful question and guides a short session; people do the explaining and reasoning.

**Status: working local demo of the full user journey, not the finished hackathon product.** All learners are explicitly labelled samples and room messages are scripted. Meta models draft the profile and the session plan when keys are set; without keys the app runs in a clearly labelled demo mode. Real people, shared live rooms, persistence, authentication, and deployment are next steps (see below).

## Start here

Requires Python 3.9 or newer. No package install, Node.js, API key, or paid service is needed for the default demo.

    git clone https://github.com/manpinder-png/further.git
    cd further
    python3 -m further

Open http://127.0.0.1:8000. On Windows, use python instead of python3 if needed.

Click one of the example chips (or type your own intent) and follow the six steps: intent, profile, brain map, match, session room, wrap-up. The 5-minute demo script below walks through it.

    python3 -m unittest discover -s tests -v

The server binds to loopback only. This starter is intended for local development; a deployable multi-user service is a separate work item.

## Team workspace

- [Project board](https://github.com/users/manpinder-png/projects/1)
- [Repository issues](https://github.com/manpinder-png/further/issues)
- [Product brief](docs/PRODUCT.md)
- [Architecture and API](docs/ARCHITECTURE.md)
- [Workstreams and milestones](docs/DELIVERY.md)
- [Contribution guide](CONTRIBUTING.md)

Pick an issue, agree ownership on the board, and use a short branch and pull request. Initial workstream suggestions are UI, presence/matching, room collaboration, and AI/evaluation. These are unassigned suggestions until the team agrees who owns each.

## The user journey

| Step | What you see | What powers it |
| --- | --- | --- |
| 1. Command bar | "What are you here for?", three example chips, a live "N learners online now" counter | Sample data (`GET /api/learners`) |
| 2. Profile card | The vague intent turned into focus_area, concept, sharpened_question, tier (1–5, per concept), learning_style, language, availability_minutes, plus a fixed name, experience_years and expertise_areas. Fields animate in; every field is editable | **Meta model** (`POST /api/profile`), or the demo heuristic |
| 3. Social brain map | 80 sample learners in 8 topic clusters (SVG force layout). Your node moves into the nearest cluster; hover any node to read that person's intent; a side panel lists cluster sizes | `POST /api/placement`, vanilla JS in `web/map.js` |
| 4. Match card | "4 people are exploring this right now": first names, per-concept tier, one-line intent, tiers mixed on purpose. Join session (short lobby countdown) or Find another group | `POST /api/group` (deterministic, in `domain.py`) |
| 5. Session room | Pinned shared question, one AI starter prompt, member list with tiers, countdown timer, a few scripted sample messages | **Meta model** session plan (`POST /api/plan`) |
| 6. Wrap-up | One-line explain-back from each person, mark peers as "explained clearly", then tier change for this concept, a separate reputation score and a memory trail. No leaderboard | `POST /api/wrapup` (transparent rules in `domain.py`) |

A badge in the top bar, on the profile card and on the starter prompt always shows which provider and model answered, how long it took, and whether earlier providers failed.

## Provider configuration (Meta models only)

All inference goes through `further/providers.py`. Every provider has the same interface, `complete_json(system, user, schema) -> dict`, and every response is checked against a schema before use.

| Order | Provider | Settings | Notes |
| --- | --- | --- | --- |
| 1 | `meta` | `META_API_KEY`, `META_API_URL`, `META_MODEL` | Meta Model API (Muse). Defaults: `https://api.meta.ai/v1`, `muse-spark-1.3` (checked Oct 27, 2026; [quickstart](https://dev.meta.ai/docs/quickstart), [chat completions](https://dev.meta.ai/docs/protocols/chat-completions)). The original `MODEL_API_KEY`, `MODEL_API_BASE_URL`, `MODEL_ID` names still work. |
| 2 | `fireworks` | `FIREWORKS_API_KEY`, `FIREWORKS_URL`, `FIREWORKS_MODEL` | OpenAI-compatible. **TODO:** copy the base URL and a Meta Llama model ID from [docs.fireworks.ai](https://docs.fireworks.ai/). No defaults, on purpose. |
| 3 | `baseten` | `BASETEN_API_KEY`, `BASETEN_URL`, `BASETEN_MODEL` | OpenAI-compatible. **TODO:** copy the base URL and a Meta Llama model ID from [docs.baseten.co](https://docs.baseten.co/). No defaults, on purpose. |
| 4 | `demo` | none | Deterministic, local, never fails. Always last. |

How it behaves:

- Copy `.env.example` to `.env` (ignored by git) and fill in what you have. Restart the server.
- `FURTHER_PROVIDERS` sets the order (default `meta,fireworks,baseten,demo`). `demo` is always added last.
- A provider with missing settings is skipped. An HTTP error, a timeout (`FURTHER_PROVIDER_TIMEOUT_SECONDS`, default 10) or a response that fails the schema moves on to the next provider.
- The server logs one line per attempt: task, provider, model and latency. It never logs keys or what the learner typed.
- `FURTHER_AI_MODE=demo` forces demo only (CI uses this). `FURTHER_AI_MODE=meta` forces Meta only, with errors shown and no fallback, which is the starter's original behaviour.
- Keys stay on the server, redirects are not followed, responses are size-capped, and model output is rendered with `textContent` only.
- Only configure Meta-family models. The code can't verify a model's family, so this is a team rule.

Check which providers work (sends one tiny request to each configured provider, which may cost a fraction of a cent):

    python3 -m further.check_providers

Example output with no keys set:

    Active order: meta -> fireworks -> baseten -> demo

    NAME        STATUS  MODEL                         LATENCY   NOTE
    meta        SKIP    -                             -         META_API_KEY is not set on the server.
    fireworks   SKIP    -                             -         Fireworks needs FIREWORKS_API_KEY, FIREWORKS_URL, FIREWORKS_MODEL.
    baseten     SKIP    -                             -         Baseten needs BASETEN_API_KEY, BASETEN_URL, BASETEN_MODEL.
    demo        PASS    (none, local)                 0ms

    Live Meta-model providers working: none (demo only)

It exits with status 1 if any configured provider fails. Unit tests mock all HTTP and never call a real API.

## 5-minute demo script

Before you start: set your keys in `.env`, run `python3 -m further.check_providers` and confirm meta shows PASS, then run `python3 -m further` and open http://127.0.0.1:8000. If there are no keys, the demo still works and the badge says "demo · no model call". Say so out loud.

| Time | Click | Say |
| --- | --- | --- |
| 0:00 | Landing page | "Further is for the moment you want to understand one thing right now. No course, no permanent group. Just people who are curious about the same concept at the same time." Point at the online counter: "These are sample learners for the demo." |
| 0:30 | Chip "Why GPUs matter for ML" | "I typed something vague, the way people really do." |
| 0:45 | Profile card fills in | "A Meta model turns that into a profile: one concept, a sharper question, and my tier on *this concept*, not my job title." Point at the badge: "This is the provider and model that answered, and how long it took." Change one field, for example the tier or the minutes: "Everything is editable. The AI suggests, I decide." |
| 1:30 | Find my people → map | "This is the social brain map: 80 sample learners in 8 topics. My node moves into the cluster nearest my question." Hover two or three nodes: "Each dot is a person's intent. Look, a principal engineer with 18 years asking what a CUDA kernel is. Seniority and concept tier are different things." |
| 2:15 | See who's here → match card | "Four people exploring this right now. The tiers are mixed on purpose: someone further along, someone at my level, someone newer, so everyone explains and everyone asks." Click Find another group once to show a different mix. |
| 2:45 | Join session → lobby → room | "A short lobby, then the room. The shared question is pinned. The starter prompt comes from the Meta model, and it asks us to reason rather than giving us the answer." Let two scripted messages appear. "These messages are scripted for the demo; live rooms are the next milestone." |
| 3:30 | Wrap up → type a one-liner, mark two peers | "Before you leave, everyone explains it back in one line, and peers mark the explanations that landed." |
| 4:00 | See what moved | "My tier on GPU parallelism went up because peers marked my explanation clear. Reputation is separate: it rewards explaining clearly and giving feedback. It's yours alone, with no leaderboard." Point at the memory trail: "Over time this becomes a trail of concepts I can actually explain." |
| 4:30 | Close | "Next we're adding real people and live rooms, then deploying. The AI's job stays the same: help people find each other and think together, not replace them." |

## What is sample and what is real

| Real in this demo | Sample or simulated |
| --- | --- |
| Meta model calls for the profile card and the session plan (when keys are set), with the provider and model shown | All 80 learners, their intents, tiers and online status |
| Provider fallback, schema validation, latency and failure reporting | "N learners online now" (counted from sample data) |
| Your edits to the profile, cluster placement, group selection and tier/reputation maths | Scripted room messages and peers' explain-back lines |
| Your own chat messages and explain-back (kept in the page only) | Peers' "explained clearly" marks on *your* explanation (simulated from its length, not judged by AI) |
| | The two earlier memory-trail entries and the starting reputation (labelled "sample history") |

Nothing is saved: reloading the page starts over.

## Next steps (out of scope for this demo)

- Real users and a real presence queue in place of sample learners.
- Shared live rooms (real-time messages between people).
- Saved data: profiles, memory trail and reputation.
- Login and room membership authorization.
- Deployment (planned on Modal) with rate limiting, TLS and spend controls.
- Let a Meta model assess explain-backs against a stated rubric, instead of the simulated marks.
- Stretch: an MCP endpoint (`share_my_intent`, `find_my_group`) so Further could be opened from Muse, Claude or ChatGPT.

## Hackathon target

Startup track, Meta Global AI Developer Hackathon. Submission is due November 4, 2026 at 9 p.m. Eastern. Present only contributions built during the event. The repository must be public and the submission needs an accessible three-minute demo video.

The final product must demonstrate real peer interaction and meaningful Meta model use. This demo covers the journey and Meta model use, but not yet real peer interaction. See docs/DELIVERY.md for the acceptance checks.

## License

The team has not selected a software license yet. Resolve this before the final submission.
