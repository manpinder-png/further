# Further: business requirements

**Version:** 0.2  
**Date:** October 27, 2026  
**Status:** Draft for team discussion. No team approval or implementation is implied.  
**Decision authority:** Project lead and team. Technical requirements, user stories, tasks, and architecture follow business agreement.

## 1. Purpose and sources

Further helps someone find a useful human connection or live shared experience around what they want to learn **right now**, even when they cannot name the concept well.

This revision translates the project lead's expanded product discussion, continuity requirement, and evolving-user-context clarification into business requirements. The earlier *Real Time Peer Learning* concept brief supplies the starting idea: available learners, concept-level matching, short collaborative sessions, and optional continued contact. The new direction expands this into a changing social intelligence service with multiple interfaces and live event discovery.

This is a product specification for discussion, not a transcript or evidence of the exact hackathon application. It replaces the earlier starter plan. The following distinctions apply throughout:

- **Stated direction:** an outcome or boundary explicitly described by the project lead.
- **Proposed demo scope:** a suggested hackathon boundary, still subject to team agreement.
- **Open decision:** a policy, threshold, or scope choice the team must resolve.

Version 0.2 incorporates the October 27 discussion of continuity across interfaces, three categories of user information, and distinct understanding and recommendation capabilities. It preserves the broader social and live-event vision. Architecture ideas remain options for later evaluation. The product direction recorded here does not imply team approval or implementation.

## 2. Business problem and hypothesis

The motivating analogy is low-friction product discovery: a person can express a rough need without knowing the correct search term. Further applies that ambition to finding people and shared learning experiences. This is product framing, not a researched comparison of current markets.

A learner may know only that “GPUs are a black box to me.” Finding a useful person requires deciding where to look, which group to join, how to describe the question, whether anyone is available, and whether their background fits. A permanent network or broad topic label does not express all those conditions at this moment.

**Business hypothesis:** interpreting current learning intent and changing availability, while carrying useful context between interfaces, can reduce the effort of reaching an appropriate human connection. This remains a hypothesis to test.

**Proposed primary outcome:** a timely, useful connection that fits the goals and willingness of everyone involved, with less repeated explanation. Connection usefulness and participation matter more than displaying a plausible recommendation. The team must choose its primary measure and threshold.

The desired value is faster access to an appropriate connection, useful conversation, and a reason to return when interests change. Potential defensibility comes from the quality of live social intelligence and its feedback. No moat or competitive advantage has yet been demonstrated.

## 3. Stated product direction

1. **The real-time social brain is the core.** It reasons over changing intent, background, availability, and relationships among concepts.
2. **Learning is broader than formal education.** Curiosity and practical knowledge count. Academic credentials do not define the whole experience.
3. **People can keep using their preferred AI for learning.** Further's central purpose is social discovery and connection.
4. **Further owns its intelligence.** A host AI can broker access through a connector while Further performs its own substantial inference, grouping, and matching.
5. **One continuing experience spans interfaces.** Goals, relevant context, connections, and ongoing activity should carry between Further's dedicated UI and Muse through a connector. People should resume the same activity without explaining themselves again. The dedicated UI can expose a fuller experience while supported connector actions use the same underlying understanding.
6. **The demo must behave live.** Supporting infrastructure can be limited, but the defining loop must respond to actual changing backend state.
7. **Business agreement precedes implementation.** The project lead will manage stories and tasks with the team after requirements and technical discussion.
8. **User understanding has a common contract.** Profile information, evolving long-term information, and current-task information use consistent attribute definitions. Each person's values change independently.
9. **Further performs two distinct business functions.** It maintains an understanding of the user and uses that understanding to recommend suitable people or opportunities. This does not prescribe a particular number of models or services.
10. **Technical possibilities must serve business outcomes.** Responsiveness, recommendation quality, affordable operation, and growth are requirements to define. Model sizes, vector search, clustering, hybrid approaches, and multimodal processing remain implementation or scope options.

The practice questions discussed for Muse are examples of connector use. They do not define the full scope of Further's own interface. Dividing questions by interface is deferred. One working connector can demonstrate continuity and an extensible pattern; support for additional applications still depends on their capabilities and authorized integrations.

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

### Three categories of user information

The project lead requires standardized attributes represented through a consistent JSON metadata contract. The business agreement defines their meaning, ownership, and update behavior. Exact keys, types, validation, and storage design follow in technical requirements.

