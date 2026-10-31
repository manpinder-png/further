"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/client/store";
import { useMatchJob } from "@/lib/client/hooks";
import { Demo, Head, Panel } from "@/components/ui/bits";
import { CATALOG } from "@/lib/demo/seed";
import type { AgentName } from "@/lib/types";

const AGENT_COL: Record<AgentName, string> = {
  TRANSCRIBE: "#c86bff", EXPAND: "#f26b1d", CANONICALIZE: "#4ddfe6", GROUND: "#3aa0ff", OEMBED: "#3aa0ff",
  CARD: "#f5c542", GRADE: "#7dff4d", MATCH: "#ff5d73", FACILITATE: "#f26b1d", GUARD: "#3ddc84", MCP: "#c86bff",
  IMAGE: "#f5c542", SYSTEM: "#85858c",
};
const SRC: Record<string, string> = { voice: "MIC", text: "TXT", mcp: "MCP", lens: "CAM" };

const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function LeftRail() {
  const { missions, log, explorers, nodes } = useStore();
  const runMatch = useMatchJob();
  const logBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Panel title="Missions" right={<span className="text-[10px] text-dim">{missions.length} curiosities</span>} className="max-h-[32%]">
        <ul className="scroll h-full px-2 pb-2">
          {missions.length === 0 && (
            <li className="px-1 py-2 text-[11px] leading-relaxed text-muted">
              No missions yet. Tap the mic and say what you&apos;re curious about. Vague is fine.
            </li>
          )}
          {missions.map((m) => (
            <li key={m.id} className="enter mb-1 border border-line bg-panel-2 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.12em]">
                <span className="text-dim">{SRC[m.source]}</span>
                <span className={m.status === "running" ? "text-signal" : m.status === "error" ? "text-err" : "text-ok"}>
                  {m.status === "running" ? "● RUNNING" : m.status === "error" ? "✕ FAILED" : "✓ DONE"}
                </span>
                <span className="ml-auto text-dim tabular-nums">+{m.added} · ↺{m.reused}</span>
              </div>
              <p className="mt-0.5 truncate font-sans text-[12.5px]" title={m.text}>&ldquo;{m.text}&rdquo;</p>
              {m.intent && <p className="truncate text-[10.5px] text-muted">→ {m.intent}</p>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Agent log" right={<span className="flex items-center gap-1.5 text-[10px] text-dim"><span className="dot cursor-blink bg-signal" />live</span>} className="flex-1">
        <div ref={logBox} className="scroll h-full px-3 pb-2 text-[10.5px] leading-[1.55]" role="log" aria-live="polite">
          {log.map((l) => (
            <div key={l.id} className="enter flex gap-2">
              <span className="shrink-0 text-dim tabular-nums">{fmt(l.at)}</span>
              <span className="w-[82px] shrink-0 truncate" style={{ color: AGENT_COL[l.agent] }}>{l.agent}</span>
              <span className={`min-w-0 break-words ${l.level === "err" ? "text-err" : l.level === "warn" ? "text-warn" : l.level === "ok" ? "text-text" : "text-muted"}`}>
                {l.msg}
                {l.demo && <span className="ml-1 text-[9px] text-[#f2a26b]">[demo]</span>}
              </span>
            </div>
          ))}
          <div className="text-dim">
            <span className="cursor-blink">▍</span>
          </div>
        </div>
      </Panel>

      <Panel title="Explorers" right={<button className="text-[10px] tracking-[0.12em] text-signal hover:underline" onClick={() => runMatch()}>MATCH ▶</button>} className="max-h-[30%]">
        <ul className="scroll h-full px-2 pb-2">
          {explorers.map((e) => {
            const at = e.activeConcepts[0];
            const mins = Math.max(1, Math.round((Date.now() - e.lastActive) / 60000));
            return (
              <li key={e.id} className="flex items-center gap-2 px-1 py-1">
                <Head color={e.color} size={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11.5px]">
                    {e.name}
                    {e.demo && <Demo title="Seed explorer. In the live demo, a teammate's phone takes this slot.">SEED</Demo>}
                    {!e.openToMatch && <span className="text-[9px] text-dim">NOT OPEN</span>}
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    on {CATALOG[at]?.title ?? at}
                    {nodes[at] ? <span className="text-signal"> · near you</span> : null} · {mins}m
                  </div>
                </div>
                <span className="dot" style={{ background: mins < 10 ? "var(--color-ok)" : "var(--color-dim)" }} title={mins < 10 ? "active" : "idle"} />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
