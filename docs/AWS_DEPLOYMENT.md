# AWS development data and authentication

Current status, November 2: **Facebook login is enabled and a real browser round trip has passed**. The secret is stored as `further/dev/facebook` in Secrets Manager and referenced by CloudFormation. The Meta app remains unpublished, so Facebook sign-in is available for eligible app-role testers. See the Facebook receipt below; the initial deployment receipt records the earlier email-only stage.

Further keeps its UI, HTTP backend, agents and Meta embedding process on each developer's machine. The selected AWS layer supplies shared persistence and identity. Product model calls continue through the approved direct Meta and Baseten routes; this stack does not select or host an inference model.

The source template is [`infra/aws/further-dev.json`](../infra/aws/further-dev.json). Its generator, [`create-template.py`](../infra/aws/create-template.py), makes the JSON reproducible. The template contains 14 resources and fits CloudFormation's inline template limit. It contains no account-specific identifiers or credential values.

## What the stack creates

| Component | Configuration |
|---|---|
| Aurora PostgreSQL | Private encrypted cluster and one serverless writer, initial database `further`, version parameter default `17.9` |
| Development capacity policy | Zero minimum, two-ACU default maximum and a 300-second idle pause interval; this is a bounded development cap, not a measured workload-sizing recommendation |
| Database connectivity | RDS Data API over authenticated HTTPS; no public PostgreSQL ingress, NAT gateway, bastion or local VPN requirement |
| Database credentials | RDS-managed Secrets Manager secret; callers pass its ARN to Data API and do not read or store the password |
| User identity | Cognito **Lite**, case-insensitive email sign-in, manual signup, emailed confirmation code and verified-email recovery |
| App client | No client secret; authorization-code OAuth with PKCE supplied by the application, plus password and refresh-token API flows; token revocation enabled |
| Hosted login | Cognito classic hosted UI, compatible with Lite; both loopback callback origins are registered |
| Facebook | Conditional provider, created only when both a real Facebook app ID and an existing secret ARN are supplied |
| Media | Private encrypted S3 bucket with versioning, bucket-owner enforcement and a policy denying non-TLS requests |
| Developer access policy | Unattached managed IAM policy scoped to this cluster, its managed secret and this bucket; it grants no person access automatically |

The database, writer, user pool, app client, domain, media bucket and bucket policy have retain policies. The database and user pool also have deletion protection. Deleting or replacing the stack is therefore not an automatic data-cleanup operation. Inspect retained resources before planning any teardown.

There is no application Lambda, API Gateway, public API deployment or new access key in this template. No policy is attached to the existing AWS SSO administrator role. The region for this development deployment is **US East (N. Virginia)**.

## Local configuration

After deployment, a trusted configuration step reads safe stack outputs into the ignored `.local/aws.json` file. Outputs include the region, database cluster ARN, managed secret ARN, database name, Cognito pool/client/domain, S3 bucket and Facebook-configured flag. ARNs and IDs are configuration references, not database passwords or provider API keys.

The local backend uses the developer's temporary AWS credential chain or named AWS profile to call Data API and S3. The browser receives no AWS access keys, database credentials, Meta keys or Baseten keys. Cognito user identity is resolved separately from the AWS developer credential used to run the backend. The backend must validate the authenticated learner and scope every data operation; AWS IAM cluster access is not per-learner row authorization.

The expected Cognito callback URLs are:

```text
http://localhost:3000/api/auth/cognito/callback
http://127.0.0.1:3000/api/auth/cognito/callback
```

Both loopback roots and their `/login` routes are allowed logout destinations. Different development ports must be deliberately added to the app client's callback/logout allowlists. Arbitrary redirect URLs are not accepted.

The app client is public: PKCE, state and nonce protection belong in the application flow. A new Cognito identity must map by verified issuer and subject to a learner record. An email match must not silently take over an existing local or federated account. Existing local password hashes are not Cognito passwords; local history must be migrated or linked through an explicit authenticated process.

## Facebook setup dependency

A Meta Model API key is not a Facebook Login app credential. Facebook federation requires the actual Facebook Login application and the necessary email/public-profile permissions.

