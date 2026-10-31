# Further development

- Read README.md and docs/DESIGN.md before changing behavior. The hackathon build plan is the spec; its 3-minute demo is the acceptance test.
- Stack: Next.js App Router + TypeScript + Tailwind v4. Node 20+.
- Keep the core goal: concept-level matching between available people; AI facilitates human learning.
- Preserve explicit labels for seed peers and demo output. Never describe fixtures or demo responses as real users or live model output.
- lib/math.ts and lib/matching.ts are shared by UI and server. Change them in one place, never fork the formulas.
- Every API route validates input with Zod (lib/schemas.ts). Server-only modules import "server-only". Never put keys in NEXT_PUBLIC_ vars.
- Real user data goes only to the non-contributor model (META_MODEL). Contributor models are for dev and evals.
- Run `npm run typecheck` and `npm run build` before pushing.
- Never commit .env*, credentials, provider keys, private account details, onboarding notes, or user conversation exports.
- Record UI decisions in docs/DESIGN.md and update lib/requirements.ts when a requirement's status changes.
- Use short feature branches and focused PRs.
