# Further: team discussion

**Draft v0.3, October 28, 2026.** This guide records the project lead's clarified direction and the choices that still need team agreement. It is not a delivery backlog. Read [Business requirements](BUSINESS_REQUIREMENTS.md) and use the [interactive story and decision worksheet](FURTHER_DISCUSSION_SLIDES.html) with the [peer discussion guide](PEER_DISCUSSION_GUIDE.md) for the meeting.

## Shared starting point

Further helps people reach useful human connections or live shared experiences around what they want to learn now. Further owns the intelligence that maintains user understanding and recommends suitable connections. Learners may continue using their preferred AI for learning itself.

The experience should continue across Further's dedicated UI and Muse through a connector. Goals, relevant context, connections, and ongoing activity should carry with the person. The dedicated interface can show a fuller journey while the connector supports a narrower set of operations on the same authorized state.

The hackathon evidence must be genuine: meaningful Meta inference, actual changing participant state, recommendations that respond to updates, and a real human connection. A small invited population and limited infrastructure can support that proof if disclosed.

## Direction clarified on October 27

| Topic | Project lead's direction | Remaining boundary |
| --- | --- | --- |
| Interfaces | One continuing experience through Further and Muse. A working connector demonstrates the pattern. | Verify the host and the actions needed for the desired round trip. Other applications require their own compatible support. |
| Contextual connector proof | Use the authorized current conversation alongside Further's social brain. One scenario can demonstrate the value. | Show the signal's effect on the understood need and explained live suggestion. A canned answer or connectivity check is insufficient. |
| Full product experience | Further's UI should show more than the Muse practice-question examples. | Exact surfaces and the division of example questions remain deferred. |
| User information | A shared metadata contract with profile, evolving long-term, and current-task information. Field meanings stay consistent while each person's values change. | Minimum fields, unknown values, expiry, and source/status treatment need agreement. Detailed JSON design follows technical requirements. |
| Corrections | Current needs and corrections influence matching. A current interaction may also revise lasting understanding. | Preserve temporary exceptions. Agree whether the proposed lasting-update proof belongs in the demo. Any included lasting change uses confirmation; settle the wider promotion policy explicitly. |
| Further's intelligence | Maintaining user understanding and recommending connections are distinct business capabilities. | Model size and architecture choices remain open. |
| Scale and additional inputs | Consider responsiveness, cost as usage grows, and the value of multimodal input. | Define measurable business expectations before choosing implementations or making performance claims. |
| Work sequence | Continue business requirements and broader product reasoning first. | Technical requirements, stories, tasks, and ownership follow project-lead and team direction. |

This records product direction. It does not mark the full business baseline as approved.

## Continue the earlier discussion agenda

The first two items now have a clearer business foundation. The next unaddressed item in that agenda is **live-update cadence**.

| Order | Discussion item | What is already clear | What still needs a decision |
| --- | --- | --- | --- |
| 1 | Connector scope | Continuity through Further and a connector is the desired experience. One real integration can demonstrate it. | Exact Muse identity and supported actions; what proof remains if that integration cannot be demonstrated in time. |
| 2 | Intent signals | Profile, long-term, and current-task information use common meanings. Corrections should affect current recommendations. | Minimum attributes; which authorized signals belong in the demo; when a change lasts and how the user confirms or corrects it. |
| 3 | Live-update cadence | Changes in need and availability must affect relevant suggestions and follow the ongoing activity across interfaces. | What the person should see immediately, what can update after a short wait, and what delay becomes misleading. Agree measurable thresholds rather than assuming a technology. |
| 4 | Demo privacy and control | Context sharing and discoverability are explicit. A connector has access only to authorized context. | What each person sees, what can be retained, how sharing ends, and the minimum participant controls. |
| 5 | Learning from outcomes | Useful connections matter more than clicks. Temporary needs must not become permanent preferences by accident. | Which feedback changes later understanding or matching, and how to demonstrate improvement rather than only record activity. |
| 6 | Credible growth | Further should remain useful and responsive as participation grows. | Test population, realistic activity, response and freshness measures, quality/cost tradeoffs, and honest limits. |

