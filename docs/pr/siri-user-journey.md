# User journey demo with Meta-model provider fallback

Branch: `feature/siri-user-journey` (local; not yet pushed)

## Problem and resulting behavior

The starter showed a single form, four sample peers and a practice page. We need a demo of the full user journey that the team can click through, using Meta models for the AI steps and still running with no keys.

`python3 -m further` now runs a six-step journey:

1. **Command bar**: "What are you here for?", three example chips, and an "N learners online now" counter (sample data).
2. **Profile card**: a Meta model turns the vague intent into focus_area, concept, sharpened_question, tier (1–5, for this concept only), learning_style, language and availability_minutes. Name, experience_years and expertise_areas are fixed. The fields animate in and every one can be edited.
3. **Social brain map**: 80 sample learners in 8 topic clusters, drawn with a vanilla SVG force layout. Your node moves into the nearest cluster, hovering a node shows that person's intent, and a side panel lists cluster sizes.
4. **Match card**: "4 people are exploring this right now". Tiers are mixed on purpose. You can join the session (with a lobby countdown) or find another group.
5. **Session room**: the pinned question, one AI starter prompt from the session plan, members with tiers, a timer, and scripted sample messages.
6. **Wrap-up**: each person writes a one-line explain-back and marks peers who explained clearly. Then you see the tier change for the concept, a separate reputation score and a memory trail. There is no leaderboard.

**Inference** goes through the new `further/providers.py`, whose single interface is `complete_json(system, user, schema) -> dict`.

- **Order:** meta → fireworks → baseten → demo, set by `FURTHER_PROVIDERS`. Demo is always last.
- **Fallback:** every response is checked against a schema. Missing settings mean the provider is skipped. An error, a timeout (10 s by default) or invalid output moves on to the next provider.
- **Visibility:** a badge shows which provider and model answered, the latency, and any providers that failed first. The server logs one line per attempt and never logs keys or user text.
- **Shared client:** Fireworks and Baseten use one OpenAI-compatible urllib client.
- **Provider check:** `python3 -m further.check_providers` sends one tiny request to each provider and prints pass/fail, model and latency.

**New routes:** `GET /api/learners` and `POST` `/api/profile`, `/api/placement`, `/api/group` and `/api/wrapup`. `/api/health` now lists the provider order and which providers are configured, without any values. There is also a stretch MCP stub at `POST /mcp` with two tools, `share_my_intent` and `find_my_group`. Existing routes and their contracts are unchanged.

Issue: none linked yet. This covers the Experience workstream in docs/DELIVERY.md.

## Validation

- [x] Ran python3 -m unittest discover -s tests -v: 51 tests pass (17 existing, unchanged, and 34 new) on Python 3.9.6. All HTTP is mocked and no test calls a real API.
- [x] Exercised the changed flow manually: the whole journey was run in headless Chrome at 1440 px and 390 px wide in demo mode, with no console errors.
- [ ] Added screenshots for UI changes: taken locally, not committed. Attach them when the PR is opened.
- [x] Checked success, empty, and failure states:
  - **Success:** the full journey in demo mode.
  - **Empty:** no group in the chosen language gives a clear message, and Join is disabled.
  - **Failure:** fallback through each provider on HTTP error, timeout and invalid JSON (mocked). Meta-only mode with no key returns a visible 502.
- [ ] Live Meta call: not run yet, because there are no keys on this machine. Run `python3 -m further.check_providers` with a real `META_API_KEY` before the demo.

## Demo integrity

- [x] Sample users and mock outputs remain clearly labelled. Learners, room messages, peer explain-backs, simulated peer marks and the earlier memory-trail entries are all marked as sample.
- [x] Real Meta usage is distinguished from demo behavior. The badge names the provider and model, and demo output says "demo · no model call".
- [x] No keys, private account notes, or sensitive user content are committed. `.env` is git-ignored, and `.env.example` contains no values.

## Remaining limitations

- **Group size:** the product brief says two-person sessions first, but this demo shows groups of four. The team should agree on one.
- **No real people:** everyone is a sample learner. Room messages are scripted, and peers' "explained clearly" marks on your explanation are simulated from its length, not judged by a model.
- **No saved data:** a page reload resets the trail and reputation.
- **Fireworks and Baseten:** the base URLs and Meta Llama model IDs are deliberately empty, with TODOs pointing to each provider's docs. The Meta defaults (`https://api.meta.ai/v1`, `muse-spark-1.3`) are the starter's documented values from Oct 27. Check them against the account.
- **Meta-family models:** the code can't check a model's family, so "Meta models only" is enforced by configuration, not code.
- **Mode precedence:** `FURTHER_AI_MODE=demo` (used by CI) overrides `FURTHER_PROVIDERS`, and `FURTHER_AI_MODE=meta` keeps the original strict, no-fallback behaviour. Leave both unset to use the fallback chain.
- **MCP stub:** it has no sessions, streaming or auth and only listens on loopback. It is a starting point, not a working integration.
- **Out of scope:** real users, shared live rooms, saved data, login, and deployment (planned on Modal). These are listed in the README under next steps.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
