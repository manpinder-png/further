# Further development

- Read README.md and docs/DESIGN.md before changing behavior. The hackathon build plan is the spec; its 3-minute demo is the acceptance test.
- Stack: Next.js App Router + TypeScript + Tailwind v4. Node 20+.
- Keep the core goal: concept-level matching between available people; AI facilitates human learning.
- Learner view: whenever sample data is shown, the map shows one dismissible banner ("You're exploring with sample data."). Per-item DEMO/SEED badges, infra status and the agent log are builder-only (`NEXT_PUBLIC_BUILDER_VIEW=true`, see lib/builder.ts). Never describe fixtures or demo responses as real users or live model output.
- Learner-facing copy is plain language: no model, vendor, infra or API names, no scores or formulas. Keep those behind the builder flag.
- lib/math.ts and lib/matching.ts are shared by UI and server. Change them in one place, never fork the formulas.
- Every API route validates input with Zod (lib/schemas.ts). Server-only modules import "server-only". Never put keys in NEXT_PUBLIC_ vars.
- Real user data goes only to the non-contributor model (META_MODEL). Contributor models are for dev and evals.
- Run `npm run typecheck` and `npm run build` before pushing.
- Never commit .env*, credentials, provider keys, private account details, onboarding notes, or user conversation exports.
- Record UI decisions in docs/DESIGN.md and update lib/requirements.ts when a requirement's status changes.
- Use short feature branches and focused PRs.
