import type { PublicAccount } from "../../lib/auth-contracts";
export type Account = PublicAccount;

export interface OAuthTransaction {
  stateHash: string;
  verifier: string;
  nonce: string;
  expiresAt: number;
  redirectUri: string;
}

/** Server-only persistence port; do not expose these methods directly as an API. */
export interface AuthRepository {
  createPasswordAccount(input: { email: string; username: string; displayName: string; passwordHash: string }): Promise<Account>;
  passwordCredential(email: string): Promise<{ account: Account; passwordHash: string } | null>;
  getAccount(id: string): Promise<Account | null>;
  accountForLearner(learnerId: string): Promise<Account | null>;
  googleAccount(subject: string): Promise<Account | null>;
  createGoogleAccount(input: { subject: string; email: string; displayName: string }): Promise<Account>;
  externalAccount(provider: "cognito", subject: string): Promise<Account | null>;
  createExternalAccount(input: { provider: "cognito"; subject: string; email: string; username?: string; displayName: string; emailVerified: boolean }): Promise<Account>;
  updateAccount(id: string, patch: { username?: string; displayName?: string }): Promise<Account>;
  createSession(tokenHash: string, accountId: string, expiresAt: number): Promise<void>;
  sessionAccount(tokenHash: string): Promise<Account | null>;
  revokeSession(tokenHash: string): Promise<void>;
  saveOAuth(transaction: OAuthTransaction): Promise<void>;
  consumeOAuth(stateHash: string): Promise<OAuthTransaction | null>;
  attempt(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number }>;
  clearAttempts(key: string): Promise<void>;
}
