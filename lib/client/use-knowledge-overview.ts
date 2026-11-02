"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeOverviewResult, KnowledgeOverviewSnapshot } from "@/lib/knowledge-overview";
import { liveFetch } from "./live";
import { useAIStream } from "./useAIStream";
import { canUseNewRequestKey } from "./stream";

interface State { key: string; phase: "checking" | "summarizing" | "ready" | "empty" | "error"; result?: KnowledgeOverviewResult; error?: string }

/** A private derived view: checked cache first, actual streamed generation only when missing. */
export function useKnowledgeOverview({ active, actorId, revision, conceptSlugs }: { active: boolean; actorId: string | null; revision: string; conceptSlugs?: string[] }) {
  const scopeKey = conceptSlugs ? [...conceptSlugs].sort().join(",") : "all";
  const key = active && actorId ? `${actorId}:${revision}:${scopeKey}` : null;
  const scopeRef = useRef(conceptSlugs); scopeRef.current = conceptSlugs;
  const current = useRef(key); current.current = key;
  const request = useRef<AbortController | null>(null);
  const attempts = useRef(new Map<string, string>());
  const [state, setState] = useState<State | null>(null);
  const { activity, run: stream, cancel: stopStream, reset } = useAIStream();

  const load = useCallback(async () => {
    if (!key || !actorId) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    reset(); setState({ key, phase: "checking" });
    let sourceHash: string | undefined;
    try {
      const scope = scopeRef.current;
      const response = await liveFetch(scope ? "/api/knowledge/overview/read" : "/api/knowledge/overview", { ...(scope ? {method:"POST",headers:{"content-type":"application/json","x-further-actor":actorId},body:JSON.stringify({conceptSlugs:scope})} : {headers:{"x-further-actor":actorId}}), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      const cached = await response.json() as KnowledgeOverviewSnapshot & { error?: string };
      if (!response.ok) throw new Error(cached.error ?? "Your topic overview couldn't load. Please try again.");
      if (controller.signal.aborted || current.current !== key) return;
      sourceHash = cached.sourceHash;
      if (cached.status === "empty") { setState({ key, phase: "empty" }); return; }
      if (cached.status === "ready" && cached.overview && cached.mode && cached.runId) {
        setState({ key, phase: "ready", result: { sourceHash, overview: cached.overview, runId: cached.runId, mode: cached.mode } }); return;
      }
      if (cached.retryWithNewKey) attempts.current.set(sourceHash, crypto.randomUUID());
      else if (cached.attempt) attempts.current.set(sourceHash, cached.attempt);
      setState({ key, phase: "summarizing" });
      const result = await stream<KnowledgeOverviewResult>("/api/knowledge/overview", {
        method: "POST", headers: { "x-further-actor": actorId }, body: JSON.stringify({ sourceHash, ...(scope ? {conceptSlugs:scope} : {}), ...(attempts.current.has(sourceHash) ? { attempt: attempts.current.get(sourceHash) } : {}) }), signal: controller.signal,
      });
      if (controller.signal.aborted || current.current !== key) return;
      if (result.sourceHash !== sourceHash) throw new Error("Your map changed while its overview was being prepared. Please refresh the overview.");
      setState({ key, phase: "ready", result });
    } catch (error) {
      if (controller.signal.aborted || current.current !== key) return;
      if (sourceHash && canUseNewRequestKey(error)) attempts.current.set(sourceHash, crypto.randomUUID());
      setState({ key, phase: "error", error: error instanceof Error ? error.message : "Your topic overview couldn't finish. Please try again." });
    }
  }, [key, actorId, reset, stream]);

  useEffect(() => {
    if (key) void load();
    return () => { request.current?.abort(); reset(); };
  }, [key, load, reset]);

  const cancel = useCallback(() => {
    stopStream(); request.current?.abort();
    if (key) setState({ key, phase: "error", error: "Overview paused. Your saved learning is unchanged. Retry when you're ready." });
  }, [key, stopStream]);

  const visible = state?.key === key ? state : null;
  return { phase: visible?.phase ?? "checking", result: visible?.result ?? null, error: visible?.error ?? null, activity, reload: load, cancel };
}
