import type { ProgressEvent } from "../../domains/ui/activity.ts";

function abortError() { return new DOMException("Stopped waiting for this response.", "AbortError"); }

/** Decode SSE by lines, including split UTF-8, CRLF boundaries, comments and multiline data. */
export async function consumeEventStream<T>(response: Response, onProgress: (event: ProgressEvent) => void, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortError();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `The request failed (${response.status}). Please retry.`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const result = await response.json();
    if (signal?.aborted) throw abortError();
    return result as T; // Compatibility response; no invented progress or text deltas.
  }
  if (!response.body) throw new Error("The response stream is unavailable. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", lines: string[] = [], final: T | undefined, receivedFinal = false;
  const aborted = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", aborted, { once: true });
  const dispatch = () => {
    if (!lines.length) return;
    const text = lines.join("\n"); lines = [];
    let event: Record<string, unknown>;
    try { event = JSON.parse(text); } catch { throw new Error("The response stream contained an unreadable update. Please retry."); }
    if (event.type === "error") throw new Error(typeof event.error === "string" ? event.error : "The request could not finish. Please retry.");
    if (event.type === "result") {
      if (!("result" in event)) throw new Error("The response ended without a final result. Please retry.");
      final = event.result as T; receivedFinal = true; return;
    }
    if ((event.type === "activity" || event.type === "text_delta") && typeof event.agentId === "string" && typeof event.sequence === "number" && typeof event.at === "string") {
      if (event.type === "activity" && typeof event.phase === "string" && typeof event.label === "string") onProgress(event as unknown as ProgressEvent);
      else if (event.type === "text_delta" && typeof event.field === "string" && typeof event.delta === "string") onProgress(event as unknown as ProgressEvent);
    }
  };
  const line = (value: string) => {
    if (value === "") { dispatch(); return; }
    if (value.startsWith(":")) return;
    if (value === "data") lines.push("");
    else if (value.startsWith("data:")) lines.push(value.slice(5).replace(/^ /, ""));
  };
  const drain = (end = false) => {
    for (;;) {
      const at = buffer.search(/[\r\n]/);
      if (at < 0) break;
      if (buffer[at] === "\r" && at === buffer.length - 1 && !end) break;
      const width = buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1;
      line(buffer.slice(0, at)); buffer = buffer.slice(at + width);
    }
    if (end && buffer) { line(buffer); buffer = ""; }
  };
  try {
    while (!receivedFinal) {
      if (signal?.aborted) throw abortError();
      const next = await reader.read();
      if (signal?.aborted) throw abortError();
      buffer += decoder.decode(next.value, { stream: !next.done }); drain(next.done);
      if (next.done) { dispatch(); break; }
    }
    if (signal?.aborted) throw abortError();
    if (!receivedFinal) throw new Error("The connection ended before a validated result arrived. The draft was not applied. Please retry.");
    return final as T;
  } finally {
    signal?.removeEventListener("abort", aborted);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