| Category | Business meaning | Update principle |
| --- | --- | --- |
| Profile information | Relatively stable information the user provides or maintains, such as language and relevant background. | Editable by the user. Stable does not mean permanently unchangeable. |
| Long-term information | Continuing goals, relevant experience, and preferences that may evolve as the person grows. | May be stated or inferred. Lasting changes must be distinguished from temporary exceptions. |
| Current-task information | What the person is trying to do now, the immediate obstacle, desired participation, and current constraints. | Changes with the ongoing interaction and remains attached to that activity when the interface changes. |

The categories describe duration and purpose. Whether a value was stated, inferred, or confirmed is a separate distinction. An unknown value must remain unknown rather than becoming an invented fact.

A change to one person's values affects that person's state and relevant authorized recommendations. A change to attribute definitions is a coordinated, versioned change to the shared contract. It does not require different users to have the same values.

**Proposed demo policy:** show user confirmation before an inferred change becomes an enduring preference. The broader policy for automatic consolidation, expiry, conflicting evidence, and confirmation frequency remains a team decision. The current conversation can update either current or long-term information when the intended scope is clear, subject to the agreed confirmation policy.

### Information that can support a connection

These are candidate business concepts, not an approved field list. Relevant context must remain understandable and correctable.

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
| **BR-01** | Accept an imperfect expression of curiosity without an exact keyword. | A vague description becomes an intent the learner can confirm or correct, with limited clarification. | Core proposal: text input. Spoken explanations, images, or shared artifacts are opportunities to assess for user benefit, not committed demo inputs. |
| **BR-02** | Use relevant profile and long-term information while allowing correction and control. | Background and usual preferences remain distinct from the current need. A minimal profile can still participate. | Core: a small user-entered profile and one meaningful ongoing preference. Automated enrichment deferred. |
| **BR-03** | Receive current intent through the dedicated interface or authorized host context. | Learners understand what context is shared, can stop sharing, and can continue the same activity through supported entry points. | Explicit entry plus one desired connector journey. Host access and permitted actions require verification. |
| **BR-04** | Infer a useful, correctable view of concept, purpose, concept-specific knowledge, and connection needs. | An interpretation follows the common attribute meanings, preserves uncertainty, and responds to the user's correction. | Core: genuine model-supported interpretation. Exact attributes and confidence treatment follow agreement. |
| **BR-05** | Relate interests semantically and at different levels of specificity. | Different wording connects when appropriate. Unrelated goals remain separate even when profiles coincide. | Core: narrow concept relationships or hierarchy. No algorithm chosen. |
| **BR-06** | Refresh intent and participation as people arrive, change goals, or leave. | Actual changes affect the relevant authorized views and recommendations, including an ongoing activity resumed through another interface. Stale intent and presence cease to dominate. | Core: independent clients and real state changes. Freshness thresholds, simultaneous goals, and history policy remain open. |
| **BR-07** | Combine dimensions of fit, including similar or complementary knowledge, language, and overlapping time. | Reasons refer to the current goal and fit. Mandatory incompatibilities can exclude a superficially related person. | Core: a small explicit set. Geography optional when relevant, not a proxy for language or quality. |
| **BR-08** | Recommend relevant people, groups, or live rooms with a clear reason and next step. | The result fits the requested kind of participation, respects both sides' willingness and constraints, and is currently actionable. | Core: one chosen connection route. A correction triggers reconsideration; the same person may remain suitable. |
| **BR-09** | Preserve participant choice and truthful connection state. | People accept, decline, or leave. The experience does not imply consent that was never given. Capacity conflicts produce a clear next step. | Core: explicit agreement. Pairing versus room-entry policy open. |
| **BR-10** | Convert a recommendation into shared human interaction around a common intent. | Two independent participants reach the same session context and genuinely communicate or act together. | Core: minimum shared interaction. Text, voice, video, or verified external handoff is a later choice. |
| **BR-11** | Handle changes and unavailable opportunities honestly. | No qualifying match, expired availability, withdrawal, full room, disconnection, and changed intent have understandable outcomes. Alternatives do not silently relax mandatory constraints. | Core proposal: changed intent and one no-match or unavailability case. The fallback experience needs agreement. |
| **BR-12** | Discover relevant live events from current metadata and source context. | A live item appears for relevant intent and changes or disappears when it ends. Source and access conditions are visible. | Vision and stretch: one verified source if feasible. Seeded/replayed items must be labelled. |
| **BR-13** | Support shared participation around a live stream or event. | A group reaches a common event context and interacts. Playback synchronization and external viewing limits are explicit. | Vision: scope separately. Sharing a link alone is not a complete watch party. |
| **BR-14** | Preserve one continuing Further experience across the dedicated UI and a host connector. Further owns inference and matching. | The same person resumes the same activity without re-entering relevant context. A correction in one interface appears in the other, and subsequent recommendations use the revised need. | Desired proof: a round trip through one verified connector. Muse identity, capabilities, authorization, and supported actions remain dependencies. The fuller UI need not be duplicated in the host. |
| **BR-15** | Use Meta model capability meaningfully in the social brain. | Actual model output contributes to intent or relevance. Examples show its contribution and visible failure behavior. | Core: genuine Meta use. Model/provider, access, credits, latency, and costs require verification. |
| **BR-16** | Give people control over visibility and interpersonal interaction. | Discoverability is opt-in, shared context is understandable, withdrawal works, and a practical block/report path exists. Sensitive inferences are not presented as facts. | Core trust boundary. Profile visibility, response, and retention policies open. |
| **BR-17** | Make changing interpretations and recommendations understandable. | A current signal, the relevant interpretation, and its effect on a suggestion can be demonstrated without exposing private model reasoning or another person's private context. | Core: show a correction and why the result was reconsidered. Inferred, confirmed, temporary, and lasting information are distinguishable where relevant. |
| **BR-18** | Remain responsive and useful as activity and the cost of understanding and recommending grow. | Measurements state tested activity, response time, freshness, cost where available, and degradation. Quality is assessed alongside speed and cost. | Core: bounded measurement and a credible growth argument. No model split, algorithm, scale target, or universal real-time guarantee is selected. |
| **BR-19** | Evaluate connection quality and learning usefulness. | Measure time to relevant connection, successful joins, mutual participation, and voluntary fit/usefulness feedback. | Core: basic outcomes. Explain-back optional. Longitudinal improvement and return need a later pilot. |
| **BR-20** | Maintain a consistent, versioned contract for profile, long-term, and current-task attributes. | The same field has the same meaning across users and supported interfaces. Values differ by person and can evolve without inventing new per-user definitions. Unknowns remain explicit. | Core: demonstrate a small shared attribute set. Detailed JSON schema is a later technical deliverable. |
| **BR-21** | Revise user understanding at the appropriate duration and scope. | A temporary need changes the current activity without automatically erasing a usual preference. A confirmed lasting correction remains available in a later interaction. | Core proposal: demonstrate a situational correction and a separately confirmed lasting update. Wider retention, expiry, and promotion policies remain open. |
| **BR-22** | Distinguish understanding the user from recommending a suitable connection. | The team can show what Further understood, how a correction changed that understanding, and how recommendations reflect the updated criteria and live opportunities. | Core: both capabilities must function. Model sizes, routing, clusters, vectors, and hybrid processing are later implementation choices. |

