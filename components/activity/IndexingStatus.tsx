"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { localJson } from "@/lib/client/live";
import type { IndexStatus } from "@/domains/data/contracts";

/** Durable search readiness is distinct from successful map persistence. */
export default function IndexingStatus() {
  const { actorId, dataMode, events } = useStore();
  const [state, setState] = useState<{ actor: string; indexing?: IndexStatus; error?: string } | null>(null);
  useEffect(() => {
    if (!actorId || dataMode !== "local") return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      let delay = 20_000;
      try {
        const { indexing } = await localJson<{ indexing: IndexStatus }>("/api/local/indexing", { signal: controller.signal });
        if (!alive) return;
        setState({ actor: actorId, indexing });
        if (indexing.pending + indexing.processing + indexing.retry) delay = 2500;
      } catch {
        if (alive) setState({ actor: actorId, error: "Your saved learning is safe. Search readiness couldn’t be checked." });
      }
      if (alive) timer = setTimeout(() => { void read(); }, delay);
    };
    const visibility = () => { clearTimeout(timer); if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", visibility);
    void read();
    return () => { alive = false; clearTimeout(timer); controller.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [actorId, dataMode, events.length]);
  if (dataMode !== "local" || state?.actor !== actorId) return null;
  const status = state?.indexing;
  if (!state?.error && (!status || !status.total || !(status.pending + status.processing + status.retry))) return null;
  return <p className="flex items-center gap-2 px-1 py-1 text-xs leading-relaxed text-muted" role="status"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.error || status?.retry ? "bg-warn" : "animate-pulse bg-mastery"}`} />{state.error ?? (status?.retry ? "Saving and checking · Learning saved. Semantic search is waiting to reconnect." : `Saving and checking · ${status!.pending + status!.processing} ${status!.pending + status!.processing === 1 ? "idea is" : "ideas are"} becoming searchable.`)}</p>;
}
