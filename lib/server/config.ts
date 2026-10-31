import "server-only";

// Server-only configuration. Nothing here is ever sent to the client bundle (N3).
export const env = {
  metaKey: process.env.META_API_KEY ?? "",
  metaUrl: process.env.META_API_URL ?? "https://api.meta.ai/v1",
  metaModel: process.env.META_MODEL ?? "muse-spark-1.3",
  metaDevModel: process.env.META_DEV_MODEL ?? "muse-spark-1.3-contributor",
  transcribeModel: process.env.META_TRANSCRIBE_MODEL ?? "muse-voice-transcribe",
  imageModel: process.env.META_IMAGE_MODEL ?? "muse-image",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  guardUrl: process.env.LLAMA_GUARD_URL ?? "",
  guardKey: process.env.LLAMA_GUARD_API_KEY ?? "",
  guardModel: process.env.LLAMA_GUARD_MODEL ?? "",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  rateLimit: Number(process.env.RATE_LIMIT_EXPANSIONS_PER_HOUR ?? 30),
};

export type Mode = "live" | "demo" | "down";

/** What the status pills in the top bar show. */
export function systemStatus() {
  const m = (on: boolean): Mode => (on ? "live" : "demo");
  return {
    muse: m(!!env.metaKey),
    transcribe: m(!!env.metaKey),
    grounding: m(!!env.metaKey),
    image: m(!!env.metaKey),
    supabase: m(!!env.supabaseUrl && !!env.supabaseService),
    presence: m(!!env.supabaseUrl),
    guard: m(!!env.guardUrl && !!env.guardKey),
    mcp: "live" as Mode, // the route always runs; auth is a per-user token
    sentry: m(!!env.sentryDsn),
    model: env.metaModel,
  };
}
export type SystemStatus = ReturnType<typeof systemStatus>;
