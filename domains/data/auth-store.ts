import { randomBytes, randomUUID } from "node:crypto";
import type { Account, AuthRepository, OAuthTransaction } from "./auth-contracts";
import { sqlJson, sqlUuid, type SqlDatabase } from "./sql";

type AccountRow = { id: string; learner_id: string; email: string; username: string; display_name: string; email_verified: boolean; provider: Account["provider"]; password_hash?: string };
const selectAccount = "SELECT a.*,l.display_name FROM accounts a JOIN learners l ON l.id=a.learner_id";
const publicAccount = (r: AccountRow): Account => ({ id: r.id, learnerId: r.learner_id, email: r.email, username: r.username, displayName: r.display_name, emailVerified: r.email_verified, provider: r.provider });
export class AccountConflict extends Error { constructor() { super("That email or username is already registered. Use your existing sign-in method or choose another username."); this.name = "AccountConflict"; } }
function conflict(error: unknown): never { if ((error as { code?: string }).code === "23505") throw new AccountConflict(); throw error; }

/** Shares the application's SQL transport and transaction boundary. */
export function createAuthRepository(db: SqlDatabase): AuthRepository {
  const accountWhere = async (where: string, value: string) => {
    const row = (await db.query<AccountRow>(`${selectAccount} WHERE ${where}=$1`, [sqlUuid(value)])).rows[0];
    return row ? publicAccount(row) : null;
  };
  return {
    async createPasswordAccount(input) {
      try {
        return await db.transaction(async tx => {
          const id = randomUUID(), learnerId = randomUUID(), now = Date.now();
          await tx.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3)", [sqlUuid(learnerId), input.displayName, now]);
          await tx.query("INSERT INTO accounts(id,learner_id,email,username,provider,password_hash,created_at) VALUES($1,$2,$3,$4,'password',$5,$6)", [sqlUuid(id), sqlUuid(learnerId), input.email, input.username, input.passwordHash, now]);
          return { id, learnerId, email: input.email, username: input.username, displayName: input.displayName, provider: "password", emailVerified: false } satisfies Account;
        });
      } catch (error) { return conflict(error); }
    },
    async passwordCredential(email) {
      const row = (await db.query<AccountRow>(`${selectAccount} WHERE a.email=$1 AND a.provider='password'`, [email])).rows[0];
      return row?.password_hash ? { account: publicAccount(row), passwordHash: row.password_hash } : null;
    },
    getAccount: id => accountWhere("a.id", id),
    accountForLearner: learnerId => accountWhere("a.learner_id", learnerId),
    async googleAccount(subject) {
      const row = (await db.query<AccountRow>(`${selectAccount} JOIN account_identities i ON i.account_id=a.id WHERE i.provider='google' AND i.subject=$1`, [subject])).rows[0];
      return row ? publicAccount(row) : null;
    },
    async createGoogleAccount(input) {
      try {
        return await db.transaction(async tx => {
          // Identity is the provider's stable subject, never an email match.
          const existing = (await tx.query<AccountRow>(`${selectAccount} JOIN account_identities i ON i.account_id=a.id WHERE i.provider='google' AND i.subject=$1`, [input.subject])).rows[0];
          if (existing) return publicAccount(existing);
          const id = randomUUID(), learnerId = randomUUID(), now = Date.now(), username = `learner_${randomBytes(6).toString("hex")}`;
          await tx.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3)", [sqlUuid(learnerId), input.displayName, now]);
          await tx.query("INSERT INTO accounts(id,learner_id,email,username,email_verified,provider,created_at) VALUES($1,$2,$3,$4,true,'google',$5)", [sqlUuid(id), sqlUuid(learnerId), input.email, username, now]);
          await tx.query("INSERT INTO account_identities(provider,subject,account_id,created_at) VALUES('google',$1,$2,$3)", [input.subject, sqlUuid(id), now]);
          return { id, learnerId, email: input.email, username, displayName: input.displayName, provider: "google", emailVerified: true } satisfies Account;
        });
      } catch (error) { return conflict(error); }
    },
    async externalAccount(provider, subject) {
      if (provider !== "cognito" || !subject || subject.length > 200) throw new Error("Invalid external identity");
      const row = (await db.query<AccountRow>(`${selectAccount} JOIN account_identities i ON i.account_id=a.id WHERE i.provider=$1 AND i.subject=$2`, [provider,subject])).rows[0];
      return row ? publicAccount(row) : null;
    },
    async createExternalAccount(input) {
      if (input.provider !== "cognito" || !input.subject || input.subject.length > 200 || !input.email || input.email !== input.email.toLowerCase() || input.email.length > 254 || !input.displayName.trim() || input.displayName.length > 60) throw new Error("Invalid external account");
      const existing = await this.externalAccount(input.provider,input.subject);
      if (existing) return existing;
      try {
        return await db.transaction(async tx => {
          // A verified provider subject owns this identity. Matching an email
          // never silently takes over an existing local or federated account.
          const found=(await tx.query<AccountRow>(`${selectAccount} JOIN account_identities i ON i.account_id=a.id WHERE i.provider=$1 AND i.subject=$2`,[input.provider,input.subject])).rows[0];
          if(found)return publicAccount(found);
          const preferred = input.username?.trim().toLowerCase();
          let username = preferred && /^[a-z0-9_]{3,24}$/.test(preferred) ? preferred : `learner_${randomBytes(6).toString("hex")}`;
          if ((await tx.query("SELECT 1 FROM accounts WHERE username=$1",[username])).rows.length) username=`${username.slice(0,13)}_${randomBytes(5).toString("hex")}`;
          const id=randomUUID(),learnerId=randomUUID(),now=Date.now();
          await tx.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3)",[sqlUuid(learnerId),input.displayName.trim(),now]);
          await tx.query("INSERT INTO accounts(id,learner_id,email,username,email_verified,provider,created_at) VALUES($1,$2,$3,$4,$5,'cognito',$6)",[sqlUuid(id),sqlUuid(learnerId),input.email,username,input.emailVerified,now]);
          await tx.query("INSERT INTO account_identities(provider,subject,account_id,created_at) VALUES('cognito',$1,$2,$3)",[input.subject,sqlUuid(id),now]);
          return {id,learnerId,email:input.email,username,displayName:input.displayName.trim(),emailVerified:input.emailVerified,provider:"cognito"} satisfies Account;
        });
      } catch(error) {
        if ((error as {code?:string}).code === "23505") {const winner=await this.externalAccount(input.provider,input.subject);if(winner)return winner;}
        return conflict(error);
      }
    },
    async updateAccount(id, patch) {
      try {
        return await db.transaction(async tx => {
          const row = (await tx.query<AccountRow>(`${selectAccount} WHERE a.id=$1`, [sqlUuid(id)])).rows[0];
          if (!row) throw new Error("Account not found");
          if (patch.username) await tx.query("UPDATE accounts SET username=$2 WHERE id=$1", [sqlUuid(id), patch.username]);
          if (patch.displayName) {
            const revision = (await tx.query<{ revision: number }>("UPDATE learners SET display_name=$2,revision=revision+1,updated_at=$3 WHERE id=$1 RETURNING revision", [sqlUuid(row.learner_id), patch.displayName, Date.now()])).rows[0].revision;
            await tx.query("INSERT INTO profile_revisions(id,learner_id,revision,patch,created_at) VALUES($1,$2,$3,$4,$5)", [sqlUuid(randomUUID()), sqlUuid(row.learner_id), revision, sqlJson({ displayName: patch.displayName }), Date.now()]);
          }
          return { ...publicAccount(row), ...(patch.username ? { username: patch.username } : {}), ...(patch.displayName ? { displayName: patch.displayName } : {}) };
        });
      } catch (error) { return conflict(error); }
    },
    async createSession(tokenHash, accountId, expiresAt) {
      await db.transaction(async tx => {
        await tx.query("DELETE FROM account_sessions WHERE expires_at <= $1", [Date.now()]);
        await tx.query("INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at) VALUES($1,$2,$3,$4)", [tokenHash, sqlUuid(accountId), Date.now(), expiresAt]);
      });
    },
    async sessionAccount(tokenHash) {
      const row = (await db.query<AccountRow>(`${selectAccount} JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>$2`, [tokenHash, Date.now()])).rows[0];
      return row ? publicAccount(row) : null;
    },
    async revokeSession(tokenHash) { await db.query("DELETE FROM account_sessions WHERE token_hash=$1", [tokenHash]); },
    async saveOAuth(transaction) {
      await db.transaction(async tx => {
        await tx.query("DELETE FROM oauth_transactions WHERE expires_at <= $1", [Date.now()]);
        await tx.query("INSERT INTO oauth_transactions(state_hash,verifier,nonce,redirect_uri,expires_at) VALUES($1,$2,$3,$4,$5)", [transaction.stateHash, transaction.verifier, transaction.nonce, transaction.redirectUri, transaction.expiresAt]);
      });
    },
    async consumeOAuth(stateHash) {
      const row = (await db.query<{ state_hash: string; verifier: string; nonce: string; redirect_uri: string; expires_at: number }>("DELETE FROM oauth_transactions WHERE state_hash=$1 RETURNING *", [stateHash])).rows[0];
      if (!row || Number(row.expires_at) <= Date.now()) return null;
      return { stateHash: row.state_hash, verifier: row.verifier, nonce: row.nonce, redirectUri: row.redirect_uri, expiresAt: Number(row.expires_at) } satisfies OAuthTransaction;
    },
    async attempt(key, limit, windowMs) {
      const now = Date.now();
      const row = (await db.query<{ attempts: number; window_start: number }>("INSERT INTO auth_attempts(bucket_key,attempts,window_start) VALUES($1,1,$2) ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<=$3 THEN 1 ELSE auth_attempts.attempts+1 END,window_start=CASE WHEN auth_attempts.window_start<=$3 THEN $2 ELSE auth_attempts.window_start END RETURNING attempts,window_start", [key, now, now - windowMs])).rows[0];
      return { allowed: row.attempts <= limit, retryAfter: Math.max(1, Math.ceil((Number(row.window_start) + windowMs - now) / 1000)) };
    },
    async clearAttempts(key) { await db.query("DELETE FROM auth_attempts WHERE bucket_key=$1", [key]); },
  };
}