## 6. Social brain behavior

Further performs two related business functions:

1. **Maintain useful user understanding.** Interpret authorized signals, maintain the common user attributes, and distinguish current needs from continuing preferences. Make uncertainty and meaningful corrections visible.
2. **Recommend appropriate connections.** Combine that understanding with other participants' current goals, willingness, availability, and relevant opportunities. Explain the useful relationship and provide an actionable next step.

These functions remain Further's responsibility when Muse or another application provides the interface. A larger or smaller model is one possible implementation choice. The business requirement is appropriate quality, speed, and cost for each function.

Concepts can relate at different levels. “Computing,” “machine learning hardware,” and “why GPUs help neural-network training” describe increasingly specific interests. The team must choose which specificity produces useful conversation. Hierarchical clustering, embeddings, graphs, and ranking are later technical options.

Similarity is one route to value. A beginner may benefit from a peer or a more experienced person currently willing to explore that particular question. Expertise creates no automatic obligation to teach. A recommendation must fit the requested kind of participation and both sides' willingness.

### Example: a temporary exception and a lasting preference

| Observation | Appropriate business effect |
| --- | --- |
| The person usually learns well with a peer. | Keep a relevant longer-term preference, with its stated or inferred status. |
| The person currently needs experienced help with one Python bug. | Update the current need and reconsider who fits it. The usual peer preference can remain true. |
| The person explicitly confirms that they now generally prefer expert guidance. | Update the enduring preference and make it available to later interactions. |
| The person switches from Further to Muse during the same activity. | Continue the same current need and authorized context. The switch alone does not start a new goal. |

A correction must change the criteria used by the next recommendation. It does not mechanically require a different candidate if the existing candidate still fits. If timing or availability has changed, results can legitimately differ between interfaces; the user should understand the relevant change.

