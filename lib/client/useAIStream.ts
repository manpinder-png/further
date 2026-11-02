"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyProgress, emptyActivity, type ActivityState } from "@/domains/ui/activity";
import { liveFetch } from "./live";
import { consumeEventStream } from "./stream";

export function useAIStream() {
  const [activity, setActivity] = useState<ActivityState>(emptyActivity);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const cancel = useCallback(() => active.current?.abort(), []);
  const reset = useCallback(() => { active.current?.abort(); active.current = null; setActivity(emptyActivity()); }, []);
  const run = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const externalAbort = () => controller.abort();
    init.signal?.addEventListener("abort", externalAbort, { once: true });
    if (init.signal?.aborted) controller.abort();
    const started = Date.now();
    setActivity({ ...emptyActivity(), status: "running", startedAt: started, lastEventAt: started });
    try {
      const headers = new Headers(init.headers); headers.set("accept", "text/event-stream");
      const response = await liveFetch(path, { ...init, headers, signal: controller.signal });
      const result = await consumeEventStream<T>(response, (event) => {
        if (active.current === controller) setActivity((state) => applyProgress(state, event));
      }, controller.signal);
      const notice = result && typeof result === "object" && "indexWarning" in result && typeof result.indexWarning === "string" ? result.indexWarning : undefined;
      if (active.current === controller) setActivity((state) => ({ ...state, status: "completed", drafts: {}, notice, finishedAt: Date.now() }));
      return result;
    } catch (error) {
      if (active.current === controller) setActivity((state) => ({ ...state, status: controller.signal.aborted ? "cancelled" : "error", error: controller.signal.aborted ? "Stopped waiting. Any changes already saved on the server remain saved." : error instanceof Error ? error.message : "The request couldn't finish.", finishedAt: Date.now() }));
      throw error;
    } finally { init.signal?.removeEventListener("abort", externalAbort); }
  }, []);
  return { activity, run, cancel, reset };
}
