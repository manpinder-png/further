# Further

Further turns a question into a personal learning map, helps someone explore it, and connects willing learners around a shared concept. AI supports the work; people do the explaining and reasoning.

This local development version builds on the latest merged Connor/Sirpreet `iteration-nov1` UI and backend. It adds independently callable agents, a durable local PostgreSQL data model, owner-scoped vector search, real two-person sessions and explicit model provenance. Current work is uncommitted on `feature/agentic-local`; nothing is deployed or pushed.

```sh
python3 scripts/dev.py
```

Open http://127.0.0.1:3000 . For an explicit offline model rehearsal, use `python3 scripts/dev.py --fixture`.

- [Local setup, storage and tests](docs/LOCAL_DEVELOPMENT.md)
- [Architecture and dependency diagrams](docs/ARCHITECTURE.md)
- [Data model and ER diagram](docs/data/README.md)
- [Agent contracts and invocation](docs/agents/README.md)
- [Local embedding model and its limits](docs/retrieval/README.md)
- [UI flows and persistence](docs/ui/README.md)
- [Generated source dependency inventory](docs/dependency-map.json)
- [Verification results and remaining limits](docs/VERIFICATION.md)

The live `/architecture` page shows the domains, agent registry, schema tables and local health. Open `Further.local.code-workspace` to work on the domains side by side. Run `npm run map` after moving dependencies.

Only standard Meta models and the Baseten hackathon Meta model serve product inference. The OpenAI SDK supplies the client transport; it does not route inference to OpenAI. Credentials stay server-side. App data, uploaded media and embeddings stay local; explicitly requested model calls use the configured hosted Meta/Baseten APIs.

AI experiences stream provider output and show actual agent, tool, delegation and save activity. Drafts remain provisional until the final result arrives. Learners can cancel waiting and retry; interrupted drafts never become completed learning evidence.

The local persona chooser, PGlite single-process database and HTTP polling are development infrastructure. Production authentication, native PostgreSQL adapter, distributed workers, push updates for rooms/presence, full MCP/A2A interoperability, speech output and measured scale are still future work. Fixture output and seed data are labelled; failed providers never silently turn into demo successes.
