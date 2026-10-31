# Contributing to Further

1. Read README.md and docs/DESIGN.md.
2. Pick a requirement from `/ops` (or lib/requirements.ts). Agree one owner.
3. Branch, e.g. `feature/presence` or `fix/match-expiry`.
4. Keep API contracts in lib/schemas.ts stable, or document the change.
5. `npm run typecheck && npm run build`, then exercise the flow in the browser.
6. Open a focused PR with a screenshot for UI changes and any remaining demo limitations.

Keys live in `.env.local` only. Anything committed here may be licensed to the hackathon organizers, so keep private material out of the repo.
