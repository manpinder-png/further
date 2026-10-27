# Product brief

## The problem

Someone wants to understand one concept now, but finding a relevant learning partner requires an existing network, a permanent group, or luck. Broad topic rooms do not guarantee a useful conversation.

## The experience

1. Arrive with a vague thought or a concrete question.
2. Refine it into a shared learning goal.
3. Match with people who are available now, considering topic, complementary knowledge, language, and time.
4. Join a small temporary session. People explain, ask questions, compare examples, and reason together.
5. Leave with an independent explain-back check. Staying connected is optional.

## Proposed hackathon MVP

These are implementation targets, not claims about what currently works.

- Adult technical learners; begin with GPUs/TPUs or another narrowly scoped technical concept.
- Two-person live sessions before larger groups.
- A visible available-now queue and understandable match rationale.
- A shared text conversation or lightweight shared room.
- Meta model assistance with goal refinement, session prompts, and an independent understanding check.
- One complete live demo: two people join, match, learn together, and explain something more clearly.

The local starter already demonstrates a question form, deterministic sample matching, sample practice prompts, and a server-side Meta adapter. It does not yet provide real multi-user presence, communication, or semantic matching.

## Success checks

| Measure | What we need to capture |
| --- | --- |
| Time to useful match | Join timestamp to accepted match timestamp |
| Session usefulness | Short post-session feedback from both participants |
| Understanding | A before/after explanation assessed with a transparent rubric |
| Participation | Both people contribute during the session |
| Return intent | Whether a learner wants another session |

Use consented pilot data. Do not invent outcome numbers or portray seeded peers as participants.

## Demo differentiation

The centerpiece is a human-to-human learning interaction enabled by concept-level matching. A generic education chatbot is not the product. Show why the match was useful and what each person can independently explain afterward.

## Decisions still open

- Actual team/workstream ownership.
- Narrow pilot topic and evaluation examples.
- Production framework and persistence/real-time transport.
- Final Meta model and direct API versus eligible partner-hosted open-weight model.
- Moderation, room safety, retention, deployment, and licensing.
