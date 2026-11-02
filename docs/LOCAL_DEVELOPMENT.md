# Run Further locally

Open `Further.local.code-workspace` for the UI, backend, data, agents, retrieval and docs folders. No commits or cloud deployment are authorized in this phase.

## On this prepared Mac

From the repository root:

```sh
python3 scripts/dev.py
```

Open http://127.0.0.1:3000 and http://127.0.0.1:3000/architecture . The launcher reads API keys from existing macOS Keychain entries referenced by ignored `.local/providers.json`, then passes them only in the server process environment. It starts the local encoder if needed. It prefers an installed Node 24 runtime; a verified official Node binary is also available under `.local/tools/` on this Mac.

For an explicit offline rehearsal:

```sh
python3 scripts/dev.py --fixture
```

Fixture mode labels model responses and never grades explain-backs as real understanding. It still exercises the real local database. UI sample mode is separate and does not persist its agent proposals. Missing keys in live mode fail visibly.

Stop a foreground launcher with Ctrl-C. The launcher terminates processes it started, but leaves an already-running embedding service alone. Do not run two app processes against one database directory. Do not build while the dev server is using `.next`; stop it first.

## Fresh setup

Use Node 24 LTS, Python 3.12 and `uv`:

```sh
npm ci
uv venv --python 3.12 .local/embedding-venv
uv pip install --python .local/embedding-venv/bin/python -r domains/retrieval/requirements.lock
.local/embedding-venv/bin/python domains/retrieval/embedding_service.py --download
```

The download pins `FacebookAI/roberta-base` to a recorded revision and uses safetensors without remote code. It downloads model files; it does not upload learner content. The model occupies approximately 478 MB; the Python environment requires additional space. Normal encoder startup uses cached files offline.

Provide server-only `MODEL_API_KEY` (or `META_API_KEY`) and optionally `BASETEN_API_KEY` in the process environment. `.env.example` lists nonsecret configuration. `scripts/dev.py` loads Keychain references or inherited environment; direct `npm run dev` can use Next's ignored `.env.local`. Never put keys in browser variables, files intended for Git, command arguments or output logs.

Metadata uses Baseten when the launcher finds that key. The adapter fixes the exact grant model `meta-models/muse-spark-open-1026`. Map/learning/vision use standard Meta Spark; set `FURTHER_MAP_MODEL=muse-wonder-1.0` for an intentional deeper-reasoning experiment. No automatic provider fallback is performed.

## Check and rehearse

```sh
npm run check
npm run build
npm run map
```

HTTP integration tests create synthetic personas and need an isolated server/database:

```sh
FURTHER_DATA_DIR=.local/http-test-db FURTHER_LOCAL_DIR=.local/http-test-runtime python3 scripts/dev.py --fixture --production --port 3001
FURTHER_TEST_URL=http://127.0.0.1:3001 npm test
```

Build first; do not run dev and build simultaneously. Unit/provider tests mock remote inference. HTTP tests exercise real routes and PostgreSQL storage in explicit fixture mode. Live smoke tests must use small synthetic inputs and report actual provider/model/token usage separately.

For manual two-person testing, use separate browser profiles or an incognito window. Two tabs in one browser share cookies. Profile → local identities allows deliberate persona switching for inspection; personas are development identities, not real registered users. Mark both 18+, opt in to matching, use the same language, allow at least ten minutes, add a common topic and keep both windows open.

## Local files

| Location | Contents |
|---|---|
| `.local/data/pglite/` | Durable relational and vector database, one process owner |
| `.local/media/{actor}/` | Uploaded image originals, private local files |
| `.local/models/roberta-base/` | Pinned Meta model files |
| `.local/embedding-token` | Loopback service authorization token |
| `.local/session-secret` | Local identity signing secret |
| `.local/providers.json` | Keychain service/account references, no key values |
| `.local/*verification*.json` | Private execution evidence when generated |

All `.local/` content is ignored by Git. Preserve it before any reset. A safe backup requires stopping the app before copying the database directory; do not copy a live database and call it a consistent backup.

The app is intentionally bound to `127.0.0.1`. Hosted Meta/Baseten inference is still an outbound API call; the user-authorized content needed for that call leaves the machine. Database, media storage and embeddings remain local. No cloud app deployment exists.

For a launcher left running in the background, `python3 scripts/stop.py --port 3000` checks its recorded process identity and stops it. A launcher record is kept in ignored `.local/server-3000.json`; it contains no credentials.
