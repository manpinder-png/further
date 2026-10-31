import "server-only";
import { env } from "./config";

// Sentry stand-in. Owner: Connor. Replace with @sentry/nextjs when SENTRY_DSN is set.
export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  console.error("[further]", err instanceof Error ? err.message : err, context, env.sentryDsn ? "" : "(sentry: demo)");
}
