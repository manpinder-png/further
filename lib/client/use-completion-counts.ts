"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompletionCountsResponse, type CompletionScope } from "@/lib/completions";
import { localJson } from "./live";

export function useCompletionCounts({ active, actorId, revision, scopes }: {
  active: boolean; actorId: string | null; revision: string; scopes: CompletionScope[];
}) {
  const payload = JSON.stringify({ scopes });
  const key = active && actorId && scopes.length ? `${actorId}:${revision}:${payload}` : null;
  const current = useRef(key);
  current.current = key;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; counts: Record<string, number> | null; error: string | null } | null>(null);
  const refresh = useCallback(async () => {
    if (!key) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => {
      if (current.current !== key || request.current !== controller) return;
      setState({ key, counts: null, error: "Loading completion counts took too long. Please try again." });
      controller.abort();
    }, 15_000);
    try {
      const response = CompletionCountsResponse.parse(await localJson("/api/data/completions", {
        method: "POST", body: payload, signal: controller.signal,
      }));
      if (!controller.signal.aborted && current.current === key) setState({ key, counts: response.counts, error: null });
    } catch (error) {
      if (!controller.signal.aborted && current.current === key) setState({
        key, counts: null, error: error instanceof Error ? error.message : "Couldn't load completion counts. Please try again.",
      });
    } finally { clearTimeout(timeout); }
  }, [key, payload]);
  useEffect(() => {
    if (!key) return;
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible" && document.hasFocus()) void refresh(); };
    const timer = setInterval(onFocus, 20_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      request.current?.abort();
    };
  }, [key, refresh]);
  return { counts: state?.key === key ? state.counts : null, error: state?.key === key ? state.error : null, refresh };
}
