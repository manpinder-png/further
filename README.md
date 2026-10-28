# Further

A real-time social brain for finding people and live experiences around what you want to learn now.

**Current phase: business requirements review. Draft v0.3, October 28, 2026.**

Further maintains an evolving understanding of what someone wants to learn now and uses that understanding to recommend suitable people, groups, or live opportunities. Further owns both capabilities. Goals, relevant context, connections, and ongoing activity should continue across its dedicated interface and Muse through a connector, so changing interfaces does not require starting over.

## Discussion materials

- [Business requirements](docs/BUSINESS_REQUIREMENTS.md): 22 requirements covering product value, continuity, evolving user context, proposed demonstration evidence, and open decisions.
- [Interactive story and decision worksheet](docs/FURTHER_DISCUSSION_SLIDES.html): eight chapters follow a learner from a rough question to a useful connection, including changed intent, continuity, mutual choice, and no-match behavior. Fictional examples explain the proposed product. The local manual tally helps the team compare its own candidate directions.
- [Peer discussion guide](docs/PEER_DISCUSSION_GUIDE.md): a concise speaking route, a fair decision process, and the original application baseline.
- [Team discussion](docs/DISCUSSION.md): clarified direction, the continuing discussion agenda, and decisions to resolve before technical design.
- [Shared project](https://github.com/users/manpinder-png/projects/1): previous bootstrap tasks have been retired. New work follows team agreement.

## Spec-driven sequence

1. Agree and version business requirements as a team.
2. Derive technical requirements and evaluate architecture choices against them.
3. Agree detailed journeys and user stories, then define tasks and owners with the project lead.
4. Implement and validate against approved requirements.

The starter implementation, its technical plan, and its premature backlog have been withdrawn from the current project. Git history preserves the earlier work. There is no current runnable product, chosen stack, implemented integration, or demonstrated scale.

## Product boundary

People may continue learning with their preferred AI assistant. Further supplies the changing social context and connection intelligence: what people want now, who is willing and available, and which connection fits. A connector uses the same authorized understanding and ongoing activity as Further's own UI. The dedicated UI can express more of the product than a host's supported operations.

The user-state direction has three categories: profile information, evolving long-term information, and current-task information. Field definitions follow a common contract while each person's values change independently. A temporary need should influence the current match without automatically becoming a permanent preference.

“Muse” preserves the proposed host application's name from the product discussion. One working connector is the desired proof of continuity. Its exact identity, capabilities, and permissions require verification before a live integration can be claimed. The practice-question split remains deferred. Additional applications and multimodal inputs remain opportunities to assess.

The connector proof should use the authorized current conversation alongside Further's user understanding and live social context. The proposed review cases also cover interrupted handoffs, late results, repeated connection actions, and ended sharing. These cases need team agreement before technical design.

## Hackathon context

The original approved application selected **Indie Dev Track** and proposed Amit as a teammate subject to his separate acceptance. The final track and eligible team are recorded at project submission. Indie entrants may form teams; having teammates alone does not establish a Startup entry. The recorded submission deadline is November 4, 2026 at 9 p.m. Eastern. The intended demo needs genuine live behavior and meaningful Meta model use. The requirements distinguish this proposed demonstration from the broader product vision.