1. Configure the Facebook Login app using the current [Amazon Cognito Facebook setup guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-facebook.html).
2. Add the Cognito hosted domain's HTTPS `/oauth2/idpresponse` endpoint as the Facebook valid OAuth redirect URI.
3. Store the app secret in **the deployment region** in Secrets Manager under JSON key `app_secret`. Do not place it in source, a CloudFormation output, a browser variable or a chat message.
4. Supply `FacebookAppId`, `FacebookSecretArn` and `FacebookApiVersion` (currently `v21.0`, the latest version offered by Cognito in this region). The secret ARN is a reference; CloudFormation resolves the value when configuring the identity provider.
5. Apply a reviewed change set, confirm the provider/app-client configuration, and test a real Facebook account's complete round trip. A configured provider alone is not proof of successful federation.

Without those real credentials, the stack creates Cognito email/password sign-up and login only. The app should hide an unavailable Facebook sign-in action rather than present a dummy connection. The provider maps `email` and `name`; it does not force the email-verification flag or link identities by matching email strings.

## Validation and deployment

Local validation uses **cfn-lint 1.46.0** and the official **CloudFormation Guard 3.2.1** release. Tools are isolated under `.local/aws-validation`; they are not runtime dependencies or published files.

```bash
python3 infra/aws/create-template.py
python3 infra/aws/validate.py
```

The first validation layer checks JSON, CloudFormation schema and region-sensitive resource properties. Eight explicit rules in [`security.guard`](../infra/aws/security.guard) check retained/encrypted data, private database access, the absence of NAT/app-hosting resources, private media and the selected Cognito client/tier boundaries. A negative fixture proves that a publicly accessible database writer is rejected. This project rule set is not a general compliance certification.

The verified source currently reports zero schema findings and passes all eight security rules. These local checks do not create AWS resources and do not prove deployment success.

The deploying operator should then:

1. Verify the intended AWS identity and region.
2. Call CloudFormation `ValidateTemplate` with the actual source.
3. Create a named **CREATE** or **UPDATE** change set, using `CAPABILITY_IAM` for the unattached managed policy.
4. Wait for change-set completion; inspect CloudFormation `DescribeEvents` validation details and the proposed resource actions before executing it.
5. Execute the authorized change set, wait for resource stabilization, and re-read outputs and actual resource properties.
6. Run application migrations through Data API, including `CREATE EXTENSION vector`, then verify actual SQL and vector operations. The template provisions the engine; schema/extension creation is an application migration, not a claimed CloudFormation side effect.
7. Verify manual signup, confirmation, login, protected owner-scoped data and a return login after restart. Verify Facebook separately when its app credentials are available.

A root deployment report should distinguish template validation, stack creation, migrations, local connectivity and real authentication outcomes. Those are separate receipts.

## Cost and operational boundaries

Cognito's published Lite/Essentials free tier covers 10,000 monthly active users signing in directly or through social providers per AWS account or organization. This does **not** make Aurora, storage, email delivery beyond default limits, S3 requests or inference free. Cognito's default email sender has service quotas; verify delivery and quotas before expanding the pilot.

Aurora compute can pause when idle, but storage and other non-compute charges remain. Browser presence, indexing-status requests, active workers or other database traffic can keep it awake or resume it. The first request after pause can take longer and Data API can report that the database is resuming; the adapter needs bounded retry and visible waiting states. The two-ACU development maximum limits scaling but can constrain concurrency; tune it using observed metrics rather than treating it as a capacity guarantee.

No production availability, population-scale matching performance or cost total is established by this stack. The local Meta feature encoder and matching thresholds remain experimental, as described in [retrieval documentation](retrieval/README.md).

## Documentation reviewed

