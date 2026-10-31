"use client";
// Builder view only: the raw agent log (expansion, canonicalization, scoring math).
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/client/store";
import { useMatchJob } from "@/lib/client/hooks";
import { Panel } from "@/components/ui/bits";
import type { AgentName } from "@/lib/types";

const AGENT_COL: Record<AgentName, string> = {
  TRANSCRIBE: "#c86bff", EXPAND: "#f26b1d", CANONICALIZE: "#4ddfe6", GROUND: "#3aa0ff", OEMBED: "#3aa0ff",
  CARD: "#f5c542", GRADE: "#7dff4d", MATCH: "#ff5d73", FACILITATE: "#f26b1d", GUARD: "#3ddc84", MCP: "#c86bff",
  IMAGE: "#f5c542", SYSTEM: "#85858c",
};
const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function AgentLog() {
  const { log } = useStore();
  const runMatch = useMatchJob();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <Panel title="Agent log · builder" right={<button className="font-mono text-2xs text-muted hover:text-text" onClick={() => runMatch()}>MATCH ▶</button>} className="flex-1">
      <div ref={box} className="scroll h-full px-3 pb-2 font-mono text-2xs" role="log">
        {log.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="shrink-0 text-dim tabular-nums">{fmt(l.at)}</span>
            <span className="w-[82px] shrink-0 truncate" style={{ color: AGENT_COL[l.agent] }}>{l.agent}</span>
            <span className={`min-w-0 break-words ${l.level === "err" ? "text-err" : l.level === "warn" ? "text-warn" : "text-muted"}`}>
              {l.msg}
              {l.demo && <span className="ml-1 text-[#f2a26b]">[demo]</span>}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
