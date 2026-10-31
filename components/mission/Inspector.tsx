"use client";
// Inspector: the concept card (plan §5.3, E3). One short, real, cited source, checked live;
// diagrams marked as a sketch; explain-back opt-in. Order: title → hook → source → explain → diagram.
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { transcribeBlob, useRecorder } from "@/lib/client/hooks";
import { liveInterest } from "@/lib/math";
import { BlockIcon, CloseIcon, Demo, NodeIcon, Pips, XpBar } from "@/components/ui/bits";
import Mermaid from "@/components/ui/Mermaid";
import { STATE_LABEL, personName } from "@/lib/client/format";
import type { NodeState, Resource } from "@/lib/types";

interface Card {
  slug: string;
  title: string;
  hook: string[];
  resource: Resource | null;
  diagram: string | null;
  cached: boolean;
  demo: boolean;
}

const verified = new Map<string, Promise<{ ok: boolean; method?: string; title?: string; thumbnail?: string }>>();
function verify(url: string) {
  if (!verified.has(url))
    verified.set(url, fetch("/api/resources/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }).then((r) => r.json()).catch(() => ({ ok: false, method: "network" })));
  return verified.get(url)!;
}
const ytId = (u: string) => u.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];

export function StateBadge({ state }: { state: NodeState }) {
  return <span className={`chip ${state === "understood" ? "chip-success" : ""}`}>{STATE_LABEL[state]}</span>;
}

export default function Inspector({ onClose }: { onClose?: () => void }) {
  const { selected, concepts, nodes, track, say, dispatch } = useStore();
  const [card, setCard] = useState<Card | null>(null);
  const c = selected ? concepts[selected] : null;
  const n = selected ? nodes[selected] : null;

  // open (+0.3 interest) on select, dwell (+0.2) after 30s (plan §5.4)
  useEffect(() => {
    if (!selected) return;
    track(selected, "open");
    const t = setTimeout(() => { track(selected, "dwell"); say("SYSTEM", `dwell 30s on ${selected} → interest +0.2`); }, 30_000);
    return () => clearTimeout(t);
  }, [selected, track, say]);

  useEffect(() => {
    if (!selected) return;
    setCard(null);
    const t0 = performance.now();
    fetch(`/api/card/${selected}`).then((r) => r.json()).then((d: Card) => {
      const ms = Math.round(performance.now() - t0);
      setCard(d);
      say("CARD", `${selected}: ${d.cached ? "cache hit" : "generated"} in ${ms}ms${d.cached ? " (target < 500ms)" : ""}`, d.cached ? "ok" : "info", d.demo);
    });
  }, [selected, say]);

  if (!c || !n) return <MapSummary />;
  const interest = liveInterest(n);
  const close = () => { dispatch({ t: "select", slug: null }); onClose?.(); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
        <h2 className="label">Concept</h2>
        <button className="btn btn-ghost btn-icon min-h-9 border-transparent text-muted hover:text-text" onClick={close} aria-label="Close concept card" title="Close (Esc)">
          <CloseIcon />
        </button>
      </header>
      <div className="scroll min-h-0 flex-1">
        {/* 1. Title + state */}
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <NodeIcon state={n.state} mastery={n.mastery} slug={c.slug} size={40} />
            <div className="min-w-0">
              <h3 className="text-xl font-semibold">{c.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StateBadge state={n.state} />
                {n.learnedWith && <span className="text-xs text-muted">Learned with {personName(n.learnedWith)}</span>}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Pips value={interest} />
            <XpBar value={n.mastery} />
          </div>
        </div>

        {/* 2. Hook */}
        <section className="border-b border-line px-4 py-3" aria-label="Summary">
          {!card ? (
            <div className="space-y-2" aria-label="Loading"><div className="scanbar h-3 w-11/12 bg-panel-2" /><div className="scanbar h-3 w-9/12 bg-panel-2" /><div className="scanbar h-3 w-10/12 bg-panel-2" /></div>
          ) : (
            <p className="text-base text-text/90">
              {card.hook.map((s, i) => (
                <span key={i}>
                  {s}
                  {card.resource && i < 2 && <a href="#source" className="ml-0.5 align-super text-2xs text-muted underline-offset-2 hover:underline" aria-label="Source 1">[1]</a>}{" "}
                </span>
              ))}
              <Demo title="Hook text is seed copy." />
            </p>
          )}
        </section>

        {/* 3. Source */}
        {card?.resource && <Source r={card.resource} onWatch={() => { track(c.slug, "watch"); say("SYSTEM", `watched source → mastery +0.2 on ${c.slug}`, "ok"); }} />}

        {/* 4. Explain it back */}
        <ExplainBack slug={c.slug} title={c.title} />

        {/* 5. Diagram (collapsed) */}
        {card?.diagram && <Diagram code={card.diagram} title={c.title} />}

        <div className="px-4 py-3">
          <button className="btn btn-ghost w-full" onClick={() => { track(c.slug, "skip"); say("SYSTEM", `skip ${c.slug} → interest −0.3, fog creeps back`, "warn"); close(); }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Source({ r, onWatch }: { r: Resource; onWatch: () => void }) {
  const [v, setV] = useState<{ ok: boolean; method?: string; title?: string; thumbnail?: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const watched = useRef(false);
  const { say } = useStore();
  useEffect(() => {
    setV(null);
    setPlaying(false);
    watched.current = false;
    verify(r.url).then((d) => {
      setV(d);
      say(d.method === "oembed" ? "OEMBED" : "GROUND", `${r.provider} source ${d.ok ? "verified" : "DEAD → would fall back to article"} (${d.method ?? "?"})`, d.ok ? "ok" : "err", r.demo);
    });
  }, [r.url, r.provider, r.demo, say]);
  const id = ytId(r.url);
  const watch = () => {
    if (!watched.current) { watched.current = true; onWatch(); }
  };
  const start = r.startSeconds ? `${Math.floor(r.startSeconds / 60)}:${String(r.startSeconds % 60).padStart(2, "0")}` : null;
  const meta = (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <span>{r.provider} · {r.kind}</span>
      {v?.ok && <span className="text-success">✓ Verified source</span>}
      {v && !v.ok && <span className="text-err">Link unavailable</span>}
    </p>
  );
  return (
    <section id="source" className="border-b border-line px-4 py-3">
      <h4 className="label mb-2">Source</h4>
      {id && v?.ok !== false ? (
        playing ? (
          <>
            <iframe
              className="aspect-video w-full border border-line"
              src={`https://www.youtube-nocookie.com/embed/${id}?start=${r.startSeconds ?? 0}&autoplay=1&rel=0`}
              title={r.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <p className="mt-1.5 text-sm">{r.title}</p>
            {meta}
          </>
        ) : (
          <button className="group flex w-full items-center gap-3 text-left" onClick={() => { setPlaying(true); watch(); }} aria-label={`Play ${r.title}${start ? ` from ${start}` : ""}`}>
            <span className="relative block aspect-video w-28 shrink-0 overflow-hidden border border-line bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v?.thumbnail ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-85 group-hover:opacity-100" />
              <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-7 w-7 items-center justify-center bg-black/75 text-xs text-white">▶</span></span>
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 block text-sm group-hover:underline">{r.title}</span>
              {meta}
              {start && <span className="block text-xs text-dim">Starts at {start}</span>}
            </span>
          </button>
        )
      ) : (
        <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={watch} className="block border border-line bg-panel-2 px-3 py-2.5 hover:border-dim">
          <span className="block text-sm">{r.title} <span className="text-muted" aria-hidden>↗</span></span>
          {meta}
        </a>
      )}
    </section>
  );
}

function Diagram({ code, title }: { code: string; title: string }) {
  const [big, setBig] = useState(false);
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 touch-target">
        <span className="flex items-center gap-2">
          <span className="text-dim transition-transform group-open:rotate-90" aria-hidden>▸</span>
          <span className="label">Diagram</span>
        </span>
        <span className="text-xs text-dim">AI sketch · may simplify</span>
      </summary>
      <div className="px-4 pb-3">
        <button className="block w-full border border-line bg-bg p-2 text-left hover:border-dim" onClick={() => setBig(true)} aria-label={`Expand diagram for ${title}`}>
          <Mermaid code={code} />
          <span className="mt-1 block text-center text-xs text-muted">Tap to expand</span>
        </button>
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-8" role="dialog" aria-modal aria-label={`Diagram: ${title}`} onClick={() => setBig(false)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setBig(false); } }}>
          <div className="enter flex max-h-full w-full max-w-4xl flex-col border border-line-2 bg-panel" onClick={(e) => e.stopPropagation()}>
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
              <span className="text-sm font-medium">{title} <span className="ml-2 text-xs font-normal text-dim">AI sketch · may simplify</span></span>
              <button className="btn btn-ghost btn-icon border-transparent text-muted hover:text-text" onClick={() => setBig(false)} aria-label="Close diagram" title="Close (Esc)" autoFocus><CloseIcon /></button>
            </header>
            <div className="scroll min-h-0 flex-1 p-4"><Mermaid code={code} large /></div>
          </div>
        </div>
      )}
    </details>
  );
}

function ExplainBack({ slug, title }: { slug: string; title: string }) {
  const { track, say } = useStore();
  const rec = useRecorder(20_000);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ transcript: string; score: number; feedback: string; demo: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setResult(null); setOpen(false); setErr(null); setTyped(""); }, [slug]);

  const grade = async (transcript: string, demo: boolean) => {
    say("GRADE", `rubric 0–3 on "${transcript.slice(0, 40)}…"`, "info", demo);
    const r = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, transcript }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setResult({ transcript, ...d });
    track(slug, "explain", { score: d.score });
    say("GRADE", `${d.score}/3 → mastery +${((d.score / 3) * 0.5).toFixed(2)} · "${d.feedback}"`, "ok", d.demo);
  };

  const onMic = async () => {
    setErr(null);
    if (rec.state === "recording") return rec.stop();
    const blob = await rec.start();
    if (!blob) return setErr("Mic blocked. You can type instead.");
    try {
      say("TRANSCRIBE", `explain-back clip ${(blob.size / 1024).toFixed(0)}KB → Voice Transcribe`);
      const t = await transcribeBlob(blob, "explain");
      say("TRANSCRIBE", `${t.ms}ms: "${t.text.slice(0, 50)}…"`, "ok", t.demo);
      await grade(t.text, t.demo);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      rec.setState("idle");
    }
  };

  return (
    <section className="border-b border-line px-4 py-3" aria-labelledby="explain-h">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 id="explain-h" className="label">Explain it back</h4>
        <span className="text-xs text-muted">Optional · never a quiz</span>
      </div>
      {result ? (
        <div className="enter" aria-live="polite">
          <div className="mb-2 flex items-center gap-1" aria-label={`${result.score} of 3`}>
            {[0, 1, 2].map((i) => <BlockIcon key={i} kind={i < result.score ? "diamond" : "cobble"} slug={`s${i}`} size={22} />)}
            <span className="pixel ml-2 text-sm">{result.score}/3</span>
            <span className="ml-auto"><Demo title="Graded by a demo heuristic." /></span>
          </div>
          <p className="text-sm text-text/90">{result.feedback}</p>
          <p className="mt-2 border-l-2 border-line-2 pl-2 text-xs italic text-muted">&ldquo;{result.transcript}&rdquo;</p>
        </div>
      ) : (
        <>
          <p className="mb-2.5 text-sm text-muted">Say what {title.toLowerCase()} is in your own words. About 20 seconds.</p>
          <div className="flex items-center gap-2">
            <button className={`btn ${rec.state === "recording" ? "btn-primary" : ""}`} onClick={onMic} disabled={rec.state === "processing"}>
              {rec.state === "recording" ? `■ Stop · ${Math.floor((20000 - rec.elapsed) / 1000)}s` : rec.state === "processing" ? "Checking…" : "Explain by voice"}
            </button>
            {rec.state === "recording" && (
              <div className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
                {rec.level.map((l, i) => <span key={i} className="w-[3px] bg-text/70" style={{ height: `${Math.max(8, l * 100)}%` }} />)}
              </div>
            )}
            {rec.state !== "recording" && rec.state !== "processing" && (
              <button className="btn btn-ghost border-transparent text-muted hover:text-text" onClick={() => setOpen(!open)} aria-expanded={open}>or type</button>
            )}
          </div>
          {open && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) grade(typed.trim(), true).catch((x) => setErr(x.message)); }}>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="It's when…" maxLength={3000} aria-label={`Explain ${title} in your own words`} autoFocus />
              <button className="btn">Send</button>
            </form>
          )}
          {err && <p className="mt-2 text-xs text-err" role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}

function MapSummary() {
  const { nodes, concepts, dispatch } = useStore();
  const list = Object.values(nodes);
  const stats = { understood: list.filter((n) => n.state === "understood").length, explored: list.filter((n) => n.state === "explored").length, seeded: list.filter((n) => n.state === "seeded").length };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center border-b border-line px-4"><h2 className="label">Your map</h2></header>
      <div className="scroll min-h-0 flex-1 px-4 py-4">
        <p className="mb-4 text-base text-muted">Tap a block on the map to open its card. Blocks you explore grow brighter. Ones you skip fade back into fog.</p>
        <dl className="mb-5 grid grid-cols-3 border border-line">
          {([["understood", "diamond"], ["explored", "gold"], ["seeded", "cobble"]] as const).map(([s, k]) => (
            <div key={s} className="flex flex-col items-center gap-1 border-r border-line py-3 last:border-r-0">
              <BlockIcon kind={k} slug={s} size={22} />
              <dd className="text-xl font-semibold tabular-nums">{stats[s]}</dd>
              <dt className="text-xs text-muted">{STATE_LABEL[s]}</dt>
            </div>
          ))}
        </dl>
        <h3 className="label mb-2">Legend</h3>
        <ul className="space-y-2 text-sm text-text/90">
          <li className="flex items-center gap-2"><BlockIcon kind="cobble" size={16} /> On your map: not opened yet</li>
          <li className="flex items-center gap-2"><BlockIcon kind="iron" size={16} /><BlockIcon kind="gold" size={16} /> Explored: brighter as you learn</li>
          <li className="flex items-center gap-2"><BlockIcon kind="diamond" size={16} /> Understood</li>
          <li className="flex items-center gap-2"><span className="inline-block h-[3px] w-4 bg-[#b0b0b0] shadow-[0_3px_0_#6b4a2b]" /> Rail: learn this first</li>
          <li className="flex items-center gap-2"><span className="inline-block h-2 w-4 bg-[#8f8f8f]" /> Stone road: part of</li>
          <li className="flex items-center gap-2"><span className="inline-block h-2 w-4 bg-[#96693f]" /> Dirt path: related</li>
          <li className="flex items-center gap-2"><span className="inline-block h-3 w-4 bg-[#07070b] outline outline-1 outline-line-2" /> Fog: not explored yet, or faded</li>
          <li className="text-muted">Bigger blocks = deeper understanding.</li>
        </ul>
        <h3 className="label mb-2 mt-5">Recent</h3>
        <ul className="space-y-0.5">
          {[...list].sort((a, b) => b.lastTouched - a.lastTouched).slice(0, 10).map((n) => (
            <li key={n.slug}>
              <button data-slug={n.slug} onClick={() => dispatch({ t: "select", slug: n.slug })} className="flex min-h-9 w-full items-center gap-2 px-1 text-left text-sm hover:bg-panel-2">
                <NodeIcon state={n.state} mastery={n.mastery} slug={n.slug} size={16} />
                <span className="truncate">{concepts[n.slug]?.title ?? n.slug}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{STATE_LABEL[n.state]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
