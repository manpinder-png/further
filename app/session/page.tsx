"use client";
// F8 / E6: AI-facilitated jigsaw session ("Today's swap" in the UI). Each person teaches the piece they know.
// Layout: ≥1280 three columns · 768–1279 swap panel + chat · <768 chat-first with tabs.
// Every human message → /api/session/:id/message → Llama Guard → (safe) broadcast.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { CATALOG, seedExplorers } from "@/lib/demo/seed";
import { Demo, Head, NodeIcon, ShieldIcon } from "@/components/ui/bits";
import { BUILDER_VIEW } from "@/lib/builder";
import { personName } from "@/lib/client/format";

type Msg = {
  id: number;
  who: "facilitator" | "me" | "peer" | "system";
  text: string;
  guard?: { safe: boolean; engine: string; ms: number; category?: string };
  demo?: boolean;
};

const PHASES = ["You explain", "Peer explains", "Joint question", "Summary"];
const PEER_LINES = [
  "Memory bandwidth is how many bytes per second the chip can pull from memory. If it's too narrow, the math units just sit there waiting.",
  "Put the memory right next to the chip and stack it vertically. More lanes, shorter wires. That's what HBM does.",
];

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <Session />
    </Suspense>
  );
}

function Session() {
  const { match, profile, ready, sessions } = useStore();
  const params = useSearchParams();
  const [forced, setForced] = useState(false);
  const active = (match?.status === "accepted" && params.get("m") === match.id) || forced;
  if (!ready) return null;
  if (!active)
    return (
      <div className="grid-bg scroll flex h-full items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg border border-line bg-panel">
          <header className="flex h-10 items-center border-b border-line px-4"><h1 className="label">Session</h1></header>
          <div className="space-y-4 p-5">
            <p className="text-md text-text/90">No session right now.</p>
            <p className="text-sm text-muted">
              Sessions start when someone exploring the same part of the map is a step ahead on a neighbouring concept, and you <em>both</em> accept within 60 seconds. Nothing connects without both of you.
            </p>
            {sessions.length > 0 && (
              <div>
                <h2 className="label mb-2">Past sessions</h2>
                {sessions.map((s) => (
                  <div key={s.at} className="mb-1 border border-line bg-panel-2 px-3 py-2 text-sm">
                    With {personName(s.peer)} · {s.concepts.map((c) => CATALOG[c]?.title ?? c).join(", ")}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Link href="/" className="btn">Back to map</Link>
              {BUILDER_VIEW && <button className="btn btn-ghost" onClick={() => setForced(true)} title="Rehearsal only: opens a session with a seed peer">Rehearse with seed peer</button>}
            </div>
          </div>
        </div>
      </div>
    );
  return <Room peerId={match?.peer.id ?? "amit"} you={profile.displayName} youStrong={match?.youStrong ?? "matrix-multiplication"} peerStrong={match?.peerStrong ?? "memory-bandwidth"} shared={match?.concept ?? "ai-accelerators"} />;
}

function Room({ peerId, you, youStrong, peerStrong, shared }: { peerId: string; you: string; youStrong: string; peerStrong: string; shared: string }) {
  const { say, track, dispatch, nodes } = useStore();
  const router = useRouter();
  const peer = useMemo(() => seedExplorers(Date.now()).find((e) => e.id === peerId)!, [peerId]);
  const T = (s: string) => CATALOG[s]?.title ?? s;
  const ctx = { a: you, aStrong: T(youStrong), b: peer.name, bStrong: T(peerStrong), shared: T(shared) };
  const id = useRef(1);
  const turn = useRef(0);
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, who: "system", text: `Session started · 10 minutes` },
    {
      id: 1,
      who: "facilitator",
      demo: true,
      text: `Hi ${you} and ${peer.name}. You're both exploring ${ctx.shared}. ${you} knows ${ctx.aStrong}; ${peer.name} knows ${ctx.bStrong}. ${you}, explain ${ctx.aStrong.toLowerCase()} in two sentences.`,
    },
  ]);
  const [phase, setPhase] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reported, setReported] = useState(false);
  const [left, setLeft] = useState(600);
  const [tab, setTab] = useState<"chat" | "swap" | "safety">("chat");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);
  useEffect(() => {
    if (ended) return;
    const iv = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(iv);
  }, [ended]);

  const push = (m: Omit<Msg, "id">) => setMsgs((p) => [...p, { ...m, id: ++id.current }]);
  const history = () => msgs.filter((m) => m.who !== "system").map((m) => ({ role: m.who === "facilitator" ? ("assistant" as const) : ("user" as const), content: m.text.slice(0, 1000) }));

  const send = async (who: "me" | "peer", body: string) => {
    setSending(true);
    say("GUARD", `Llama Guard ← ${who === "me" ? you : peer.name}: "${body.slice(0, 40)}…"`);
    const r = await fetch(`/api/session/demo/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: who, text: body, turn: turn.current, ctx, history: history() }),
    });
    const d = await r.json();
    setSending(false);
    if (!r.ok) { push({ who: "system", text: d.error ?? "Message held." }); return; }
    say("GUARD", `${d.verdict.safe ? "safe" : `UNSAFE ${d.verdict.category}`} · ${d.verdict.engine} · ${d.verdict.ms}ms`, d.verdict.safe ? "ok" : "err", d.verdict.engine !== "llama-guard");
    if (!d.delivered) {
      push({ who: "system", text: `This message was held by the safety check and wasn't delivered.` });
      return;
    }
    push({ who, text: body, guard: d.verdict, demo: who === "peer" });
    turn.current++;
    setPhase(Math.min(3, turn.current));
    if (d.facilitator) {
      say("FACILITATE", `turn ${turn.current}: ${d.facilitator.split(/\s+/).length} words (≤ 40)`, "ok", d.demo);
      await new Promise((r) => setTimeout(r, 400));
      push({ who: "facilitator", text: d.facilitator, demo: d.demo });
    }
    if (d.done) { setDone(true); return; }
    // DEMO: seed peer replies on its turns. Live: arrives over Supabase Broadcast.
    if (who === "me" && (turn.current === 1 || turn.current === 3) && !blocked) {
      setTimeout(() => send("peer", PEER_LINES[turn.current === 1 ? 0 : 1]), 1600);
    }
  };

  const end = () => {
    setEnded(true);
    track(youStrong, "session", { with: peer.name });
    track(peerStrong, "session", { with: peer.name });
    dispatch({ t: "session", r: { peer: peer.name, concepts: [youStrong, peerStrong], summary: [], at: Date.now() } });
    say("FACILITATE", `session summary → sessions; mastery +0.2 on ${youStrong}, ${peerStrong} (learned with ${peer.name}); suggested: hbm`, "ok");
  };

  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  const swap = (
    <>
      <Piece label="You teach" color="#f26b1d" slug={youStrong} title={ctx.aStrong} nodes={nodes} />
      <Piece label={`${peer.name} teaches`} color={peer.color} slug={peerStrong} title={ctx.bStrong} demo={peer.demo} />
      <p className="border-b border-line px-4 py-3 text-sm text-muted">Both exploring <span className="text-text">{ctx.shared}</span></p>
    </>
  );
  const safety = (
    <ul className="space-y-3 p-4 text-sm text-muted">
      <li className="flex gap-2"><span className="mt-0.5 text-success"><ShieldIcon size={14} /></span> Every message is checked for safety before the other person sees it.</li>
      <li className="flex gap-2"><span className="mt-0.5 text-success"><ShieldIcon size={14} /></span> Block and Report are always one tap away.</li>
      <li className="flex gap-2"><span className="mt-0.5 text-success"><ShieldIcon size={14} /></span> Learning with others is 18+ only.</li>
      {BUILDER_VIEW && (
        <li className="border border-line bg-bg p-2 font-mono text-2xs text-dim">
          Text chat over Supabase Broadcast.<br />POST /api/session/:id/message<br />→ moderate() · Llama Guard<br />→ broadcast session:{"{id}"}<br />→ facilitator turn (Muse Spark)
        </li>
      )}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
      {/* Left: today's swap (+ safety below 1280px) */}
      <aside className="hidden min-h-0 flex-col border-r border-line bg-panel md:flex">
        <header className="flex h-10 shrink-0 items-center border-b border-line px-4"><h2 className="label">Today&apos;s swap</h2></header>
        {swap}
        <div className="scroll min-h-0 flex-1 xl:hidden">
          <h2 className="label px-4 pt-4">Safety</h2>
          {safety}
        </div>
      </aside>

      {/* Center: chat */}
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3">
          <Head color={peer.color} size={20} />
          <span className="min-w-0 truncate text-sm">with {peer.name}</span>
          <Demo title="Seed peer for rehearsal.">SEED PEER</Demo>
          <span className="ml-auto font-mono text-md font-medium tabular-nums" aria-label={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>{mm}:{ss}</span>
          <button className="btn shrink-0 px-3" onClick={() => { setBlocked(true); say("GUARD", `blocked ${peer.name}; won't be matched again`, "warn"); }} disabled={blocked}>{blocked ? "Blocked" : "Block"}</button>
          <button className="btn shrink-0 px-3" onClick={() => { setReported(true); say("GUARD", `report filed on session demo`, "warn"); }} disabled={reported}>{reported ? "Reported" : "Report"}</button>
        </header>

        {/* Phones: chat-first, with the swap and safety one tab away */}
        <div className="flex shrink-0 border-b border-line md:hidden" role="tablist" aria-label="Session panels">
          {([["chat", "Chat"], ["swap", "Today's swap"], ["safety", "Safety"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`touch-target flex-1 px-2 text-sm ${tab === k ? "text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted"}`}>{l}</button>
          ))}
        </div>
        {tab === "swap" && <div className="scroll min-h-0 flex-1 bg-panel md:hidden" role="tabpanel">{swap}</div>}
        {tab === "safety" && <div className="scroll min-h-0 flex-1 bg-panel md:hidden" role="tabpanel">{safety}</div>}

        <div className={`min-h-0 flex-1 flex-col ${tab === "chat" ? "flex" : "hidden md:flex"}`}>
          <ol className="flex shrink-0 overflow-x-auto border-b border-line text-xs" aria-label="Session steps">
            {PHASES.map((p, i) => (
              <li key={p} aria-current={i === phase ? "step" : undefined} className={`flex flex-1 items-center gap-1.5 whitespace-nowrap border-r border-line px-3 py-2 last:border-r-0 ${i === phase ? "bg-panel-2 text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : i < phase ? "text-muted" : "text-dim"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center border font-mono text-2xs ${i < phase ? "border-success text-success" : i === phase ? "border-text" : "border-line-2"}`}>{i < phase ? "✓" : i + 1}</span>
                <span className={i === phase ? "" : "sr-only sm:not-sr-only"}>{p}</span>
              </li>
            ))}
          </ol>
          <div ref={box} className="scroll grid-bg min-h-0 flex-1 space-y-3 p-4" role="log" aria-live="polite">
            {msgs.map((m) => <Bubble key={m.id} m={m} you={you} peer={peer.name} peerColor={peer.color} />)}
            {sending && <div className="text-xs text-muted"><span className="cursor-blink">▍</span> Checking message…</div>}
            {blocked && <div className="text-center text-xs text-warn">You blocked {peer.name}. Their messages are hidden.</div>}
          </div>
          {ended ? (
            <div className="enter border-t border-line-2 bg-panel p-4">
              <h2 className="mb-2 text-md font-semibold">Session complete. Both maps are updated.</h2>
              <ul className="mb-3 space-y-1.5 text-sm">
                <li className="flex items-center gap-2"><NodeIcon state="explored" mastery={0.5} slug={youStrong} size={16} /> {ctx.aStrong}: deeper understanding · <span className="text-mastery">learned with {peer.name}</span></li>
                <li className="flex items-center gap-2"><NodeIcon state="explored" mastery={0.5} slug={peerStrong} size={16} /> {ctx.bStrong}: deeper understanding</li>
                <li className="flex items-center gap-2"><NodeIcon state="seeded" mastery={0} slug="hbm" size={16} /> Suggested next: <span className="text-text">HBM memory</span> <span className="text-muted">· add it from the map or a connected app</span></li>
              </ul>
              <button className="btn btn-primary" onClick={() => { dispatch({ t: "match", m: null }); dispatch({ t: "fit" }); router.push("/"); }}>See your map</button>
            </div>
          ) : (
            <form className="flex shrink-0 gap-2 border-t border-line bg-panel p-3" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v && !sending) { setText(""); send("me", v); } }}>
              <input className="field h-11 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder={done ? "Session wrapped. End it to update both maps." : "Your turn…"} maxLength={1000} disabled={done} aria-label="Message" />
              {done ? <button type="button" className="btn btn-primary h-11 shrink-0" onClick={end}>End &amp; update maps</button> : <button className="btn btn-primary h-11 shrink-0" disabled={sending}>Send</button>}
            </form>
          )}
        </div>
      </section>

      {/* Right: safety (≥1280px) */}
      <aside className="hidden min-h-0 flex-col border-l border-line bg-panel xl:flex">
        <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">Safety</h2></header>
        {safety}
      </aside>
    </div>
  );
}

