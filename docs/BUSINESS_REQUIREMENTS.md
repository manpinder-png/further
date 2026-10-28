# Further: business requirements

**Version:** 0.1  
**Date:** October 27, 2026  
**Status:** Draft for team discussion. No team approval or implementation is implied.  
**Decision authority:** Project lead and team. Technical requirements, user stories, tasks, and architecture follow business agreement.

## 1. Purpose and sources

Further helps someone find a useful human connection or live shared experience around what they want to learn **right now**, even when they cannot name the concept well.

This draft translates the project lead's expanded product discussion and subsequent connector clarification into business requirements. The earlier *Real Time Peer Learning* concept brief supplies the starting idea: available learners, concept-level matching, short collaborative sessions, and optional continued contact. The new direction expands this into a changing social intelligence service with multiple interfaces and live event discovery.

This is a product specification for discussion, not a transcript or evidence of the exact hackathon application. It replaces the earlier starter plan. The following distinctions apply throughout:

- **Stated direction:** an outcome or boundary explicitly described by the project lead.
- **Proposed demo scope:** a suggested hackathon boundary, still subject to team agreement.
- **Open decision:** a policy, threshold, or scope choice the team must resolve.

## 2. Business problem and hypothesis

The motivating analogy is low-friction product discovery: a person can express a rough need without knowing the correct search term. Further applies that ambition to finding people and shared learning experiences. This is product framing, not a researched comparison of current markets.

A learner may know only that “GPUs are a black box to me.” Finding a useful person requires deciding where to look, which group to join, how to describe the question, whether anyone is available, and whether their background fits. A permanent network or broad topic label does not express all those conditions at this moment.

**Business hypothesis:** interpreting current learning intent and changing availability can reduce the effort of finding relevant connections and increase useful human participation. This remains a hypothesis to test.

The desired value is faster access to an appropriate connection, useful conversation, and a reason to return when interests change. Potential defensibility comes from the quality of live social intelligence and its feedback. No moat or competitive advantage has yet been demonstrated.

## 3. Stated product direction

1. **The real-time social brain is the core.** It reasons over changing intent, background, availability, and relationships among concepts.
2. **Learning is broader than formal education.** Curiosity and practical knowledge count. Academic credentials do not define the whole experience.
3. **People can keep using their preferred AI for learning.** Further's central purpose is social discovery and connection.
4. **Further owns its intelligence.** A host AI can broker access through a connector while Further performs its own substantial inference, grouping, and matching.
5. **User experience matters.** A learner should complete the journey with little effort. Different interfaces should use the same underlying business behavior.
6. **The demo must behave live.** Supporting infrastructure can be limited, but the defining loop must respond to actual changing backend state.
7. **Business agreement precedes implementation.** The project lead will manage stories and tasks with the team after requirements and technical discussion.

### Exclusions from the present product direction

- A general AI tutor, homework assistant, or content generator as the central product.
- A thin wrapper that forwards questions to an existing assistant without adding live social intelligence.
- A static directory, interest feed, or broad topic room presented as real-time intelligent matching.
- A requirement to build a permanent friend network before receiving value.
- Claims of native integrations, partnerships, access to private assistant conversations, or production scale without evidence.

AI facilitation and independent explanation checks from the original brief remain possible supporting experiences. Their role in the hackathon is an open decision. They must not displace the social brain.

## 4. Participants and information

| Participant or opportunity | Need |
| --- | --- |
| Learner with a rough interest | Discover an appropriate connection without mastering a taxonomy. |
| Peer exploring the same concept | Find someone with compatible current intent and time. |
| Person with complementary experience | Contribute and gain value without assuming a formal teacher role. |
| Temporary group or live room | Find suitable participants while respecting focus and capacity. |
| Live event or stream | Reach relevant learners with accurate subject, language, timing, and joinability. |
| Host AI using a connector | Request social recommendations from authorized context and help the learner act. |
| Demo audience or pilot observer | Understand why results changed and which behavior is genuine. |

**Proposed initial population:** consenting adults in a narrow technical community, following the concept brief. The long-term vision is broader. A product for children would require separate requirements and is outside this proposed pilot.

The following are business concepts, not a database schema.

