import "server-only";
import { HttpError } from "./http";

export interface CognitoConfig { region: string; userPoolId: string; clientId: string; domain: string; issuer: string; facebookConfigured: boolean }
export const cognitoEnabled = () => process.env.FURTHER_AUTH_PROVIDER === "cognito";

/** Public identifiers only. The local launcher reads ignored deployment outputs into these variables. */
export function cognitoConfig(): CognitoConfig {
  const region = process.env.FURTHER_AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  const userPoolId = process.env.FURTHER_COGNITO_USER_POOL_ID?.trim() ?? "";
  const clientId = process.env.FURTHER_COGNITO_CLIENT_ID?.trim() ?? "";
  const rawDomain = process.env.FURTHER_COGNITO_DOMAIN?.trim() ?? "";
  if (!cognitoEnabled() || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region) || !new RegExp(`^${region}_[A-Za-z0-9]+$`).test(userPoolId) || !/^[\w]{1,128}$/.test(clientId)) {
    throw new HttpError(503, "AWS sign-in is not configured. Check this computer’s deployment settings.");
  }
  const domain = rawDomain.includes("://") ? rawDomain : rawDomain.includes(".") ? `https://${rawDomain}` : rawDomain ? `https://${rawDomain}.auth.${region}.amazoncognito.com` : "";
  if (domain) {
    let url: URL;
    try { url = new URL(domain); } catch { throw new HttpError(503, "AWS sign-in has an invalid hosted domain."); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !url.hostname.endsWith(`.auth.${region}.amazoncognito.com`)) throw new HttpError(503, "AWS sign-in has an invalid hosted domain.");
  }
  return { region, userPoolId, clientId, domain: domain ? new URL(domain).origin : "", issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`, facebookConfigured: process.env.FURTHER_COGNITO_FACEBOOK_CONFIGURED === "true" };
}
export function cognitoConfigured() { try { cognitoConfig(); return true; } catch { return false; } }
