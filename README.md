# Further

Learn something. Move forward together.

Further connects people who are available now and want to understand a specific concept. AI helps turn a vague interest into a useful question and guides a short session; people do the explaining and reasoning.

**Status: working local starter, not the finished hackathon product.** The included peers are explicitly labelled samples. Matching is a transparent keyword baseline. Real people, shared live rooms, persistence, authentication, and production deployment are tracked in the backlog.

## Start here

Requires Python 3.9 or newer. No package install, Node.js, API key, or paid service is needed for the default demo.

    git clone https://github.com/manpinder-png/further.git
    cd further
    python3 -m further

Open http://127.0.0.1:8000. On Windows, use python instead of python3 if needed.

Try “Why are GPUs useful for machine learning?”, select English and 15 minutes, find a sample peer, and open a practice session. Explain the question out loud, use the discussion prompts, and try the independent understanding check.

    python3 -m unittest discover -s tests -v

The server binds to loopback only. This starter is intended for local development; a deployable multi-user service is a separate work item.

## Team workspace

- [Project board](https://github.com/users/manpinder-png/projects/1)
- [Repository issues](https://github.com/manpinder-png/further/issues)
- [Product brief](docs/PRODUCT.md)
- [Architecture and API](docs/ARCHITECTURE.md)
- [Workstreams and milestones](docs/DELIVERY.md)
- [Contribution guide](CONTRIBUTING.md)

Pick an issue, agree ownership on the board, and use a short branch and pull request. Initial workstream suggestions are UI, presence/matching, room collaboration, and AI/evaluation. These are unassigned suggestions until the team agrees who owns each.

## Optional Meta model integration

The server-side adapter is implemented but has not been tested against a live account. Demo mode never calls a provider.

Copy .env.example to .env, add a valid MODEL_API_KEY locally, and explicitly change FURTHER_AI_MODE to meta. Restart the server. Selecting a peer will then request a session plan through Meta Model API. Confirm account credits/billing before enabling live calls.

- Base URL: https://api.meta.ai/v1
- Model ID: muse-spark-1.3 (configurable; verify availability in your account)
- Endpoint: /chat/completions
- Keys stay server-side and .env is ignored by git.
- Live errors are shown as errors; the app does not disguise a failed live call as generated output.
- The adapter has a timeout, bounded output, JSON validation, and no automatic paid retries.

Official references, checked October 27, 2026: [Meta quickstart](https://dev.meta.ai/docs/quickstart) and [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions). Fireworks, Modal, and Baseten are evaluation options, not implemented integrations.

## Hackathon target

Startup track, Meta Global AI Developer Hackathon. Submission is due November 4, 2026 at 9 p.m. Eastern. Present only contributions built during the event. The repository must be public and the submission needs an accessible three-minute demo video.

The final product must demonstrate real peer interaction and meaningful Meta model use. This demo-only baseline does not yet satisfy that target. See docs/DELIVERY.md for the acceptance checks.

## License

The team has not selected a software license yet. Resolve this before the final submission.