| Information | Examples | Treatment |
| --- | --- | --- |
| Background that changes slowly | Education, field, expertise, experience, public contributions | Optional context with provenance and correction. Credentials do not establish present intent or teaching ability. |
| Current intent | Rough question, concept, desired understanding, immediate purpose | Time-sensitive and correctable. Old interests must not override a new goal. |
| Fit and availability | Language, time available, willingness to discuss/help, level for this concept | Online does not automatically mean willing. Knowledge level is concept-specific. |
| Community state | Available people, group focus, capacity, active sessions | Fresh enough to support an actionable recommendation. |
| Live opportunity context | Subject, related concepts, live/ended status, language, source link, access conditions | Separate live events from scheduled events and recordings. Show provenance and freshness. |
| Outcomes | Acceptance, decline, successful join, perceived fit/usefulness, voluntary return | A click alone does not establish learning or recommendation quality. |

LinkedIn and other public profiles are possible sources, not guaranteed integrations. Import requires authorization and source access. Private host conversations are not implicitly available. The learner chooses what context to share.

## 5. Business requirements

These are desired outcomes. Proposed demo treatments are recommendations for team discussion, not implementation commitments.

| ID | Required business behavior | Observable evidence | Proposed hackathon treatment |
| --- | --- | --- | --- |
| **BR-01** | Accept an imperfect expression of curiosity without an exact keyword. | A vague description becomes an intent the learner can confirm or correct, with limited clarification. | Core: text input. Voice, images, or sketches are future input options. |
| **BR-02** | Use relevant background while allowing correction and control. | Background remains distinct from current intent. A minimal profile can still participate. | Core: small user-entered profile. Automated enrichment deferred. |
| **BR-03** | Receive intent through an explicit interface or authorized host context. | Learners understand what context informs a recommendation and can stop sharing. | Core: explicit entry. Connector context is a conditional extension. |
| **BR-04** | Infer concept, learning purpose, concept-specific level, and useful fit attributes without slowing the journey excessively. | A concise interpretation supports correction. Uncertain input produces honest clarification or uncertainty. | Core: genuine model-supported interpretation. Exact attributes and confidence handling open. |
| **BR-05** | Relate interests semantically and at different levels of specificity. | Different wording connects when appropriate. Unrelated goals remain separate even when profiles coincide. | Core: narrow concept relationships or hierarchy. No algorithm chosen. |
| **BR-06** | Refresh the view of intent and participation as people arrive, change goals, or leave. | An actual update changes eligible recommendations in another client's experience. Old intent and stale presence cease to dominate. | Core: real independent clients and live state. Multiple simultaneous intents and history policy open. |
| **BR-07** | Combine dimensions of fit, including similar or complementary knowledge, language, and overlapping time. | Reasons refer to the current goal and fit. Mandatory incompatibilities can exclude a superficially related person. | Core: a small explicit set. Geography optional when relevant, not a proxy for language or quality. |
| **BR-08** | Recommend relevant people, groups, or live rooms with an understandable next step. | Learners see what they could explore together, why it fits, and whether it is currently actionable. | Core: one peer/group route. Existing-room discovery optional. |
| **BR-09** | Preserve participant choice and truthful connection state. | People accept, decline, or leave. The experience does not imply consent that was never given. Capacity conflicts produce a clear next step. | Core: explicit agreement. Pairing versus room-entry policy open. |
| **BR-10** | Convert a recommendation into shared human interaction around a common intent. | Two independent participants reach the same session context and genuinely communicate or act together. | Core: minimum shared interaction. Text, voice, video, or verified external handoff is a later choice. |
| **BR-11** | Handle changes and unavailable opportunities honestly. | No-match, expired availability, withdrawal, full room, disconnection, and changed intent have understandable outcomes. Staying connected afterward is optional. | Core: changed intent plus unavailability/disconnect evidence. Detailed recovery follows technical requirements. |
| **BR-12** | Discover relevant live events from current metadata and source context. | A live item appears for relevant intent and changes or disappears when it ends. Source and access conditions are visible. | Vision and stretch: one verified source if feasible. Seeded/replayed items must be labelled. |
| **BR-13** | Support shared participation around a live stream or event. | A group reaches a common event context and interacts. Playback synchronization and external viewing limits are explicit. | Vision: scope separately. Sharing a link alone is not a complete watch party. |
| **BR-14** | Offer the same social intelligence through dedicated UI and a host connector. Further retains inference and matching responsibility. | Comparable authorized intent produces consistent recommendations across channels. The host can present results and assist a permitted next step. | UI proposed for demo. Real host connector conditional on verified identity, capabilities, authentication, and permissions. |
| **BR-15** | Use Meta model capability meaningfully in the social brain. | Actual model output contributes to intent or relevance. Examples show its contribution and visible failure behavior. | Core: genuine Meta use. Model/provider, access, credits, latency, and costs require verification. |
| **BR-16** | Give people control over visibility and interpersonal interaction. | Discoverability is opt-in, shared context is understandable, withdrawal works, and a practical block/report path exists. Sensitive inferences are not presented as facts. | Core trust boundary. Profile visibility, response, and retention policies open. |
| **BR-17** | Make changing decisions understandable and demonstrable. | Evidence links a current signal to its interpretation, match rationale, and later change without revealing private model reasoning or other people's private context. | Core: visible freshness and a reasoned update. Separate internal observability UI optional. |
| **BR-18** | Remain useful as activity and inference cost grow. | Measurements identify tested activity, latency, freshness, cost where available, and degradation. The team explains growth and remaining limits. | Core: bounded measurement and credible growth argument. Global operation remains an ambition. |
| **BR-19** | Evaluate connection quality and learning usefulness. | Measure time to relevant connection, successful joins, mutual participation, and voluntary fit/usefulness feedback. | Core: basic outcomes. Explain-back optional. Longitudinal improvement and return need a later pilot. |