When a participant leaves, becomes unavailable, or changes focus, reconsider affected recommendations. Remove them wherever they no longer meet the current intent, willingness, time, or capacity requirements. If Further proposes broader alternatives, any relaxation of constraints should be apparent.

The evidence used for a meaningful inference should be traceable to an authorized source and time, with a distinction between stated, inferred, and confirmed information. The exact evidence and retention policy remains open. A task-specific correction should not silently rewrite unrelated goals or a person's overall capabilities.

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

### B. One activity across Further and Muse

**Proposed continuity example:**

1. A person begins in Further with a Python project obstacle. Further has their authorized background and usual preference for learning with peers.
2. Further interprets the immediate need and suggests an eligible person, with a reason connected to the goal.
3. The person continues the same activity through Muse without re-entering the relevant context.
4. Through Muse they clarify that this particular problem needs an experienced helper. Further updates the current need and reconsiders its recommendation.
5. Returning to Further shows the corrected activity and current result. The usual peer-learning preference remains available because the clarification concerned this problem.
6. The participants choose whether to connect and reach a genuine shared interaction.
7. In a separate lasting-change example, the person confirms a general preference change and can see it reflected in a later interaction.

The project lead called the proposed host **Muse**. Its exact identity, connector mechanism, context access, and permitted actions remain unverified. Only authorized context participates in this journey. A test client can illustrate the service boundary, but does not prove a working Muse integration.

One successful connector demonstrates continuity and a reusable approach. It does not establish support for every application. When an operation is unavailable in a host, the experience should explain the limit and preserve the activity when handing back to Further.

### C. Live opportunity

A relevant stream begins. Further obtains authorized current metadata and relates it to active learning intents. Interested people join a common event context or watch party, depending on agreed scope and platform capability. When it ends, the event ceases to appear as live. Event discovery and synchronized viewing are separate capabilities.

### D. Additional input formats

Spoken explanations, images, or shared project artifacts could help a person express a need with less effort. Their business value is better understanding or a more useful connection. The team must decide which input, if any, adds enough value for the demo. Any supported input should contribute to the same correctable user understanding. Multimodal processing is an opportunity, not an approved capability or chosen model.

## 8. Proposed hackathon boundary

**Stated constraint:** demonstrate the business journey and real-time engine even if supporting infrastructure is incomplete. The project lead's “50–60% plumbing” illustration expresses tolerance for limited infrastructure. It is not a measured completion goal or permission to simulate the core.

**Proposed demonstration:** consenting adults in one technical community, a dedicated UI, actual Meta-supported interpretation, recommendations reacting to real state, and a genuine shared interaction. Include one verified connector to demonstrate continuity if the proposed host's capabilities support the required journey. Keep the scenario narrow enough for the three-minute demo and the recorded November 4, 2026 at 9 p.m. Eastern submission deadline.

Continuity through one working connector is the desired product proof, rather than a second independent question-and-answer demo. Its feasibility still needs verification. If the team must defer it, the approved scope should name that remaining proof gap. A service test client does not satisfy a claim of native Muse integration.

| Desired proof | Acceptable simplification with disclosure | Decision or dependency |
| --- | --- | --- |
| Independent participants and current willingness or availability | A small invited population with manually entered background | Initial community and connection format |
| Genuine interpretation and matching affecting results | Limited concepts, languages, and fit dimensions | Exact user attributes and quality criteria |
| The same ongoing activity and correction across Further and one connector | One host and one supported journey | Verify Muse identity, access, and permitted actions |
| Temporary needs remain distinct from lasting preferences | A small explicit set of remembered information | Confirmation and expiry policy |
| Real changes affect relevant recommendations | Limited persistence for the demonstration | Agreed wait and freshness expectations |
| Choice, mutual fit, and genuine shared interaction | Minimal communication surface or a verified handoff | What counts as a successful connection |
| Honest handling of no suitable available match | One representative unavailable case | Agreed user-facing alternative |
| Meaningful Meta inference and measured observations | Bounded workload and a reasoned growth argument | Model access and later technical design |

Live events, watch parties, automated enrichment, additional input formats, and production operations remain deliberate scope decisions. Their value stays in the vision. The fuller Further interface should show the broader user journey; the Muse practice questions illustrate a connector route without limiting that journey.

## 9. Evidence and success measures

