# UI domain

Keep the Iteration-nov1 map, journey panel and topic panel as the visual foundation.

- UI reads transport contracts, never the database or model credentials.
- Use `lib/client/live.ts` for same-origin requests and explicit rehearsal-mode headers.
- Local data is the default. A failed load/save must remain visible; never replace it silently with sample people.
- A mutation has one stable idempotency key. Server-persisted agent/session results must not be posted as additional learning events.
- Restore shared rooms from their authorized server snapshot, not transient React state.
- Show safe agent activity, delegation, tool progress and streamed draft answers to every learner while work runs. Never expose raw prompts, private tool payloads or model reasoning. Keep provider configuration in developer surfaces. Label drafts as provisional until the final validated result, and label every synthetic result.
- Report actual saved/delivered states. A button click is not evidence of completion or learning.