## 6. Social brain behavior

The engine maintains a useful view of **who wants to learn what now**, **who can participate**, and **which opportunities fit**. It interprets incoming signals and updates relationships among people, concepts, and live opportunities. Background informs context, while current intent and consent determine participation.

Concepts can relate at different levels. “Computing,” “machine learning hardware,” and “why GPUs help neural-network training” describe increasingly specific interests. The team must choose which specificity produces useful conversation. Hierarchical clustering, embeddings, graphs, and ranking are later technical options.

Similarity is one route to value. A beginner may benefit from a peer or a more experienced person currently willing to explore that particular question. The recommendation should explain the proposed relationship. Expertise creates no automatic obligation to teach.

A participant who leaves, changes focus, or no longer has time should cease appearing as an actionable match. If Further proposes broader alternatives, any relaxation of constraints should be apparent to the learner.

## 7. Illustrative journeys

These are business illustrations, not approved wireframes or user stories.

### A. Dedicated interface

1. A learner enters “I don't understand why AI needs special chips” and opts into discovery for a short conversation.
2. Further interprets the interest, offers correction, and uses language/time preferences.
3. Another learner independently expresses a compatible interest using different wording. Their availability and background make a connection plausible.
4. Further explains its recommendation. Participants choose whether to join.
5. Both reach a common question and genuinely interact.
6. A participant changes to an unrelated goal or becomes unavailable. Recommendations change in the other client's experience.
7. People leave, optionally provide feedback, and choose whether to stay connected.

### B. Host AI using Further

A learner already using an AI application asks to meet someone exploring the same question. With authorized context, the host calls Further. Further performs its own interpretation and matching against its live community state. The host presents the result and helps with a permitted next step. Further remains responsible for its social intelligence.

The project lead called the proposed host **Muse**. Its exact identity, connector mechanism, context access, and available join actions are unverified. Do not assume endorsement or access to a private platform API. A test client can illustrate the boundary, but does not prove a working Muse integration.

### C. Live opportunity

A relevant stream begins. Further obtains authorized current metadata and relates it to active learning intents. Interested people join a common event context or watch party, depending on agreed scope and platform capability. When it ends, the event ceases to appear as live. Event discovery and synchronized viewing are separate capabilities.

## 8. Proposed hackathon boundary

**Stated constraint:** demonstrate the business journey and real-time engine even if supporting infrastructure is incomplete. The project lead's “50–60% plumbing” illustration expresses tolerance for limited infrastructure. It is not a measured completion goal or permission to simulate the core.

**Proposal:** use consenting adults in one technical community, a dedicated UI, two independent clients, actual Meta-supported interpretation, backend recommendations reacting to live state, and a genuine shared interaction. Keep the scenario narrow enough for the three-minute demo and the recorded November 4, 2026 at 9 p.m. Eastern submission deadline.

