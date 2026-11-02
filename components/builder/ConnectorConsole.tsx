"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentId } from "@/domains/agents/contracts";
import { localJson } from "@/lib/client/live";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel from "@/components/activity/ActivityPanel";
import { useStore } from "@/lib/client/store";
import { mutationKey } from "@/domains/ui/contracts";

interface AgentCard { id: AgentId; name: string; description: string; dependencies: string[]; tools: string[] }
const EXAMPLES: Record<AgentId, object> = {
  "knowledge-map": { text: "Help me understand why AI needs special chips", objective: "plan" },
  metadata: { text: "I understand Python and want to learn how GPUs train models. I have 20 minutes." },
  "peer-guide": { query: "GPU memory and model training", limit: 5 },
  "learning-companion": { mode: "solo", concept: "gpu-memory", message: "Explain why memory bandwidth matters." },
  "resource-guide": { query: "Official documentation about GPU memory", kind: "documentation" },
  perception: { prompt: "What could I learn from this image?", imageDataUrl: "data:image/png;base64,<supply image bytes>" },
};

/** A local HTTP client. Protocol adapters and externally delegated tokens are separate work. */
export default function ConnectorConsole() {
  const { actorId, modelMode, refreshSnapshot, ready } = useStore();
  const [cards, setCards] = useState<AgentCard[]>([]);
  const [agent, setAgent] = useState<AgentId>("knowledge-map");
  const [input, setInput] = useState(JSON.stringify(EXAMPLES["knowledge-map"], null, 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [io, setIo] = useState<{ request: string; response: string; status: number; ms: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const { activity, run: stream, cancel } = useAIStream();
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setOrigin(window.location.origin);
    localJson<AgentCard[] | { agents?: AgentCard[]; cards?: AgentCard[] }>("/api/agents")
      .then((result) => { if (alive) setCards(Array.isArray(result) ? result : result.agents ?? result.cards ?? []); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; controller.current?.abort(); };
  }, [ready]);
  const select = (id: AgentId) => { setAgent(id); setInput(JSON.stringify(EXAMPLES[id], null, 2)); setIo(null); setError(null); };
  const call = async () => {
    setError(null);
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { setError("Input must be valid JSON."); return; }
    const body = { input: parsed, idempotencyKey: mutationKey() };
    const started = performance.now();
    controller.current = new AbortController(); setBusy(true);
    try {
      const result = await stream(`/api/agents/${agent}`, { method: "POST", body: JSON.stringify(body), signal: controller.current.signal });
      setIo({ request: JSON.stringify(body, null, 2), response: JSON.stringify(result, null, 2), status: 200, ms: Math.round(performance.now() - started) });
      await refreshSnapshot();
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "The request failed."); }
    finally { setBusy(false); }
  };
  return (
    <div className="scroll grid-bg h-full">
      <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <section className="border border-line bg-panel">
            <header className="flex min-h-10 items-center justify-between border-b border-line px-4"><h1 className="label">Local agent interface</h1><span className="chip">{modelMode === "fixture" ? "Fixture AI" : "Live AI configuration"}</span></header>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2 p-4 text-xs">
              <dt className="text-muted">Discovery</dt><dd className="break-all">{origin}/api/agents</dd>
              <dt className="text-muted">Transport</dt><dd>HTTP JSON · version 1</dd>
              <dt className="text-muted">Identity</dt><dd>Current browser&apos;s signed local session</dd>
              <dt className="text-muted">Learner</dt><dd className="break-all font-mono">{actorId ?? "Loading…"}</dd>
            </dl>
            <p className="border-t border-line p-4 text-xs text-muted">This console calls independently addressable agents as your current local learner. An external client would need explicit local session authentication. This is not an MCP or A2A protocol implementation, and no external assistant is connected.</p>
          </section>
          <section className="border border-line bg-panel"><header className="border-b border-line px-4 py-3"><h2 className="label">Discovered agents</h2></header><ul>{cards.map((card) => <li key={card.id}><button disabled={busy} onClick={() => select(card.id)} className={`w-full border-b border-line px-4 py-3 text-left last:border-b-0 ${agent === card.id ? "bg-accent-soft" : "hover:bg-panel-2"}`}><span className="block text-sm font-medium">{card.name}</span><span className="mt-1 block text-xs text-muted">{card.description}</span>{card.dependencies.length > 0 && <span className="mt-2 block font-mono text-2xs text-dim">Calls: {card.dependencies.join(", ")}</span>}</button></li>)}</ul>{!cards.length && <p className="p-4 text-xs text-muted">{error ? "Discovery unavailable. No agents have been confirmed yet." : "Discovering available agents…"}</p>}</section>
        </div>
        <section className="flex min-h-[500px] flex-col border border-line bg-panel">
          <header className="flex min-h-10 items-center border-b border-line px-4"><h2 className="label">Invoke {agent}</h2></header>
          <form className="space-y-3 border-b border-line p-4" onSubmit={(e) => { e.preventDefault(); void call(); }}><label className="block text-xs text-muted" htmlFor="agent-json">Input JSON</label><textarea id="agent-json" className="field min-h-48 font-mono text-xs" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} /><button className="btn btn-primary" disabled={busy || !cards.length}>{busy ? "Running…" : "Invoke agent"}</button>{busy && <button className="btn ml-2" type="button" onClick={() => controller.current?.abort()}>Cancel</button>}</form>
          {error && <p className="border-b border-line px-4 py-3 text-sm text-err" role="alert">{error}</p>}
          <div className="px-4 py-3"><ActivityPanel activity={activity} title={`Running ${agent}`} onCancel={cancel} onRetry={() => void call()} /></div>
          <div className="space-y-4 p-4 text-xs"><details><summary className="cursor-pointer text-muted">Request</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">{io?.request ?? "No request sent."}</pre></details><div className="flex items-center gap-2"><h3 className="label">Response</h3>{io && <span className={`chip ${io.status < 300 ? "chip-success" : "chip-err"}`}>{io.status} · {io.ms} ms</span>}</div><pre className="max-h-[550px] overflow-auto whitespace-pre-wrap break-words text-muted">{io?.response ?? "No response yet. Agent calls may update your saved local map."}</pre></div>
        </section>
      </div>
    </div>
  );
}
