# Further

A real-time social brain for finding people and live experiences around what you want to learn now.

**Current phase: business requirements review. Draft v0.2, October 27, 2026.**

Further maintains an evolving understanding of what someone wants to learn now and uses that understanding to recommend suitable people, groups, or live opportunities. Further owns both capabilities. Goals, relevant context, connections, and ongoing activity should continue across its dedicated interface and Muse through a connector, so changing interfaces does not require starting over.

## Discussion materials

- [Business requirements](docs/BUSINESS_REQUIREMENTS.md): 22 requirements covering product value, continuity, evolving user context, proposed demonstration evidence, and open decisions.
- [Three discussion slides](docs/FURTHER_DISCUSSION_SLIDES.html): download the HTML file and open it in a browser. Use the navigation buttons or left/right arrow keys. It works offline and prints as three slides.
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

## Hackathon context

Further is a team entry in the Startup track of the Meta Global AI Developer Hackathon. The recorded submission deadline is November 4, 2026 at 9 p.m. Eastern. The intended demo needs genuine live behavior and meaningful Meta model use. The requirements distinguish this proposed demonstration from the broader product vision.

