# Accounts: Cognito and local development

Further keeps authentication separate from the learning profile. A username and display name belong to one stable learner identity; maps, agent runs, files and conversation membership stay attached to that identity across sign-out and sign-in. UI, APIs and agents run on each developer's machine. In AWS mode, Cognito manages passwords and identity, Aurora PostgreSQL stores Further profiles and learning records, and private S3 stores media. PGlite remains available for isolated local development and tests.

## Cognito signup and sign-in

The ignored deployment configuration `.local/aws.json` is loaded by the local AWS launcher. It sets `FURTHER_AUTH_PROVIDER=cognito` and public pool/client/domain identifiers. The Cognito app client has **no client secret**. Application users do not receive the developer's AWS credentials or direct database access.

1. Open `/signup`, enter your name, username, email and a password with at least 12 characters, uppercase, lowercase and a number.
2. Cognito sends a six-digit email confirmation code. The app displays the verification form and a resend action. Ordinary users must confirm the email; the application never administratively confirms them.
3. After confirmation, sign-in verifies both Cognito tokens before resolving or creating a Further learner. Cognito's stable `sub` is the identity key. Matching email addresses never automatically link existing accounts.
4. `/profile` edits the Further username and display name. Those values belong to the app profile, so changing them does not change the Cognito sign-in email or password.

The configured pool uses the **Lite** feature plan and classic hosted UI for social federation. AWS documents that the [classic hosted UI supports Lite](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html); newer managed-login branding requires Essentials or Plus. Lite is a service configuration, not evidence that every AWS charge is covered by free tier. Check the account's actual eligibility and monthly active users.

Successful login issues two HttpOnly, SameSite=Lax cookies: a random opaque Further session token and a Cognito access JWT. The database stores only the opaque token's hash. Each authenticated request checks the session and independently verifies the access JWT signature, issuer, client ID, purpose and expiry against cached Cognito JWKS. ID tokens are used only to establish profile claims during login. ID and refresh tokens are discarded; tokens are never returned in application JSON or stored in browser local storage. The app session cannot outlive either verified token. This first version asks the user to sign in again at expiry rather than silently refreshing.

Sign-out revokes the current Further session, clears its availability, deletes both cookies and visits Cognito's logout endpoint when a domain is configured. That ends the local application session and hosted-UI session. It does not globally sign out every Facebook session or every other device. Token signature verification alone does not check Cognito-side revocation on every request; remaining access tokens are bounded by their short expiry and the independently revocable app session.

JWT verification follows AWS's [token-validation requirements](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html). The OAuth flow uses the [authorization-code grant](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html) with [PKCE S256](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html), nonce and a ten-minute, one-use state transaction bound to an HttpOnly browser cookie. Only the dedicated callback accepts cross-site navigation; ordinary API routes retain loopback/origin checks and database-backed rate limits.

## Facebook federation setup

Facebook support is implemented but its button stays hidden until a real Facebook Login app has been connected to the pool and `facebookConfigured` is true in the deployment output. A Meta Model API inference key is not a Facebook Login app secret. The CloudFormation template conditionally creates the Facebook identity provider when both an app ID and a same-region Secrets Manager secret ARN are supplied. Its secret JSON uses the `app_secret` key; never paste the secret into source, browser code, terminal output or chat.

`FacebookApiVersion` explicitly pins the federation Graph API version, with **`v21.0` as the current template default**. On November 2, 2026, direct inspection of Cognito's Facebook-provider dropdown in `us-east-1` showed versions v16.0 through v21.0; v21.0 was the highest offered. A live attempt with v26.0 was rejected as an invalid `apiVersion`, and CloudFormation rolled back that update. Local schema validation cannot detect this service-side version limit.

