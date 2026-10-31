"use client";
// Home: the guided path. The cold-start problem is the product — "I want to
// learn AI but don't know where to start." Muse gives the starting nodes,
// builds each lesson, watches how you learn, and decides what comes next.
// The map is a progress view you visit, not the front door.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/client/store";
import { useExpand, useInbox, useMatchJob } from "@/lib/client/hooks";
import { learnerModel } from "@/lib/learn";
import Teach from "@/components/learn/Teach";
import MatchModal from "@/components/mission/MatchModal";
import TimeLapse, { type TL } from "@/components/mission/TimeLapse";
import { replay } from "@/lib/math";

const WorldMap = dynamic(() => import("@/components/map/WorldMap"), { ssr: false });

// Presets send EXACTLY what the button says — no hidden rewrite.
const STARTS = ["Learn AI from zero", "Why AI needs special chips", "How chatbots work"];

export default function Home() {
  const { ready, concepts, edges, nodes, events, explorers, selected, dispatch, say, status, fitKey, missions } = useStore();
  const latestMission = missions[0];
  const { run, busy } = useExpand();
  const runMatch = useMatchJob();
  const [custom, setCustom] = useState("");
  const [tl, setTl] = useState<TL>({ on: false, t: 0, playing: false });
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useInbox((text, source) => {
    say("MCP", `add_curiosity("${text}") from ${source} client`, "ok");
    run(text, "mcp");
  });

  const path = useMemo(() => Object.values(concepts), [concepts]);
  const model = useMemo(() => learnerModel(nodes, events, nowTick), [nodes, events, nowTick]);
  // STICKY current step: it never changes on its own (that was regenerating
  // lessons mid-read). It moves only when the user picks, finishes, or branches.
  const [stickySlug, setStickySlug] = useState<string | null>(null);
  const [pendingBranch, setPendingBranch] = useState(false);
  useEffect(() => {
    if (!stickySlug && path.length) setStickySlug(model.frontier[0] ?? path[0].slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.length]);
  useEffect(() => {
    if (selected) setStickySlug(selected);
  }, [selected]);
  // A branch click expands the graph; when new steps land, go to the newest.
  const pathLen = useRef(0);
  useEffect(() => {
    if (pendingBranch && path.length > pathLen.current && pathLen.current > 0) {
      setStickySlug(path[path.length - 1].slug);
      dispatch({ t: "select", slug: path[path.length - 1].slug });
      setPendingBranch(false);
    }
    pathLen.current = path.length;
  }, [path, pendingBranch, dispatch]);
  const goTo = (slug: string) => { setStickySlug(slug); dispatch({ t: "select", slug }); };
  // Lessons ↔ graph are one system: exploring a node (from the graph, the
  // path list, anywhere) also blooms new neighbours around it, once per node.
  const exploredRef = useRef(new Set<string>());
  const explore = (slug: string) => {
    goTo(slug);
    const c = concepts[slug];
    if (c && !exploredRef.current.has(slug)) {
      exploredRef.current.add(slug);
      void run(c.title, "text");
    }
  };
  const currentSlug = stickySlug && concepts[stickySlug] ? stickySlug : path[0]?.slug ?? null;
  const current = currentSlug ? concepts[currentSlug] : null;
  const doneCount = Object.values(nodes).filter((n) => n.state === "understood").length;
  const started = path.length > 0;
  const museLive = status?.muse === "live";
  const shownNodes = useMemo(() => (tl.on ? replay(events, tl.t) : nodes), [tl.on, tl.t, events, nodes]);
  const start = events[0]?.at ?? nowTick;

  const nextAfter = (slug: string) => {
    // Progression follows the graph: a neighbour of the current concept
    // first, so the journey feels connected — never a random list jump.
    const neighbours = edges
      .flatMap((e) => (e.src === slug ? [e.dst] : e.dst === slug ? [e.src] : []))
      .filter((s) => nodes[s] && nodes[s].state !== "understood");
    const byInterest = neighbours.sort((a, b) => (nodes[b]?.interest ?? 0) - (nodes[a]?.interest ?? 0));
    const nextSlug = byInterest[0] ?? path.find((c) => c.slug !== slug && nodes[c.slug]?.state !== "understood")?.slug;
    if (nextSlug) goTo(nextSlug);
  };

  if (!ready) return <div className="flex h-full items-center justify-center text-muted">Loading your path…</div>;

  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <p className="font-sans text-[15px] text-muted">Your feed knows what keeps you scrolling. Further knows what you&apos;re trying to understand.</p>
        <h1 className="mt-2 font-sans text-[34px] font-semibold leading-tight sm:text-[42px]">Learn AI. One step at a time.</h1>
        <p className="mt-3 max-w-xl font-sans text-[16px] leading-relaxed text-muted">
          You don&apos;t need the right question. Tell Muse you&apos;re curious — it picks where to start, builds each lesson for how you learn, and decides what comes next.
        </p>
        <p className={`mt-3 inline-flex items-center gap-2 border px-2.5 py-1 text-[11px] ${museLive ? "border-ok/60 text-ok" : "border-signal/60 text-signal"}`}>
          <span className="dot" style={{ background: museLive ? "var(--color-ok)" : "var(--color-signal)" }} />
          {museLive ? "Muse Spark is live — courses and next steps are generated for you" : "Demo mode — add META_API_KEY to .env.local and restart for live Muse"}
        </p>

        {!started ? (
          <div className="mt-8 grid gap-2">
            {STARTS.map((s) => (
              <button key={s} disabled={busy} onClick={() => run(s, "text")} className="border border-line bg-panel px-4 py-4 text-left font-sans text-[17px] hover:border-signal disabled:opacity-50">
                {s} <span className="text-signal">→</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-center gap-3 text-[12px] text-muted">
              <span className="tabular-nums text-text">{doneCount} understood</span>·<span>{path.length} steps on your path</span>·<span>Learns: {model.style} · {model.pace}</span>
            </div>
            <div className="mt-3 h-1.5 w-full bg-line"><div className="h-full bg-signal transition-all" style={{ width: `${path.length ? (doneCount / path.length) * 100 : 0}%` }} /></div>

            {current && (
              <div className="mt-6">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="font-sans text-[24px] font-semibold">Next step: {current.title}</h2>
                  <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted">{nodes[current.slug]?.state ?? "seeded"}</span>
                </div>
                <Teach key={current.slug} slug={current.slug} title={current.title} onBranch={(t) => { setPendingBranch(true); void run(t, "text"); }} onNext={() => nextAfter(current.slug)} />
                <p className="mt-3 font-sans text-[13px] text-muted">Muse picks the format — prediction, a model to play with, an analogy, a story, a short clip. Finishing or skipping teaches it what works for you (MD §5.4 decay included). <a href="#knowledge-graph" className="text-signal underline underline-offset-2">See this step on your graph ↓</a> — exploring blooms new nodes around it.</p>
              </div>
            )}

            <h3 id="knowledge-graph" className="label mb-2 mt-10 scroll-mt-16">Your knowledge graph</h3>
            <p className="mb-3 font-sans text-[14px] text-muted">Nodes you explore grow brighter and larger; ones you skip fade (MD §5.4). Tap any node to make it your next step.</p>
            <div className="relative h-[420px] border border-line bg-black">
              <WorldMap concepts={path} edges={edges} nodes={shownNodes} explorers={tl.on ? [] : explorers} selected={currentSlug} onSelect={(slug) => slug && explore(slug)} now={tl.on ? tl.t : nowTick} fitKey={fitKey} holdCamera={tl.on} />
              <TimeLapse start={start} end={nowTick} tl={tl} setTl={setTl} caption={tl.on ? `${Object.keys(shownNodes).length} concepts on your map` : undefined} counts={tl.on ? `${Object.values(shownNodes).filter((n) => n.state === "understood").length} understood` : undefined} />
              <MatchModal />
            </div>
            <button className="btn mt-3 h-10 px-4" onClick={() => void runMatch()}>Find a learning partner →</button>
            <span className="ml-2 font-sans text-[13px] text-muted">Someone exploring nearby nodes, a step ahead on one of yours (MD §5.5).</span>

            <h3 className="label mb-2 mt-10">Your path</h3>
            <ol className="border border-line">
              {path.map((c, i) => {
                const n = nodes[c.slug];
                const st = n?.state ?? "seeded";
                return (
                  <li key={c.slug} className="border-b border-line last:border-b-0">
                    <button onClick={() => explore(c.slug)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2 ${c.slug === currentSlug ? "bg-panel-2" : "bg-panel"}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center border text-[12px] tabular-nums ${st === "understood" ? "border-ok text-ok" : c.slug === currentSlug ? "border-signal text-signal" : "border-line text-dim"}`}>{st === "understood" ? "✓" : i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-sans text-[15px]">{c.title}</span>
                        <span className="block truncate font-sans text-[13px] text-muted">{c.hook}</span>
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.12em] text-dim">{st}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {latestMission && (
          <div className={`mt-6 border px-3 py-2 font-sans text-[14px] ${latestMission.status === "error" ? "border-err/60 text-err" : latestMission.status === "running" ? "border-signal/60 text-signal" : "border-ok/60 text-ok"}`} role="status">
            {latestMission.status === "running" && `Muse is building your path from “${latestMission.text}”…`}
            {latestMission.status === "done" && `Path updated: ${latestMission.added} new step${latestMission.added === 1 ? "" : "s"}${latestMission.reused ? `, ${latestMission.reused} already known` : ""}. Your next step is highlighted below.`}
            {latestMission.status === "error" && `Muse couldn't build that path: ${latestMission.error ?? "unknown error"}`}
          </div>
        )}

        <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim().length >= 2) { run(custom.trim(), "text"); setCustom(""); } }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={500} placeholder="Or say what you're curious about — even vaguely…" className="field h-12 flex-1 px-3 font-sans text-[15px]" aria-label="Curiosity" />
          <button className="btn btn-primary h-12 px-4" disabled={busy}>{busy ? "Building…" : "Ask Muse"}</button>
        </form>

      </div>
    </div>
  );
}
