# Further — v2 handoff

Further turns a question into a personal knowledge map and helps willing people find someone to learn with. Meta agents clarify intent, guide learning and facilitate conversation; people do the explaining and reasoning.

This snapshot keeps the v1 map-centred layout and adds nested knowledge navigation, semantic Geomind matching, shared AWS data and Cognito authentication. **v2 is the handoff milestone; the agent protocol remains Further HTTP JSON v1.**

Start here:

- **Run it:** [onboarding](docs/ONBOARDING.md) — prerequisites, credentials, commands and a two-person live test.
- **Continue development or give this repo to a coding agent:** [handoff](docs/HANDOFF.md).
- **Understand the system:** [architecture and diagrams](docs/ARCHITECTURE.md), [data model](docs/data/README.md), [agent contracts](docs/agents/README.md).
- **Check what was verified:** [verification](docs/VERIFICATION.md). Functional tests are separate from scale and model-quality claims.

## Runtime at a glance

| Runs on each developer's machine | Shared AWS development layer |
|---|---|
| Next.js UI, APIs and agent orchestration | Aurora PostgreSQL Serverless + pgvector through RDS Data API |
| Local Meta RoBERTa embedding service | Cognito email/password and Facebook sign-in |
| Server-side calls to direct Meta/Baseten APIs | Private S3 images and existing profile/learning tables |

The browser receives no developer AWS credentials or inference keys. All product inference uses Meta models. The OpenAI SDK is the transport library. There is no cloud application/API deployment in this snapshot.

## After first-time onboarding

```sh
python3 scripts/configure-aws.py --profile further-dev --region us-east-1 --stack further-dev --account YOUR_AWS_ACCOUNT_ID
python3 scripts/dev.py --aws
```

Replace the account placeholder with the shared development account ID supplied by the owner. Open **http://127.0.0.1:3000**. See live configuration and dependencies at **http://127.0.0.1:3000/architecture**.

Default `python3 scripts/dev.py --local` uses your own PGlite database and local accounts. `--local --fixture` is an explicitly labelled offline inference rehearsal. Changing storage modes does not migrate or link accounts, maps or images.

## Current boundaries

Facebook login is verified for an app-role account; the Meta app remains unpublished. Other testers can use Cognito email/password signup or be added to the Facebook app's test roles. Google OAuth, physical geography, TTS/video calling and cloud agent hosting remain parked. The feature encoder and matching thresholds are experimental. Population-scale retrieval, distributed workers and production abuse operations are not established.

The team handoff branch is **`feature/mani-v2` in `further`**. The delivery snapshot is **`feature/v2` in `further-final`**. Neither publication merges into `main`.

More detail: [knowledge map / Geomind](docs/GEOMIND.md), [authentication](docs/AUTHENTICATION.md), [AWS deployment](docs/AWS_DEPLOYMENT.md), [retrieval](docs/retrieval/README.md), [media](docs/MEDIA_STORAGE.md), [UI](docs/ui/README.md), [dependency inventory](docs/dependency-map.json). Older design/discussion documents describe earlier proposals; use the handoff and current architecture for implementation.