A useful opening question for the next conversation is: **when someone changes from wanting a peer to needing help with one specific problem, what should update before the next suggestion, and what can wait?**

## Wider product decisions

| Decision | Proposed starting point | Status |
| --- | --- | --- |
| First population and scenario | Invited adults in one active technical community. The Python example is illustrative, not the only possible use case. | Team decision |
| Useful match for both sides | Current intent, desired participation, relevant knowledge, willingness, language, and overlapping time. | Agree mandatory criteria and mutual value |
| Connection format | One useful live connection route, with both sides choosing whether to participate. | Pairing, group, room entry, and interaction method open |
| No suitable match | State the lack of an eligible available candidate honestly. Offer only an agreed alternative without silently changing constraints. | Choose fallback and waiting expectations |
| Primary success measure | Time to a useful, mutually accepted connection, with feedback from both participants. | Choose the primary measure and targets |
| Multiple goals | A task-specific correction should not overwrite unrelated goals. | Simultaneous-goal scope and switching behavior open |
| Continuity under interruption | Review proposed outcomes for late results, interrupted handoffs, repeated actions, and withdrawn sharing in journey B of the requirements. | Team must choose representative cases, current-state expectations, and acceptable timing. No retry or conflict policy is approved. |
| Events and watch parties | Retain the wider vision and assess an explicit demo scope tradeoff. | Unresolved |
| Additional input formats | Include an input only if it helps someone express a need or improves the connection enough to justify scope. | Multimodal opportunity remains open |
| Learning evaluation | Connection fit/usefulness first. Facilitation and explain-back may support the chosen learning scenario. | Unresolved |

These are decision prompts, not assigned implementation work.

## Proposed demonstration for review

| Step | What the audience should observe |
| --- | --- |
| Begin in Further | A project obstacle, relevant profile, and usual peer-learning preference lead to an understandable recommendation. |
| Continue through Muse | The same ongoing activity is available without re-entering the relevant context, through a verified authorized connector. The current conversation informs Further alongside its user understanding and live social context. |
| Correct the immediate need | The person asks for experienced help with this problem. Further updates the current criteria and reconsiders the result. |
| Return to Further | The corrected activity and current recommendation appear consistently. The usual peer preference remains available. |
| Establish useful participation | The relevant people choose to connect and genuinely interact. Their willingness is not inferred from mere availability. |
| Show a limit | A no-match or unavailable case has an honest outcome and an agreed next step. |
| Review interruption behavior if included | A chosen handoff interruption or repeated action reveals actual current state and preserves participant choice. |
| Show a lasting change if included | A separately confirmed enduring preference remains available in a later interaction. |

A changed criterion does not necessarily require a different recommended person. The result and explanation must reflect the latest need and actual availability.

The desired connector demonstration remains dependent on verified host capability. A test client can illustrate a service boundary, but must not be described as a working Muse integration. No runnable product or integration is asserted by this guide.

## Parked implementation ideas

The discussion raised lightweight models for attribute inference, larger models for complex recommendations, vectors, clustering, hybrid approaches, and multimodal processing. Record these as options for later evaluation against business quality, responsiveness, cost, and growth expectations. No algorithm, model routing, service boundary, or stack is selected.

## Baseline approval record

- Requirements version for review: **0.3**
- Project lead's clarified direction: **Recorded above**
- Full team review: **Pending**
- Approved demonstration scope: **Pending**
- Approved by and date: **Pending**
- Technical requirements authorized: **Pending**

The project lead will manage stories and tasks with the team after agreement. This guide and the BR identifiers do not create a backlog or assign owners.


## Team comparison meeting

The interactive story explains Further through one fictional learner's changing need. It adds a local manual tally for the team's actual candidate directions and fields for an outcome sentence, initial demo boundary, explicit deferrals, and open questions. No votes are prefilled and the worksheet does not decide or approve requirements automatically. Agree the voting method and record the resulting baseline explicitly before technical design.

The verified original application selected Indie Dev Track and described Build for Your World. It proposed an adult technical pilot, explicit waiting/no-match handling, Meta-supported clarification and facilitation, and evaluation of connection and learning usefulness. Later connector and continuing-context requirements expand that baseline. The role of prompts and teach-back remains an intentional scope decision.
