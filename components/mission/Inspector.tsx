"use client";
// [ INSPECTOR ] — the node card (plan §5.3, E3). Anti-slop by design: one short,
// real, cited source, checked live; diagrams marked non-authoritative; explain-back opt-in.
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { transcribeBlob, useRecorder } from "@/lib/client/hooks";
import { liveInterest } from "@/lib/math";
import { blockKindFor } from "@/components/map/pixels";
import { BlockIcon, Demo, NodeIcon, Pips, XpBar } from "@/components/ui/bits";
import Mermaid from "@/components/ui/Mermaid";
import type { Resource } from "@/lib/types";

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

export default function Inspector({ onClose }: { onClose?: () => void }) {
  const { selected, concepts, nodes, track, say, dispatch } = useStore();
  const [card, setCard] = useState<Card | null>(null);
  const [loadMs, setLoadMs] = useState(0);
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
      setLoadMs(ms);
      say("CARD", `${selected}: ${d.cached ? "cache hit" : "generated"} in ${ms}ms${d.cached ? " (target < 500ms)" : ""}`, d.cached ? "ok" : "info", d.demo);
    });
  }, [selected, say]);

  if (!c || !n) return <MapSummary />;
  const interest = liveInterest(n);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="label">Inspector</h2>
        <button className="text-[11px] text-muted hover:text-text" onClick={() => { dispatch({ t: "select", slug: null }); onClose?.(); }} aria-label="Close inspector">ESC ✕</button>
      </header>
      <div className="scroll min-h-0 flex-1">
        {/* Cover tile: Muse Image in production, decorative only */}
        <div className="grid-bg relative flex min-h-[84px] items-center gap-3 border-b border-line px-4 py-3">
          <NodeIcon state={n.state} mastery={n.mastery} slug={c.slug} size={44} />
          <div className="min-w-0">
            <h3 className="font-sans text-[19px] font-semibold leading-tight">{c.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`chip h-[18px] ${n.state === "understood" ? "chip-ok" : n.state === "explored" ? "chip-signal" : ""}`}>{n.state}</span>
              <span className="text-[10px] text-dim">{c.slug}</span>
              {n.learnedWith && <span className="text-[10px] text-diamond">learned with {n.learnedWith}</span>}
            </div>
          </div>
          <span className="absolute bottom-1 right-2 text-[8.5px] tracking-[0.12em] text-dim" title="Cover art comes from Muse Image ($0.01, cached per concept). Decorative only.">COVER · MUSE IMAGE</span>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-line px-4 py-3">
          <Pips value={interest} />
          <XpBar value={n.mastery} />
        </div>

        <section className="border-b border-line px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="label">Hook</h4>
            {card?.demo && <Demo title="Hook text is seed copy. In production it's written from the source by Muse Spark and cites it." />}
          </div>
          {!card ? (
            <div className="space-y-2"><div className="scanbar h-3 w-11/12 bg-panel-2" /><div className="scanbar h-3 w-9/12 bg-panel-2" /><div className="scanbar h-3 w-10/12 bg-panel-2" /></div>
          ) : (
            <p className="font-sans text-[14px] leading-relaxed text-text/90">
              {card.hook.map((s, i) => (
                <span key={i}>
                  {s}
                  {card.resource && i < 2 && <a href="#source" className="ml-0.5 align-super text-[10px] text-signal">[1]</a>}{" "}
                </span>
              ))}
            </p>
          )}
          {card && <p className="mt-2 text-[10px] text-dim">loaded in {loadMs}ms{card.cached ? " · cached per concept" : ""}</p>}
        </section>

        {card?.resource && <Source r={card.resource} onWatch={() => { track(c.slug, "watch"); say("SYSTEM", `watched source → mastery +0.2 on ${c.slug}`, "ok"); }} />}

        {card?.diagram && (
          <section className="border-b border-line px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="label">Flowchart</h4>
              <span className="text-[9px] tracking-[0.1em] text-dim" title="Generated by Muse Spark as Mermaid. A sketch to orient you, not an authoritative lesson.">MUSE SPARK · NOT AUTHORITATIVE</span>
            </div>
            <Mermaid code={card.diagram} />
          </section>
        )}

        <ExplainBack slug={c.slug} title={c.title} />

        <div className="flex gap-2 px-4 py-3">
          <button className="btn btn-ghost flex-1" onClick={() => { track(c.slug, "skip"); say("SYSTEM", `skip ${c.slug} → interest −0.3, fog creeps back`, "warn"); dispatch({ t: "select", slug: null }); onClose?.(); }}>
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
  return (
    <section id="source" className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="label">Source [1]</h4>
        {!v ? <span className="chip h-[18px]">checking…</span> : v.ok ? <span className="chip chip-ok h-[18px]">✓ verified · {v.method}</span> : <span className="chip chip-err h-[18px]">✕ dead link</span>}
      </div>
      {id && v?.ok !== false ? (
        playing ? (
          <iframe
            className="aspect-video w-full border border-line"
            src={`https://www.youtube-nocookie.com/embed/${id}?start=${r.startSeconds ?? 0}&autoplay=1&rel=0`}
            title={r.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button className="group relative block aspect-video w-full overflow-hidden border border-line bg-black" onClick={() => { setPlaying(true); watch(); }} aria-label={`Play ${r.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v?.thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="btn btn-primary">▶ Play{r.startSeconds ? ` from ${Math.floor(r.startSeconds / 60)}:${String(r.startSeconds % 60).padStart(2, "0")}` : ""}</span>
            </span>
          </button>
        )
      ) : (
        <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={watch} className="flex items-center justify-between border border-line bg-panel-2 px-3 py-2.5 hover:border-muted">
          <span className="font-sans text-[13px]">{r.title}</span>
          <span className="text-[10px] text-muted">OPEN ↗</span>
        </a>
      )}
      <p className="mt-1.5 text-[10.5px] text-muted">
        {r.provider} · {r.kind}
        {r.demo && <span className="ml-1.5"><Demo title="Picked for the seed set. Production picks from 3 grounded candidates.">SEED SOURCE</Demo></span>}
      </p>
    </section>
  );
}

function ExplainBack({ slug, title }: { slug: string; title: string }) {
  const { track, say } = useStore();
  const rec = useRecorder(20_000);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ transcript: string; score: number; feedback: string; demo: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setResult(null); setOpen(false); setErr(null); }, [slug]);

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
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="label">Explain it back</h4>
        <span className="text-[9px] tracking-[0.12em] text-dim">OPTIONAL · NEVER A QUIZ</span>
      </div>
      {result ? (
        <div className="enter">
          <div className="mb-2 flex items-center gap-1" aria-label={`Score ${result.score} of 3`}>
            {[0, 1, 2].map((i) => <BlockIcon key={i} kind={i < result.score ? "diamond" : "cobble"} slug={`s${i}`} size={22} />)}
            <span className="pixel ml-2 text-[13px]">{result.score}/3</span>
            {result.demo && <span className="ml-auto"><Demo title="Graded by a demo heuristic, not Muse Spark." /></span>}
          </div>
          <p className="font-sans text-[13px] text-text/90">{result.feedback}</p>
          <p className="mt-2 border-l-2 border-line pl-2 font-sans text-[12px] italic text-muted">&ldquo;{result.transcript}&rdquo;</p>
        </div>
      ) : (
        <>
          <p className="mb-3 font-sans text-[13px] text-muted">Say what {title.toLowerCase()} is in your own words. About 20 seconds. Your map lights up as you get it.</p>
          <div className="flex items-center gap-2">
            <button className={`btn ${rec.state === "recording" ? "btn-primary" : ""}`} onClick={onMic} disabled={rec.state === "processing"}>
              {rec.state === "recording" ? `■ Stop · ${Math.floor((20000 - rec.elapsed) / 1000)}s` : rec.state === "processing" ? "Grading…" : "● Explain by voice"}
            </button>
            {rec.state === "recording" && (
              <div className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
                {rec.level.map((l, i) => <span key={i} className="w-[3px] bg-signal" style={{ height: `${Math.max(8, l * 100)}%` }} />)}
              </div>
            )}
            {rec.state === "idle" && <button className="text-[11px] text-muted underline-offset-2 hover:underline" onClick={() => setOpen(!open)}>or type</button>}
          </div>
          {open && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) grade(typed.trim(), true).catch((x) => setErr(x.message)); }}>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="It's when…" maxLength={3000} />
              <button className="btn">Send</button>
            </form>
          )}
          {err && <p className="mt-2 text-[11px] text-err">{err}</p>}
        </>
      )}
    </section>
  );
}

function MapSummary() {
  const { nodes, concepts, dispatch } = useStore();
  const list = Object.values(nodes);
  const count = (s: string) => list.filter((n) => n.state === s).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center border-b border-line px-3"><h2 className="label">Inspector</h2></header>
      <div className="scroll min-h-0 flex-1 px-4 py-4">
        <p className="mb-4 font-sans text-[14px] leading-relaxed text-muted">Tap a block on the map to open its card. Blocks you explore grow brighter. Ones you skip fade back into fog.</p>
        <div className="mb-5 grid grid-cols-3 border border-line">
          {[["understood", "diamond"], ["explored", "gold"], ["seeded", "cobble"]].map(([s, k]) => (
            <div key={s} className="flex flex-col items-center gap-1 border-r border-line py-3 last:border-r-0">
              <BlockIcon kind={k as "diamond"} slug={s} size={22} />
              <span className="pixel text-[18px]">{count(s)}</span>
              <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">{s}</span>
            </div>
          ))}
        </div>
        <h3 className="label mb-2">Legend</h3>
        <ul className="space-y-2 text-[11.5px]">
          <li className="flex items-center gap-2"><BlockIcon kind="cobble" size={16} /> Seeded: on your map, not opened</li>
          <li className="flex items-center gap-2"><BlockIcon kind="iron" size={16} /><BlockIcon kind="gold" size={16} /> Explored: iron, then gold as mastery grows</li>
          <li className="flex items-center gap-2"><BlockIcon kind="diamond" size={16} /> Understood: diamond, torch lit</li>
          <li className="flex items-center gap-2"><span className="inline-block h-[3px] w-4 bg-[#b0b0b0] shadow-[0_3px_0_#6b4a2b]" /> Rail: prerequisite</li>
          <li className="flex items-center gap-2"><span className="inline-block h-2 w-4 bg-[#8f8f8f]" /> Stone road: part of</li>
          <li className="flex items-center gap-2"><span className="inline-block h-2 w-4 bg-[#96693f]" /> Dirt path: related</li>
          <li className="flex items-center gap-2"><span className="inline-block h-3 w-4 bg-[#07070b] outline outline-1 outline-line" /> Fog: not yet explored, or faded</li>
          <li className="flex items-center gap-2"><span className="text-[10px] text-dim">SIZE</span> 2×2 block = mastery ≥ 45%</li>
        </ul>
        <h3 className="label mb-2 mt-5">Recent</h3>
        <ul className="space-y-1">
          {list.sort((a, b) => b.lastTouched - a.lastTouched).slice(0, 10).map((n) => (
            <li key={n.slug}>
              <button data-slug={n.slug} onClick={() => dispatch({ t: "select", slug: n.slug })} className="flex w-full items-center gap-2 px-1 py-0.5 text-left text-[11.5px] hover:bg-panel-2">
                <NodeIcon state={n.state} mastery={n.mastery} slug={n.slug} size={14} />
                <span className="truncate">{concepts[n.slug]?.title ?? n.slug}</span>
                <span className="ml-auto text-[10px] text-dim">{blockKindFor(n.state, n.mastery)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