- [CloudFormation Aurora cluster properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbcluster.html)
- [Serverless scaling and pause properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-rds-dbcluster-serverlessv2scalingconfiguration.html)
- [Cognito app clients and loopback callback exceptions](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html)
- [Cognito social identity-provider properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolidentityprovider.html)
- [Cognito pricing and free tier](https://aws.amazon.com/cognito/pricing/)
- [RDS Data API limitations](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.limitations.html)
- [CloudFormation Guard](https://github.com/aws-cloudformation/cloudformation-guard)

Reviewed November 2, 2026.

## Initial deployment receipt — November 2, 2026

The `further-dev` stack in `us-east-1` reached **CREATE_COMPLETE**, with all 13 unconditional resources created. The conditional Facebook resource was excluded because no Facebook Login app credentials were supplied. Re-reading the actual resources confirmed Aurora PostgreSQL **17.9**, private `db.serverless` writer, encryption, Data API, deletion protection and the configured zero-to-two ACU policy. Cognito reports **LITE**, automatic email verification, a public client without a secret, and `COGNITO` as its sole active provider.

The local `groundlab` profile was authenticated using AWS CLI's temporary browser-login session and verified against the same AWS account as the connector. `scripts/configure-aws.py` wrote only safe output references to `.local/aws.json` with owner-only permissions. Neither a database password nor a long-lived access key was retrieved or created.

Live acceptance verified:

- Ordered migrations 001–004 and the real pgvector extension; large Unicode JSON returned through Data API cursor paging.
- Stable Cognito subject identities, no takeover by matching email, transactional rollback, durable topic/subtopic edges, cycle rejection, index-job recovery, leases and exact vector search.
- Two synthetic learners' invitation, mutual acceptance, shared messages, completion, block/report boundaries and agent-run persistence. Concurrent event retries create one event; concurrent opposite hierarchy writes cannot create a cycle. These synthetic data fixtures were removed.
- A separate synthetic Cognito user created with invitation delivery **suppressed**: wrong-password and unverified-email denial, real signed JWT login, persistent profile edits, owner isolation, cookie expiry/flags, forged-session denial and logout/replay rejection. Administrative verification was limited to this synthetic test user. Ordinary signup still requires its emailed code.
- Real private S3 upload/read, all bucket public-access blocks, anonymous object GET returning 403, authenticated image HTTP read and anonymous/other-owner denial. Synthetic media objects and database rows were removed.
- Chrome password login and a real streamed `muse-spark-1.3` question: four concepts and one question saved in Aurora; six vectors computed by the local Meta encoder reached ready state. The signed-in browser restored the same map after a local server restart. This is a functional receipt, not a model-quality or scale benchmark.

Ignored evidence lives under `.local/verification/`: `aws-deployment.json`, `aws-data-acceptance.log`, `aws-room-acceptance.log`, `aws-concurrency-acceptance.log`, `aws-auth-*.report.json`, `aws-learning-acceptance.json` and the build/check logs. The synthetic browser-verification account is separate from real users, is not opted into peer matching, and its generated credential remains in an owner-only ignored file. No ordinary user's password was chosen or changed.

At the initial deployment stage, real inbox delivery/manual confirmation and Facebook sign-in were unverified. The later Facebook receipt below supersedes that provider status; inbox delivery remains a per-user signup check. Local PGlite accounts, password hashes, maps and images were preserved without automatic migration or email-based linking. AWS starts as a separate shared workspace; transferring previous history requires an explicit ownership-checked import. UI/API/agents remain local. The v2 source snapshot is now authorized for the two feature branches described in README.

## Facebook deployment receipt — November 2

The `enable-facebook-v21-20261102` change set reached **UPDATE_COMPLETE**. Its only resource changes were adding `FacebookIdentityProvider` and updating the existing public app client, without replacement. Re-reading safe provider metadata confirmed the configured Facebook app, `public_profile,email`, mappings for email/name and both `COGNITO` and `Facebook` enabled on the client. No database, S3 or IAM resources changed.

Cognito's US East console offered Graph versions v16.0 through v21.0 on this date. The explicit parameter is pinned to **v21.0**, its highest offered version. The preceding v26.0 attempt was rejected by Cognito and safely rolled back; Meta's SDK default alone does not establish Cognito compatibility.

The actual Facebook consent and Cognito return created a federated user and an owner-scoped Further profile. The local app validated the Cognito tokens and opened the account's learning workspace; the same profile and session were restored after the final server restart. Facebook does not supply an `email_verified` claim; the profile does not pretend its email ownership was verified or auto-link another account with the same email. Usernames remain editable in Profile.

Complete a provider sign-in promptly: Cognito cancels upstream requests unfinished after five minutes. A request left open at consent expired during setup; a fresh authorized request completed successfully. See [Cognito's provider flow](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-flow.html).

Secret entry used a one-time loopback password form and a private SDK stdin bridge. The value was neither printed nor saved in a local file. No Secrets Manager value-read API was called; CloudFormation resolved its secret reference inside AWS. The temporary entry page is now closed, not a permanent setup URL.

The first local sign-in-start error was initially logged only as `AuroraDataError`; a subsequent request's safe diagnostic identified `ThrottlingException`. The adapter now retries explicitly rejected throttles with bounded jitter and handles explicit database-resuming responses. It still does not replay unknown network/commit outcomes. Live OAuth persistence and one-use/replay rejection passed against Aurora. Evidence remains ignored under `.local/verification/facebook-*` and `aws-oauth-data-acceptance.log`.
