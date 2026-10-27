# Further development

- Read README.md, docs/PRODUCT.md, and docs/ARCHITECTURE.md before changing behavior.
- Keep the core goal: concept-level matching between available people; AI facilitates human learning.
- Preserve explicit labels for sample peers and demo-generated prompts. Never describe fixtures or mock output as real users or live model output.
- The baseline uses Python's standard library and a browser UI. Keep startup and tests dependency-free unless an agreed issue changes the stack.
- Run python3 -m unittest discover -s tests -v after functional changes.
- Never commit .env, credentials, provider keys, private account details, onboarding notes, or user conversation exports.
- Changes should preserve server-side keys, bounded inputs, same-origin checks, timeouts, and visible provider failures.
- Keep the loopback-only default. Authentication, durable storage, abuse controls, and live room authorization must precede a public deployment.
- Use short feature branches and focused PRs. Claim a workstream on the project board before overlapping work.
- Do not assign teammates by email or invent GitHub handles.
- Record implementation decisions and remaining demo limitations in the documentation.
