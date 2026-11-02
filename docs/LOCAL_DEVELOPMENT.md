# Run Further locally

Open `Further.local.code-workspace` for the UI, backend, data, agents, retrieval and docs folders. The UI, API, agents and Meta encoder run locally. Select either isolated local storage or the shared AWS data/authentication layer at startup. This v2 snapshot is published on the branches named in the [handoff](HANDOFF.md).

`npm test` runs two test files at a time and disables WASM code GC for those short-lived test processes. This works around the [Node 24 V8/PGlite native crash](https://github.com/nodejs/node/issues/66366) during repeated database creation/close; it does not skip assertions or change application runtime flags. Re-evaluate after Node 24 includes the upstream V8 fix. Keep using the normal launcher for development.

## On this prepared Mac

From the repository root:

```sh
python3 scripts/dev.py
```

Open http://127.0.0.1:3000 and http://127.0.0.1:3000/architecture . The default launcher uses PGlite, local accounts and local image files; `--local` selects the same mode explicitly. The launcher reads API keys from existing macOS Keychain entries referenced by ignored `.local/providers.json`, then passes them only in the server process environment. It starts the local encoder if needed. It prefers an installed Node 24 runtime; a verified official Node binary is also available under `.local/tools/` on this Mac.

## Shared AWS data with a local app

After the CloudFormation stack has completed, use an authenticated AWS CLI session for the intended `groundlab` profile:

```sh
python3 scripts/configure-aws.py --profile YOUR_PROFILE --region us-east-1 --account SHARED_AWS_ACCOUNT_ID
python3 scripts/dev.py --aws
```

The configuration script checks the AWS account and completed stack, then writes only safe resource references to ignored, owner-readable `.local/aws.json`. It never fetches the Aurora password or a provider API key. The launcher sets the selected database, Cognito and media variables on the local server; AWS SDKs use its server-side credential chain. Team members need their own authorized AWS profile and local Meta/Baseten configuration. Do not copy browser credentials or a teammate's session.

| Service | AWS mode | Default local mode |
|---|---|---|
| Relational records and vectors | Aurora PostgreSQL Serverless with pgvector over RDS Data API | PGlite with pgvector |
| Sign-up and sign-in | Cognito with email confirmation | Local account store |
| Private images | Encrypted private S3 bucket | `.local/media/` |
| UI, APIs, agents and encoder | Local machine | Local machine |

Cognito identity maps to the existing account/profile model; learner profiles, consent and learning records remain in the selected database. Facebook federation is conditional and currently requires a separate Facebook Login app ID/secret. The Meta Model API key does not configure Facebook sign-in. Google OAuth remains parked. See [authentication](AUTHENTICATION.md), [AWS deployment](AWS_DEPLOYMENT.md) and [private images](MEDIA_STORAGE.md).

Switching modes restarts the app against a different account/data store. It does not migrate local users, maps, vectors or images to AWS, or link accounts by email. Keep local history intact. AWS mode disables synthetic profile selection and refuses fixture mode; use isolated local mode for rehearsals and automated fixture tests. A configured health response is not proof of a completed database, email or S3 round trip; deployment acceptance is recorded separately.

## Offline rehearsal

For an explicit offline rehearsal:

```sh
python3 scripts/dev.py --fixture
```

Fixture mode labels model responses and never grades explain-backs as real understanding. It still exercises the real local database. UI sample mode is separate and does not persist its agent proposals. Missing keys in live mode fail visibly.

Stop a foreground launcher with Ctrl-C. The launcher terminates processes it started, but leaves an already-running embedding service alone. Do not run two app processes against one PGlite directory. Both modes use `.next`; stop the dev server before building.

## Fresh setup

Use Node 24 LTS, Python 3.12 and `uv`:

```sh
npm ci
uv venv --python 3.12 .local/embedding-venv
uv pip install --python .local/embedding-venv/bin/python -r domains/retrieval/requirements.lock
.local/embedding-venv/bin/python domains/retrieval/embedding_service.py --download
```

The download pins `FacebookAI/roberta-base` to a recorded revision and uses safetensors without remote code. It downloads model files; it does not upload learner content. The model occupies approximately 478 MB; the Python environment requires additional space. Normal encoder startup uses cached files offline.

Provide server-only `MODEL_API_KEY` (or `META_API_KEY`) and optionally `BASETEN_API_KEY` in ignored `.env.local` or the process environment. The launcher uses Next's env-file parser before checking keys, and inherited environment values take precedence. Optional macOS Keychain references still work. `.env.example` lists nonsecret defaults. Never put keys in browser variables, files intended for Git, command arguments or output logs.

Metadata uses the configured provider. The example selects Meta; set `FURTHER_METADATA_PROVIDER=baseten` only when its key is available. The adapter fixes the exact grant model `meta-models/muse-spark-open-1026`. Map/learning/vision use standard Meta Spark; set `FURTHER_MAP_MODEL=muse-wonder-1.0` for an intentional deeper-reasoning experiment. No automatic provider fallback is performed.

## Check and rehearse

```sh
npm run check
npm run build
npm run map
```

HTTP integration tests create synthetic personas and need an isolated server/database:

```sh
python3 scripts/test-http.py
```

The HTTP helper uses fresh fixture storage for each suite, enables synthetic test identities only there, starts the local encoder if needed, and never uses AWS storage. Build first; do not run dev and build simultaneously. Unit/provider tests mock remote inference. HTTP tests exercise real routes and PostgreSQL storage in explicit fixture mode. Live smoke tests must use small synthetic inputs and report actual provider/model/token usage separately.

For manual two-person testing, use separate browser profiles or an incognito window. Two tabs in one browser share cookies. In explicit local-profile development mode, Profile → local identities allows deliberate persona switching for inspection; personas are development identities, not real registered users. AWS mode requires separate Cognito accounts. Mark both 18+, opt in to matching, use the same language, allow at least ten minutes, add semantically related topics and keep both windows open. The local encoder must be ready and both indexes current for semantic matching.

## Local files

| Location | Contents |
|---|---|
| `.local/data/pglite/` | Durable relational and vector database, one process owner |
| `.local/media/{actor}/` | Uploaded image originals, private local files |
| `.local/models/roberta-base/` | Pinned Meta model files |
| `.local/embedding-token` | Loopback service authorization token |
| `.local/session-secret` | Local identity signing secret |
| `.local/providers.json` | Keychain service/account references, no key values |
| `.local/aws.json` | Safe stack references and selected AWS profile; no database password |
| `.local/*verification*.json` | Private execution evidence when generated |

All `.local/` content is ignored by Git. Preserve it before any reset. A safe backup requires stopping the app before copying the database directory; do not copy a live database and call it a consistent backup.

The app is intentionally bound to `127.0.0.1`. Hosted Meta/Baseten inference is an outbound API call; the user-authorized content needed for that call leaves the machine. AWS mode also sends authorized identity, learning records, vectors and images to the selected shared AWS services. Embedding computation stays local in both modes. Backend/API hosting on AWS remains a separate future deployment.

The `/architecture` health panel reports `appRuntime`, `dataBackend`, `authProvider` and `mediaBackend` separately. Its `mode: local` means the HTTP application is local; it does not mean AWS storage is disabled. These fields describe configuration, while the embedding status checks the local encoder.

For a launcher left running in the background, `python3 scripts/stop.py --port 3000` checks its recorded process identity and stops it. A launcher record is kept in ignored `.local/server-3000.json`; it contains no credentials.
