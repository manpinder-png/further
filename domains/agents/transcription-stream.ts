import { AgentError, type AgentEvent } from "./contracts.ts";

/** Meta PUSH_TO_TALK sends cumulative transcript events. A final:true transcript
 * is required; EOF is not proof that the recording finished successfully. */
export async function readTranscriptionStream(body: ReadableStream<Uint8Array>, signal: AbortSignal, onEvent: (event: AgentEvent) => void): Promise<string> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = "", transcript = "", final = false, sequence = 0, frames = 0;
  const emit = (event: Omit<Extract<AgentEvent, { type: "activity" }>, "sequence" | "at" | "agentId"> | Omit<Extract<AgentEvent, { type: "text_delta" }>, "sequence" | "at" | "agentId">) => {
    if (signal.aborted) return;
    try { onEvent({ ...event, sequence: ++sequence, at: new Date().toISOString(), agentId: "perception" } as AgentEvent); } catch { /* Transport owns subscriber lifecycle. */ }
  };
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const frame = (raw: string) => {
    if (++frames > 10_000) throw new AgentError("BUDGET_EXCEEDED", "The transcription stream exceeded its event limit.");
    const lines = raw.split(/\r?\n/);
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let value: { type?: string; transcript?: unknown; final?: unknown; audioProcessedMs?: unknown };
    try { value = JSON.parse(data); } catch { throw new AgentError("INVALID_OUTPUT", "The transcription stream returned an invalid event."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentError("INVALID_OUTPUT", "The transcription stream returned an invalid event.");
    const type = value.type ?? lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    if (type === "error") throw new AgentError("PROVIDER", "The transcription stream could not complete the recording.", true);
    const ms = typeof value.audioProcessedMs === "number" && Number.isFinite(value.audioProcessedMs) && value.audioProcessedMs >= 0 ? Math.round(value.audioProcessedMs) : undefined;
    if (type === "audioProgress" && ms !== undefined) emit({ type: "activity", phase: "waiting", label: "Transcribing your recording", audioProcessedMs: ms });
    if (type !== "transcript") return;
    if (typeof value.transcript !== "string" || value.transcript.length > 50_000) throw new AgentError("INVALID_OUTPUT", "The transcription stream returned an invalid transcript.");
    if (final) throw new AgentError("INVALID_OUTPUT", "The transcription stream continued after its final transcript.");
    transcript = value.transcript; final = value.final === true;
    emit({ type: "text_delta", field: "transcript", delta: transcript, replace: true });
  };
  try {
    if (signal.aborted) throw new AgentError("CANCELLED", "Transcription was cancelled.");
    emit({ type: "activity", phase: "waiting", label: "Transcribing your recording" });
    for (;;) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw new AgentError("CANCELLED", "Transcription was cancelled.");
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (Buffer.byteLength(buffer) > 256_000) throw new AgentError("BUDGET_EXCEEDED", "A transcription event exceeded the stream limit.");
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        frame(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        // PUSH_TO_TALK final:true is the completion signal. A keep-alive
        // connection must not turn an already completed transcript into timeout.
        if (final) {
          if (signal.aborted) throw new AgentError("CANCELLED", "Transcription was cancelled.");
          return transcript;
        }
      }
      if (done) break;
    }
    // An unterminated frame is intentionally not treated as a completed event.
    if (!final || buffer.trim()) throw new AgentError("PROVIDER", "The transcription stream ended before a final transcript arrived.", true);
    return transcript;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