Meta's [official iOS SDK changelog, version 18.1.1](https://github.com/facebook/facebook-ios-sdk/blob/main/CHANGELOG.md) identifies v26.0 as the SDK's default Graph API version. That is a separate compatibility boundary: the Meta SDK default does not establish Cognito federation support. AWS's Facebook guide recommends choosing the latest available **in Cognito**; [the Cognito provider API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateIdentityProvider.html) accepts the `api_version` field but does not publish an allowed-version enum. Recheck the actual Cognito console, [Meta's Graph API lifecycle](https://developers.facebook.com/docs/graph-api/changelog/) and a controlled provider deployment before changing this pin. Template validation and provider creation still do not replace a complete browser sign-in test.

Following the current [AWS Facebook-provider instructions](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-facebook.html):

1. In Meta for Developers, create or select an app whose use case is Facebook Login. New apps begin in Development mode; only eligible app roles/test users can sign in until Meta's public-release requirements are met.
2. Set its app domain to the deployed Cognito domain host. Configure its website platform and the `public_profile` and `email` permissions.
3. Set **Valid OAuth Redirect URIs** in the Facebook app to `https://<deployed-cognito-domain>/oauth2/idpresponse`. This is the Facebook-to-Cognito return address.
4. Store the app secret in Secrets Manager and supply `FacebookAppId`, `FacebookSecretArn` and `FacebookApiVersion` to the infrastructure update. The secret ARN references the existing secret; its plaintext value is not a template parameter. Add Facebook to the public Cognito client's supported identity providers. The template handles these steps when the conditional parameters are present.
5. Retain these separate Cognito-to-Further callback URLs: `http://127.0.0.1:3000/api/auth/cognito/callback` and `http://localhost:3000/api/auth/cognito/callback`. Sign-out returns to the same browser hostname's `/login`.
6. Complete a real browser sign-in as an allowed Facebook test user before calling federation verified. Start from Further’s sign-in page and complete the upstream flow within five minutes; if it expires, begin a new attempt instead of reusing the old consent URL. Facebook shares basic identity only; the app does not request friends, posts or physical location.

The account mapping preserves the provider's email-verification flag. A signed Facebook/Cognito identity does not imply that an email is verified, and it never triggers email-based account merging. Accounts without an email cannot complete this configured email-required flow. The current application requires globally unique account emails: a Facebook identity sharing an email with an existing password or other account is rejected with an account-conflict message. The learner must continue with the original sign-in method; account linking is not implemented. An unverified social email is not used to establish ownership of another account.

Run `python3 infra/aws/create-template.py` followed by `python3 infra/aws/validate.py` before preparing the infrastructure change set. The local checks cover the explicit version reference, restricted scopes and attribute mapping, along with the existing data/media protections. The validator also proves that removing the Facebook version pin is rejected. After deployment, refresh the ignored AWS configuration and restart the local server so that the configured Facebook button appears. Confirm the actual browser authorization and return to the same Further learner before calling federation verified. Avoid unfiltered `DescribeIdentityProvider` output: Cognito includes the provider client secret in that response; project only nonsecret fields for inspection.

## Isolated local signup

Visit `/signup`, choose a username and a password of at least 12 characters. Usernames use 3–24 lowercase letters, numbers or underscores. Passwords are hashed with salted scrypt; only the hash is stored. Email/password signup records an **unverified email**. This local build does not send verification mail, offer password recovery or claim verified email ownership.

With `FURTHER_AUTH_PROVIDER` unset, local signup uses PGlite and salted scrypt. Sessions use random opaque tokens in an HttpOnly, SameSite=Lax cookie. Only a SHA-256 token hash is saved in the database. These local-only sessions expire after seven days and are revoked on sign-out. Signing out also clears matching availability. Mutations enforce the local request origin, and authentication attempts are rate limited in the database.

## Google setup

**Parked at the user’s request on November 1, 2026.** Keep these instructions for later. Google is hidden in Cognito mode and no Google setup prompt is shown. The following dormant adapter applies only to isolated local mode.

Google sign-in needs a real Google OAuth client. It cannot be completed offline: Google authenticates the user, while Further and its data remain local. Signing in with a Gmail or Google Workspace account does **not** grant access to Gmail messages. Only `openid`, `email` and `profile` are requested.

1. Open [Google Cloud Console](https://console.cloud.google.com/) using the intended Groundlab development account. Select or create a project for Further. This does not change the hackathon registration email.
2. Open **Google Auth Platform → Branding → Get started**. Use **Further Local** as the app name and the development contact email for support/contact. Choose an **External** audience so personal Gmail accounts can participate. Review any policy acknowledgement yourself.
3. Keep the app in **Testing**. Under **Audience → Test users**, add the Google accounts that will test Further. Under **Data Access**, use only basic identity scopes: `openid`, `userinfo.email`, `userinfo.profile`. The app requests their standard `openid email profile` aliases; Gmail scopes are unnecessary.
4. Open **Clients → Create client**, select **Web application**, and name it **Further Local Web**. Register this exact **Authorized redirect URI**: `http://127.0.0.1:3000/api/auth/google/callback`. Use this same hostname when opening Further.
5. Download the client JSON when it is created and keep it outside Git. Google's current guidance says the client secret is only shown at creation, so save it immediately. For assisted configuration, provide the local file path, not the secret in chat.
6. Put the client credentials in the ignored `.env.local` file, then restrict the file to its owner (`chmod 600 .env.local`):

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/auth/google/callback
   ```

7. Restart Further. `/api/auth/session` reports `providers.google.configured: true` when both client values exist. Configuration is not proof that a live sign-in works; complete the Google consent flow to verify it.

Use Google's [OpenID Connect setup and server-flow documentation](https://developers.google.com/identity/openid-connect/openid-connect) for credentials, exact redirect matching and consent. Localhost HTTP redirect URIs are supported for web clients under Google's [web-server OAuth redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

The current console's Branding, Audience, test-user and scope steps are documented in [Google's consent-screen setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent). These setup instructions were refreshed November 1, 2026; no project, client or consent acceptance was created on the user's behalf.

The implementation uses the official `google-auth-library` to exchange the authorization code and verify the ID token signature, issuer, audience and expiry, following [Google's ID-token validation guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token). Further additionally verifies nonce and a browser-bound, one-use state transaction and uses PKCE S256. Code exchange has a bounded timeout. No Google access token, refresh token or ID token is stored. Provider identity is keyed by Google's stable `sub`, not by email. Existing password accounts are never automatically linked by an email match; the user must continue with their original sign-in method.

New Google accounts receive an editable generated username and the provider's display name. Later sign-ins preserve the learner's chosen names and existing map.

## API contract

| Endpoint | Behavior |
|---|---|
| `GET /api/auth/session` | Current public account, auth state, active provider configuration, explicit local test-profile availability |
| `POST /api/auth/signup` | `{email, password, username, displayName}` → Cognito email verification pending, or local account and session |
| `POST /api/auth/confirm` | Cognito mode: `{email, code}` → confirmed email; no session until login |
| `POST /api/auth/resend` | Cognito mode: `{email}` → request another confirmation code |
| `POST /api/auth/login` | `{email, password}` → returning account and rotated session |
| `POST /api/auth/logout` | Revoke current session and matching availability, clear cookies, optional Cognito logout URL |
| `PATCH /api/auth/account` | Edit `{username?, displayName?}` for the signed-in account |
| `GET /api/auth/cognito/start?provider=Facebook` | Begin configured Facebook federation through Cognito with code + PKCE |
| `GET /api/auth/cognito/callback` | Validate browser-bound state, exchange code, verify tokens, resolve stable identity |
| `GET /api/auth/google/start` | Begin Google authorization-code flow |
| `GET /api/auth/google/callback` | Validate one-use flow, verify provider identity, create/restore account |

Public account types are in `lib/auth-contracts.ts`. No public endpoint exposes password hashes, session tokens, provider subjects or an account directory. Peer display names are projected only for participants in the current learner's saved rooms. The Cognito identity mapping is introduced by `004_cognito.sql`; it does not reassign old local accounts by email.

## Existing development data

Migration `002_accounts.sql` adds accounts without deleting or assigning any old learner data. Existing synthetic profiles remain separate. The normal app rejects old synthetic-profile cookies and does not auto-create an anonymous learner.

To rehearse old persona-based integration tests, explicitly set `FURTHER_ENABLE_LOCAL_PROFILES=1` **on the isolated PGlite test server**. Cognito and Aurora modes disable this switch even when set. The chooser lists only synthetic learners; it cannot select or impersonate a real account, even with a forged signed development cookie. The user-facing sample map is a separate, explicitly labelled rehearsal.

## Verification and limits

Automated tests cover local signup/login/signout, isolated maps, strict input/origin checks, password hashing, duplicate accounts, session expiration/revocation, protected real identities, durable restarts, old-data migration and OAuth state binding/replay protection. `tests/cognito-auth.test.ts` additionally checks signed JWT validation, signup/confirmation/resend behavior, server-cookie sessions and Facebook PKCE/state handling with synthetic keys and no external network calls. These tests establish application behavior; deployment and live Cognito smoke tests are separate evidence. The November 2 development deployment completed a real Facebook → Cognito → local Further sign-in and created its owner-scoped profile. Future deployments must repeat that browser verification; the current unpublished Meta app permits app-role testing, not general-public Facebook login. Google remains parked.

The application still binds to loopback; AWS hosts identity and shared data, not the current UI/API/agent runtime. This version does not provide a custom password-recovery screen, MFA, automatic account linking or global device/session management. Cognito's default email delivery has service quotas; verify real signup delivery before inviting a larger test group.
