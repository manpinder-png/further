"use client";
// Mission control: the screen the 3-minute demo runs on (plan §2).
// Beats 1–5 all happen here without navigating: bloom, explore, time-lapse, match, MCP.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/client/store";
import { useExpand, useInbox, useMatchJob } from "@/lib/client/hooks";
import { replay } from "@/lib/math";
import LeftRail from "@/components/mission/LeftRail";
import Inspector from "@/components/mission/Inspector";
import CommandBar from "@/components/mission/CommandBar";
import MatchModal from "@/components/mission/MatchModal";
import TimeLapse, { type TL } from "@/components/mission/TimeLapse";

const WorldMap = dynamic(() => import("@/components/map/WorldMap"), { ssr: false });

export default function MissionControl() {
  const { ready, concepts, edges, nodes, events, explorers, selected, dispatch, say, missions, match, fitKey } = useStore();
  const { run } = useExpand();
  const runMatch = useMatchJob();
  const [tl, setTl] = useState<TL>({ on: false, t: 0, playing: false });
  const [sheet, setSheet] = useState<"none" | "log">("none");

  // E8: captures from an MCP client land on the open map.
  useInbox((text, source) => {
    say("MCP", `add_curiosity("${text}") from ${source} client`, "ok");
    run(text, "mcp");
  });

  // Auto-run the match job after a mission or a good explain-back (production: every 15s server-side).
  const tries = useRef(0);
  const doneCount = missions.filter((m) => m.status === "done").length;
  const explains = events.filter((e) => e.kind === "explain" && e.id >= 10_000).length;
  useEffect(() => {
    if (!ready || match || tries.current >= 3 || (doneCount === 0 && explains === 0)) return;
    const t = setTimeout(() => { tries.current++; runMatch({ quietIfNone: true }); }, explains ? 2500 : 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, explains, ready]);

  // Esc closes the inspector
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && dispatch({ t: "select", slug: null });
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [dispatch]);

  const start = events[0]?.at ?? Date.now();
  const end = Date.now();
  const shownNodes = useMemo(() => (tl.on ? replay(events, tl.t) : nodes), [tl.on, tl.t, events, nodes]);
  const conceptList = useMemo(() => Object.values(concepts), [concepts]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="hidden min-h-0 border-r border-line bg-panel lg:block">
          <LeftRail />
        </aside>

        <section className="relative min-h-0 bg-black" aria-label="World map">
          {ready && (
            <WorldMap
              concepts={conceptList}
              edges={edges}
              nodes={shownNodes}
              explorers={tl.on ? [] : explorers}
              selected={selected}
              onSelect={(slug) => dispatch({ t: "select", slug })}
              now={tl.on ? tl.t : end}
              fitKey={fitKey}
              holdCamera={tl.on}
            />
          )}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className="label !text-text/80 [text-shadow:1px_1px_0_#000]">World · ai-tech</span>
            <span className="text-[10px] text-muted [text-shadow:1px_1px_0_#000]">{Object.keys(shownNodes).length} concepts</span>
          </div>
          <button className="btn absolute right-3 top-3 h-8 bg-panel/90 lg:hidden" onClick={() => setSheet(sheet === "log" ? "none" : "log")}>
            {sheet === "log" ? "Close" : "Log"}
          </button>
          <TimeLapse start={start} end={end} tl={tl} setTl={setTl} />
          <MatchModal />
        </section>

        <aside className="hidden min-h-0 border-l border-line bg-panel lg:block">
          <Inspector />
        </aside>

        {/* Mobile sheets (N2) */}
        {sheet === "log" && (
          <div className="enter absolute inset-x-0 bottom-0 z-30 h-[70%] border-t border-line bg-panel lg:hidden">
            <LeftRail />
          </div>
        )}
        {selected && (
          <div className="enter absolute inset-x-0 bottom-0 z-30 h-[78%] border-t border-signal bg-panel lg:hidden">
            <Inspector />
          </div>
        )}
      </div>
      <CommandBar />
    </div>
  );
}
