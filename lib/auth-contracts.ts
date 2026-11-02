/** Browser-safe authentication state. Never include tokens or provider subjects. */
export interface PublicAccount {
  id: string;
  learnerId: string;
  email: string;
  username: string;
  displayName: string;
  emailVerified: boolean;
  provider: "password" | "google" | "cognito";
}
export interface AuthSession {
  authenticated: boolean;
  account: PublicAccount | null;
  providers: { google: { configured: boolean }; facebook?: { configured: boolean }; cognito?: { configured: boolean } };
  authProvider?: "local" | "cognito";
  localProfilesEnabled: boolean;
}
