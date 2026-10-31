"use client";
// The map screen (plan §2). Bloom, explore, time-lapse, match and off-app captures all land here.
// Layout: ≥1280 three columns · 768–1279 map + 360px inspector, rail in a drawer ·
// <768 full-screen map, inspector as a bottom sheet, rail in a drawer.
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
import { CloseIcon } from "@/components/ui/bits";

const WorldMap = dynamic(() => import("@/components/map/WorldMap"), { ssr: false });
const BANNER_KEY = "further:sample-banner-dismissed";

export default function MapScreen() {
  const { ready, concepts, edges, nodes, events, explorers, selected, dispatch, say, missions, match, fitKey, rail } = useStore();
  const { run } = useExpand();
  const runMatch = useMatchJob();
  const [tl, setTl] = useState<TL>({ on: false, t: 0, playing: false });

  // E8: captures from a connected app land on the open map.
  useInbox((text, source) => {
    say("MCP", `add_curiosity("${text}") from ${source} client`, "ok");
    run(text, "mcp");
  });

  // Auto-run the match job after a quest or a good explain-back in this tab (production: server job every 15s).
  const tries = useRef(0);
  const doneCount = missions.filter((m) => m.status === "done").length;
  const explains = events.filter((e) => e.kind === "explain" && e.id >= 10_000).length;
  const baseline = useRef<{ done: number; explains: number } | null>(null);
  useEffect(() => {
    if (!ready) return;
    baseline.current ??= { done: doneCount, explains };
    const b = baseline.current;
    const newExplains = explains - b.explains;
    if (match || tries.current >= 3 || (doneCount === b.done && newExplains <= 0)) return;
    const t = setTimeout(() => { tries.current++; runMatch({ quietIfNone: true }); }, newExplains > 0 ? 2500 : 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, explains, ready]);

  // Esc closes the inspector, then the drawer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) dispatch({ t: "select", slug: null });
      else if (rail) dispatch({ t: "rail", open: false });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [dispatch, selected, rail]);

  // Close the drawer when leaving the map.
  useEffect(() => () => dispatch({ t: "rail", open: false }), [dispatch]);

  // One sample-data banner instead of per-item badges.
  const [bannerOff, setBannerOff] = useState(true);
  useEffect(() => {
    try { setBannerOff(localStorage.getItem(BANNER_KEY) === "1"); } catch { setBannerOff(false); }
  }, []);
  const sample = explorers.some((e) => e.demo);
  const dismissBanner = () => {
    setBannerOff(true);
    try { localStorage.setItem(BANNER_KEY, "1"); } catch { /* ignore */ }
  };

  const start = events[0]?.at ?? Date.now();
  const end = Date.now();
  const shownNodes = useMemo(() => (tl.on ? replay(events, tl.t) : nodes), [tl.on, tl.t, events, nodes]);
  const conceptList = useMemo(() => Object.values(concepts), [concepts]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        <aside className="hidden min-h-0 border-r border-line bg-panel xl:block" aria-label="Quests and activity">
          <LeftRail />
        </aside>

        <section className="relative min-h-0 bg-black" aria-label="Your map">
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
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-2">
            {ready && sample && !bannerOff && (
              <div role="status" className="pointer-events-auto flex max-w-full items-center gap-3 border border-line-2 bg-panel/95 py-1 pl-3 pr-1 text-sm shadow-lg backdrop-blur">
                <span>You&apos;re exploring with sample data.</span>
                <button className="btn btn-ghost btn-icon min-h-8 border-transparent text-muted hover:text-text" onClick={dismissBanner} aria-label="Dismiss" title="Dismiss">
                  <CloseIcon size={12} />
                </button>
              </div>
            )}
            {!tl.on && <span className="bg-black/70 px-2 py-0.5 text-sm font-medium text-text">AI &amp; Tech</span>}
          </div>
          <TimeLapse start={start} end={end} tl={tl} setTl={setTl} />
          <MatchModal />
        </section>

        <aside className="hidden min-h-0 border-l border-line bg-panel md:block" aria-label="Concept details">
          <Inspector />
        </aside>

        {/* Drawer: left rail below 1280px */}
        {rail && (
          <div className="absolute inset-0 z-40 xl:hidden">
            <button className="absolute inset-0 bg-black/50" aria-label="Close quests and activity" tabIndex={-1} onClick={() => dispatch({ t: "rail", open: false })} />
            <aside id="left-rail" className="enter-left absolute inset-y-0 left-0 w-[min(320px,88vw)] border-r border-line bg-panel shadow-2xl" aria-label="Quests and activity">
              <LeftRail />
            </aside>
          </div>
        )}

        {/* Bottom sheet: inspector below 768px */}
        {selected && (
          <div className="enter absolute inset-x-0 bottom-0 z-30 h-[78%] border-t border-line-2 bg-panel shadow-[0_-12px_40px_rgba(0,0,0,.6)] flex flex-col md:hidden" role="dialog" aria-label="Concept details">
            <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 bg-line-2" aria-hidden />
            <div className="min-h-0 flex-1"><Inspector /></div>
          </div>
        )}
      </div>
      <CommandBar />
    </div>
  );
}