| Must be genuine in the proposed demo | May be simplified with disclosure | Conditional extensions |
| --- | --- | --- |
| Independent participants and live availability | Small invited population and manually entered background | Authorized live event ingestion |
| Actual interpretation and matching affecting results | Limited concept scope, languages, and fit dimensions | Shared event participation or watch party |
| Changed input or departure affecting another client | Temporary storage and limited persistence | Verified host AI connector |
| Participant choice and actual shared interaction or verified handoff | Minimal communication surface | Public-profile enrichment and more input modes |
| Meaningful Meta inference and measured observations | Reasoned growth argument based on a bounded test | Larger labelled synthetic workload |

A native host integration, multimodal intake, event ingestion, watch parties, profile enrichment, and production operations are not silently promised. Their value remains in the specification so the team can choose a deliberate scope tradeoff.

## 9. Evidence and success measures

The audience should see a complete business story and evidence of the engine reacting to reality: unclear interest, interpreted intent, compatible live participant, understandable recommendation, mutual join, and a visible change after a real update.

| Question | Evidence | Target status |
| --- | --- | --- |
| Can someone express a rough goal? | Input, inferred intent, confirmation/correction, and clarification effort | Examples and quality criteria to agree |
| Does Further add social intelligence? | Related goals with different wording connect, unrelated/incompatible goals do not | Positive and negative cases to agree |
| Is it actually live? | Independent clients, timestamps, changes after arrival/intent/departure | Required demonstration, freshness threshold open |
| Can a suggestion become a connection? | Time to relevant result, acceptance, successful shared join, participation | Targets to agree |
| Is it useful? | Voluntary feedback from both people, optional independent explanation | Hypothesis to test, no improvement claim yet |
| What did Meta contribute? | Selected model, actual contribution, latency, failures, cost where available | Verify during implementation |
| What scale was tested? | Real versus synthetic clients, update rate, response percentiles, freshness, model-call volume, degradation | Baseline unmeasured |

The example of 20 million concurrent users and 8% learning activity was explicitly hypothetical. It is not market evidence, platform telemetry, a load-test result, or a hackathon target.

## 10. Risks and open decisions

| Risk | Business response to discuss |
| --- | --- |
| Insufficient simultaneous participants | Start with an invited narrow cohort and label it honestly. |
| Similar labels but weak conversations | Validate intent and complementary fit through actual participant feedback. |
| Stale presence or uncertain interpretation | Retire stale results, show uncertainty, support correction and no-match outcomes. |
| Intrusive discovery | Explicit context sharing and opt-in visibility. No silent harvesting of chats or profiles. |
| Provider, event, or host dependencies | Verify access and permissions before promising integration. |
| Scope exceeds time | Protect the genuine live loop. Add connectors/events only with an explicit tradeoff. |
| Scale claims exceed evidence | State measured limits and separate the future growth argument from test results. |

Before technical requirements, the team should resolve:

1. Confirm the boundary and exact proposed Muse host.
2. Choose the first adult cohort and compelling learning scenario.
3. Define useful matching and mandatory fit constraints, including similar versus complementary knowledge.
4. Choose one-to-one, small-group, or existing-room connection.
5. Agree the minimum shared interaction and success definition.
6. Decide whether connector or event capability belongs in the hackathon, and what it displaces.
7. Set wait-time, freshness, no-match, and test-volume expectations.
8. Agree minimal profile data, visibility, consent, retention, and participant controls.
9. Decide whether facilitation, feedback, or explain-back adds enough demo value.
10. Approve a versioned business baseline before technical requirements, detailed journeys/stories, and tasks.

## 11. Traceability and approval

| Direction | Requirements |
| --- | --- |
| Rough interest with little friction | BR-01, BR-03, BR-04 |
| Static background plus dynamic intent | BR-02, BR-06, BR-07 |
| Semantic, hierarchical, multidimensional intelligence | BR-04, BR-05, BR-07, BR-08, BR-17 |
| Human choice and a live connection | BR-09, BR-10, BR-11, BR-16, BR-19 |
| Live events and watch parties | BR-12, BR-13 |
| Decoupled UX with Further's own AI | BR-03, BR-14, BR-15 |
| Genuine proof and credible growth | BR-06, BR-15, BR-17, BR-18 |

**Approval:** pending team review.  
**Current state:** requirements draft only. The starter and backlog are withdrawn. No stack, integration, event source, model connection, story set, ownership, or production-scale capability is approved or implemented by this document.
