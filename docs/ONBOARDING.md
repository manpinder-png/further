# Run Further and test with a colleague

Use this guide for a fresh clone. Each developer runs the **UI, API, agents and encoder locally**, with both machines connected to the same AWS development stack. The UI alone is not a complete runnable backend.

## 1. What you need

| Requirement | Purpose |
|---|---|
| Git, Node **24.x**, npm, Python **3.12**, `uv` | Application and local CPU encoder; a GPU is not required |
| AWS CLI v2 and your own approved AWS developer profile | Backend access to shared Data API/S3 and stack outputs |
| Shared AWS account ID, region and stack name from the owner | Select the existing environment without creating another stack |
| Your approved Meta API key | Live map, learning, vision, resources and transcription |
| Optional Baseten key for the hackathon model | Metadata route, only when explicitly selected |
| Your own Further learner account | Cognito identity used in the browser |

**AWS developer access and learner login are separate.** Signing up in Further does not grant IAM access. The owner must provision your developer access to the existing runtime resources and stack outputs. Use an authorized role, not a teammate's AWS session. Ordinary developers do not need the Facebook app secret, Aurora password, another person's cookies, or access to a provider key from Git.

The commands below target macOS/Linux shells. Native Windows is not verified; use WSL for the same path conventions. The encoder's first download is about 478 MB, plus Python dependencies and their disk space.

## 2. Clone and install

```sh
git clone --branch feature/mani-v2 https://github.com/manpinder-png/further.git
cd further
npm ci
uv venv --python 3.12 .local/embedding-venv
uv pip install --python .local/embedding-venv/bin/python -r domains/retrieval/requirements.lock
.local/embedding-venv/bin/python domains/retrieval/embedding_service.py --download
```

The download uses the pinned `FacebookAI/roberta-base` revision and safetensors, without remote model code. Subsequent encoder startup uses the cached files offline. Do not change the reference mean or embedding revision to solve an installation problem.

The same snapshot can be cloned from `further-final` on `feature/v2`; use one checkout as your working copy.

## 3. Configure inference privately

```sh
cp .env.example .env.local
chmod 600 .env.local
```

Edit `.env.local` in your editor. Set `MODEL_API_KEY` (or `META_API_KEY`) and keep `FURTHER_METADATA_PROVIDER=meta` for a Meta-only direct route. To use the grant, also set `BASETEN_API_KEY` and deliberately choose `FURTHER_METADATA_PROVIDER=baseten`.

The Baseten route accepts exactly **`meta-models/muse-spark-open-1026`**. The default direct Meta model is **`muse-spark-1.3`**. Missing or failed provider access is reported; it never becomes a demo response automatically. Keep keys server-side and out of Git, command arguments, screenshots and chat. The launcher loads local environment configuration before checking provider keys; existing process variables take precedence.

## 4. Connect to the existing AWS stack

Authenticate your approved local profile. For an AWS CLI v2 browser-login profile:

```sh
aws login --profile further-dev --region us-east-1
```

If the owner issued an IAM Identity Center/SSO profile, use its prescribed setup and `aws sso login --profile further-dev` instead. The profile name is local to your machine.

Then run, replacing `YOUR_AWS_ACCOUNT_ID` with the shared development account ID:

```sh
python3 scripts/configure-aws.py --profile further-dev --region us-east-1 --stack further-dev --account YOUR_AWS_ACCOUNT_ID
python3 scripts/dev.py --aws
```

This reads safe stack outputs into ignored `.local/aws.json`; it does not deploy AWS resources or retrieve secret values. Runtime IAM access covers Data API, its database-secret reference and private S3. Configuration additionally needs permission to describe the existing CloudFormation stack. If access is missing, ask the owner to grant the intended role access; Cognito login cannot substitute for it.

Open **http://127.0.0.1:3000** and stay on that hostname. `localhost:3000` is also an allowed callback, but mixing the two creates separate browser-cookie contexts. The configured social callbacks use port **3000**; other ports require an explicit Cognito allowlist update.

## 5. Sign in and confirm readiness

- **Email/password:** create your own account and confirm the emailed code.
- **Facebook:** the owner must add your Facebook account to an eligible app role and you must accept its invitation. The current Meta app is unpublished. Complete provider consent promptly; after a five-minute expiry, start again from Further's sign-in page.
- Accounts are identified by provider subject, not matched by email. A conflicting existing email must use its original sign-in method; automatic linking is not implemented.

At `/architecture`, expect `appRuntime: local`, `dataBackend: aurora-data-api`, `authProvider: cognito`, `mediaBackend: s3`, live model mode and a ready local encoder. Provider configuration alone is not proof of a successful request. Ask a small learning question: check persona-labelled progress, a saved map, then search/index readiness. Refresh and confirm the same account and question return.

Each AWS learner starts with their own data. Previous PGlite history is preserved separately and is not uploaded automatically.

## 6. Two-person live test

Use separate machines, or separate browser profiles when sharing one local server. Tabs in the same browser share the learner's cookies.

1. Both developers run `--aws` against the same stack, with a ready encoder and their own learner accounts.
2. In Profile, both confirm 18+, opt into matching, choose the same language and allow at least ten minutes. Keep the app visible so presence remains fresh.
3. Ask related questions using different phrasing, for example GPU matrix parallelism and SIMD/tensor computation. Wait for saved concepts to become searchable. Semantic similarity is experimental, so record an unexpected result rather than assuming any pair must match.
4. Open Geomind. Confirm a consented learner/topic projection, not the other person's private map. Opening it must not send an invitation.
5. Send one deliberate invite; both accept the same invitation. Confirm a shared room, messages from both people and facilitator progress.
6. Reload both clients. Confirm the same room and messages; finish the conversation once and check that completion is not duplicated. Finally sign out or turn off matching.

This is the intended cross-machine acceptance test. The recorded single-environment verification does not claim that your colleague's machine has already passed it. Note the failing step, browser status and safe error code if anything fails; never include tokens or keys.

## Local-only and offline alternatives

```sh
python3 scripts/dev.py --local
python3 scripts/dev.py --local --fixture
```

The first uses live inference with your own PGlite accounts/data. The second labels fixture inference and needs no hosted inference key. They do not share the AWS user directory or peer population. One process owns one PGlite directory. For a UI-only fixture rehearsal without the encoder, add `--no-embeddings`; semantic discovery remains unavailable until the encoder is running.

## Common fixes

| Symptom | Check |
|---|---|
| AWS access/account error | Correct approved profile, current login and owner-supplied account ID; do not deploy a replacement stack |
| Provider key missing | Edit `.env.local`, select the intended metadata provider and restart the launcher |
| Encoder unavailable | Python environment, pinned download and port 8767; inspect `/architecture` |
| Facebook says app not active | Accepted app-role invitation, or use email/password |
| Cognito says something went wrong | Start a fresh sign-in from Further; old consent requests expire |
| Empty map after changing modes | Local PGlite and AWS accounts/data are separate |
| No nearby peers | Same AWS stack, two distinct accounts, consent/adult/language/time/presence eligibility and ready semantic indexes |

Stop with Ctrl-C, or `python3 scripts/stop.py --port 3000`. It does not stop an encoder that was already running before the launcher. For validation, stop the app, run `npm run check`, then `npm run build`, then `python3 scripts/test-http.py`. The HTTP helper manages isolated fixture servers; it does not use the shared AWS database or hosted inference. For deeper diagnostics and file locations, use [local development](LOCAL_DEVELOPMENT.md). For deployment changes, read [AWS deployment](AWS_DEPLOYMENT.md) first.