The audience should see a complete business story: a rough need becomes a useful interpretation, an appropriate available connection, and a genuine interaction. Corrections and interface changes should preserve that story. The proposed primary outcome is a useful connection for both participants; continuity and interpretation quality are supporting measures.

| Question | Evidence | Target status |
| --- | --- | --- |
| Can someone express a rough goal? | Input, inferred intent, confirmation/correction, and clarification effort | Examples and quality criteria to agree |
| Does Further add social intelligence? | Related goals with different wording connect, unrelated/incompatible goals do not | Positive and negative cases to agree |
| Is it actually live? | Independent clients, timestamps, changes after arrival/intent/departure | Required demonstration, freshness threshold open |
| Does the experience carry across interfaces? | Resume the same activity without re-entry; observe a correction through the other supported interface | Desired connector demonstration, host capability unverified |
| Does memory change at the right scope? | Temporary expert help preserves the usual peer preference; a confirmed lasting change appears later | Demonstration proposed, broader policy open |
| Is there a suitable available opportunity? | Eligible-candidate coverage and an honest no-match case | Initial population and acceptable fallback to agree |
| Can a suggestion become a connection? | Time to relevant result, acceptance, successful shared join, participation | Targets to agree |
| Is it useful? | Voluntary fit/usefulness feedback from both people, mutual participation, and later voluntary return | Hypothesis to test, no improvement claim yet. Explain-back remains optional for learning scenarios. |
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
| Temporary need becomes an inaccurate lasting preference | Distinguish activity scope, inferred status, and confirmed enduring changes. |
| Interface switch loses the current activity | Demonstrate the same ongoing task and correction in both supported surfaces. |
| Activity is recorded but improvement is claimed | Separate collecting feedback from evidence that future recommendations improved. |
| Provider, event, or host dependencies | Verify access and permissions before promising integration. |
| Scope exceeds time | Protect useful live connection and the desired continuity proof. Any connector deferral or event addition needs an explicit scope decision. |
| Scale claims exceed evidence | State measured limits and separate the future growth argument from test results. |

Before technical requirements, the team should resolve:

1. Confirm the exact Muse host and what is needed to demonstrate continuity through a real connector.
2. Choose the first adult cohort, one compelling scenario, and a connection mode.
3. Define a useful match for both sides, mandatory fit constraints, and what happens without a suitable available match.
4. Agree the minimum shared interaction and primary success measure.
5. Define the minimum profile, long-term, and current-task attributes, including how stated and inferred information differ.
6. Agree lasting-change confirmation, expiry, conflicting evidence, visibility, and retention policies.
7. Set observable response, update-freshness, wait-time, and tested-activity expectations.
8. Decide what learning from outcomes means beyond collecting clicks or feedback.
9. Decide whether events, facilitation, explain-back, or additional input formats justify a scope tradeoff.
10. Approve a versioned business baseline before technical requirements, stories, tasks, or architecture.

The practice-question split remains deferred. Model sizes, vector or hybrid processing, clustering, and multimodal implementation are parked technical ideas. See [Discussion](DISCUSSION.md) for the continuing conversation agenda.

## 11. Traceability and approval

| Direction | Requirements |
| --- | --- |
| Rough interest with little friction | BR-01, BR-03, BR-04 |
| Profile, evolving long-term information, and current intent | BR-02, BR-06, BR-20, BR-21 |
| Semantic, hierarchical, multidimensional intelligence | BR-04, BR-05, BR-07, BR-08, BR-17 |
| Human choice and a live connection | BR-09, BR-10, BR-11, BR-16, BR-19 |
| Live events and watch parties | BR-12, BR-13 |
| One experience across interfaces with Further-owned intelligence | BR-03, BR-14, BR-15, BR-22 |
| Genuine proof and credible growth | BR-06, BR-15, BR-17, BR-18 |
| Correctable understanding and recommendations | BR-04, BR-08, BR-17, BR-20, BR-21, BR-22 |

**Approval:** pending team review.  
**Current state:** requirements draft only. The starter and backlog are withdrawn. No stack, integration, event source, model connection, story set, ownership, or production-scale capability is approved or implemented by this document.

## 12. Revision record

| Version | Discussion change |
| --- | --- |
| 0.1 | Initial business requirements reset, broader social brain, and proposed connector access. |
| 0.2 | Continuity across interfaces, a consistent user-state contract, selective lasting updates, and distinct understanding and recommendation capabilities. Added proposed acceptance evidence and unresolved business choices. |

This public document records product requirements and illustrative scenarios. It does not reproduce private conversations or imply that the team has approved the revised baseline.