function Piece({ label, color, slug, title, demo, nodes }: { label: string; color: string; slug: string; title: string; demo?: boolean; nodes?: Record<string, { state: string; mastery: number }> }) {
  const n = nodes?.[slug];
  return (
    <div className="border-b border-line p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted"><Head color={color} size={14} /> {label} {demo && <Demo>SEED</Demo>}</div>
      <div className="flex items-center gap-3 border border-line bg-bg p-3">
        <NodeIcon state={n?.state ?? "understood"} mastery={n?.mastery ?? 0.8} slug={slug} size={28} />
        <span className="text-md">{title}</span>
      </div>
    </div>
  );
}

function Bubble({ m, you, peer, peerColor }: { m: Msg; you: string; peer: string; peerColor: string }) {
  if (m.who === "system") return <div className="text-center text-xs text-dim">{m.text}</div>;
  const guide = m.who === "facilitator";
  const mine = m.who === "me";
  return (
    <div className={`enter flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] border px-3 py-2 ${guide ? "border-line-2 border-l-2 border-l-text/60 bg-panel" : mine ? "border-line-2 bg-panel-2" : "border-line bg-panel"}`}>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          {guide ? <span className="font-medium text-text">Guide</span> : <span className="flex items-center gap-1.5">{!mine && <Head color={peerColor} size={12} />}{mine ? you : peer}</span>}
          {m.demo && <Demo />}
          {m.guard && (
            m.guard.safe
              ? <span className="text-success" title="Checked for safety" aria-label="Checked for safety"><ShieldIcon /></span>
              : <span className="text-err" title="Flagged by the safety check">Flagged</span>
          )}
        </div>
        <p className="whitespace-pre-line text-base">{m.text}</p>
      </div>
    </div>
  );
}
