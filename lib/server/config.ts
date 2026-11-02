import "server-only";

// Server-only configuration. Nothing here is ever sent to the client bundle (N3).
export const env = {
  metaKey: process.env.META_API_KEY ?? process.env.MODEL_API_KEY ?? "",
  metaUrl: process.env.META_API_URL ?? "https://api.meta.ai/v1",
  metaModel: process.env.META_MODEL ?? "muse-spark-1.3",
  metaDevModel: process.env.META_DEV_MODEL ?? "muse-spark-1.3-contributor",
  transcribeModel: process.env.META_TRANSCRIBE_MODEL ?? "muse-voice-transcribe-1.0",
  imageModel: process.env.META_IMAGE_MODEL ?? "muse-image-1.0",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  guardUrl: process.env.LLAMA_GUARD_URL ?? "",
  guardKey: process.env.LLAMA_GUARD_API_KEY ?? "",
  guardModel: process.env.LLAMA_GUARD_MODEL ?? "",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  rateLimit: Number(process.env.RATE_LIMIT_EXPANSIONS_PER_HOUR ?? 30),
};

export type Mode = "live" | "demo" | "down" | "local" | "configured";
/** Configuration visibility only; a configured key is not proof of a successful call. */
export function systemStatus() {
  const fixture=process.env.FURTHER_MODEL_MODE==="fixture";
  const inference:Mode=fixture?"demo":env.metaKey?"configured":"down";
  return {muse:inference,agents:inference,transcribe:fixture?"down" as Mode:inference,
    grounding:inference,image:inference,storage:"local" as Mode,presence:"local" as Mode,
    embeddings:"down" as Mode,supabase:"down" as Mode,guard:"down" as Mode,mcp:"down" as Mode,sentry:"down" as Mode,
    model:fixture?"explicit-offline-fixture":env.metaModel,modelMode:fixture?"fixture":"live",mode:"local",agentProtocol:"http-json-v1"};
}
export type SystemStatus = ReturnType<typeof systemStatus>;
