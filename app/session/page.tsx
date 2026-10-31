"use client";
// F8 / E6: AI-facilitated jigsaw session. Each person teaches the piece they know.
// Every human message → /api/session/:id/message → Llama Guard → (safe) broadcast.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { CATALOG, seedExplorers } from "@/lib/demo/seed";
import { Demo, Head, NodeIcon } from "@/components/ui/bits";

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
      <div className="grid-bg flex h-full items-center justify-center p-6">
        <div className="w-full max-w-lg border border-line bg-panel">
          <header className="flex h-9 items-center border-b border-line px-3"><h1 className="label">Session</h1></header>
          <div className="space-y-4 p-5">
            <p className="font-sans text-[15px] text-text/90">No session right now.</p>
            <p className="font-sans text-[13.5px] leading-relaxed text-muted">
              Sessions start when someone exploring the same part of the map is a step ahead on a neighbouring concept, and you <em>both</em> accept within 60 seconds. Nothing connects without both of you.
            </p>
            {sessions.length > 0 && (
              <div>
                <h2 className="label mb-2">Past sessions</h2>
                {sessions.map((s) => (
                  <div key={s.at} className="mb-1 border border-line bg-panel-2 p-2 text-[12px]">
                    with {s.peer} · {s.concepts.map((c) => CATALOG[c]?.title ?? c).join(", ")}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Link href="/" className="btn">Back to map</Link>
              <button className="btn btn-ghost" onClick={() => setForced(true)} title="Rehearsal only: opens a session with a seed peer">Rehearse with seed peer</button>
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
    { id: 0, who: "system", text: `Session started · jigsaw · 10 min · both accepted` },
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
      push({ who: "system", text: `Message held by Llama Guard (${d.verdict.category}). It wasn't delivered.` });
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

  return (
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)_300px]">
      {/* Left: the two pieces of the jigsaw */}
      <aside className="hidden min-h-0 flex-col border-r border-line bg-panel lg:flex">
        <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Jigsaw</h2></header>
        <Piece who={you} color="#f26b1d" slug={youStrong} title={ctx.aStrong} nodes={nodes} />
        <div className="flex items-center justify-center gap-2 border-b border-line py-2 text-[10px] tracking-[0.14em] text-dim">↓ BOTH EXPLORING {ctx.shared.toUpperCase()} ↓</div>
        <Piece who={peer.name} color={peer.color} slug={peerStrong} title={ctx.bStrong} demo={peer.demo} />
        <div className="mt-auto border-t border-line p-3 text-[10.5px] leading-relaxed text-dim">
          Facilitator: Muse Spark with the jigsaw prompt. Turns ≤ 40 words, never lectures.
        </div>
      </aside>

      {/* Center: chat */}
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
          <Head color={peer.color} size={18} />
          <span className="text-[12px]">with {peer.name}</span>
          {peer.demo && <Demo title="Seed peer for rehearsal. In the live demo this is a teammate on a second phone.">SEED PEER</Demo>}
          <span className="pixel ml-auto text-[14px] tabular-nums text-signal">{mm}:{ss}</span>
          <button className="btn h-7 px-2 text-[10px]" onClick={() => { setBlocked(true); say("GUARD", `blocked ${peer.name}; won't be matched again`, "warn"); }} disabled={blocked}>{blocked ? "Blocked" : "Block"}</button>
          <button className="btn h-7 px-2 text-[10px]" onClick={() => { setReported(true); say("GUARD", `report filed on session demo`, "warn"); }} disabled={reported}>{reported ? "Reported" : "Report"}</button>
        </header>
        <ol className="flex shrink-0 border-b border-line text-[10px] tracking-[0.12em]" aria-label="Session phases">
          {PHASES.map((p, i) => (
            <li key={p} className={`flex-1 border-r border-line px-2 py-1.5 last:border-r-0 ${i === phase ? "bg-signal-dim text-signal" : i < phase ? "text-text" : "text-dim"}`}>
              {i < phase ? "✓" : `0${i + 1}`} {p.toUpperCase()}
            </li>
          ))}
        </ol>
        <div ref={box} className="scroll grid-bg min-h-0 flex-1 space-y-3 p-4" role="log" aria-live="polite">
          {msgs.map((m) => <Bubble key={m.id} m={m} you={you} peer={peer.name} peerColor={peer.color} />)}
          {sending && <div className="text-[11px] text-muted"><span className="cursor-blink">▍</span> moderating…</div>}
          {blocked && <div className="text-center text-[11px] text-warn">You blocked {peer.name}. Their messages are hidden.</div>}
        </div>
        {ended ? (
          <div className="enter border-t border-signal bg-panel p-4">
            <h2 className="label mb-2 !text-signal">Session complete · maps updated</h2>
            <ul className="mb-3 space-y-1 text-[12px]">
              <li className="flex items-center gap-2"><NodeIcon state="explored" mastery={0.5} slug={youStrong} size={14} /> {ctx.aStrong}: mastery +0.2, <span className="text-diamond">learned with {peer.name}</span></li>
              <li className="flex items-center gap-2"><NodeIcon state="explored" mastery={0.5} slug={peerStrong} size={14} /> {ctx.bStrong}: mastery +0.2</li>
              <li className="flex items-center gap-2"><NodeIcon state="seeded" mastery={0} slug="hbm" size={14} /> Suggested next: <span className="text-diamond">HBM memory</span> <span className="text-dim">· add it from the map, or from any AI assistant via MCP</span></li>
            </ul>
            <button className="btn btn-primary" onClick={() => { dispatch({ t: "match", m: null }); dispatch({ t: "fit" }); router.push("/"); }}>See your map</button>
          </div>
        ) : (
          <form className="flex shrink-0 gap-2 border-t border-line bg-panel p-3" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v && !sending) { setText(""); send("me", v); } }}>
            <input className="field h-10 font-sans text-[14px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={done ? "Session wrapped. End it to update both maps." : "Your turn…"} maxLength={1000} disabled={done} aria-label="Message" />
            {done ? <button type="button" className="btn btn-primary h-10" onClick={end}>End & update maps</button> : <button className="btn btn-primary h-10" disabled={sending}>Send</button>}
          </form>
        )}
      </section>

      {/* Right: safety + system */}
      <aside className="hidden min-h-0 flex-col border-l border-line bg-panel lg:flex">
        <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Safety</h2></header>
        <div className="space-y-3 p-3 text-[11.5px] leading-relaxed text-muted">
          <p><span className="text-ok">●</span> Every message is checked by <span className="text-text">Llama Guard</span> before the other person sees it.</p>
          <p><span className="text-ok">●</span> Block and Report are always one tap away.</p>
          <p><span className="text-ok">●</span> 18+ only for peer matching in the MVP.</p>
          <p><span className="text-ok">●</span> Text chat over Supabase Broadcast. Voice uses the same transcribe button; calls are out of scope.</p>
          <div className="border border-line bg-bg p-2 font-mono text-[10px] text-dim">
            POST /api/session/:id/message<br />→ moderate() · Llama Guard<br />→ broadcast session:{"{id}"}<br />→ facilitator turn (Muse Spark)
          </div>
        </div>
      </aside>
    </div>
  );
}

function Piece({ who, color, slug, title, demo, nodes }: { who: string; color: string; slug: string; title: string; demo?: boolean; nodes?: Record<string, { state: string; mastery: number }> }) {
  const n = nodes?.[slug];
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px]"><Head color={color} size={14} /> {who.toUpperCase()} TEACHES {demo && <Demo>SEED</Demo>}</div>
      <div className="flex items-center gap-3 border border-line bg-bg p-3">
        <NodeIcon state={n?.state ?? "understood"} mastery={n?.mastery ?? 0.8} slug={slug} size={30} />
        <span className="font-sans text-[15px]">{title}</span>
      </div>
    </div>
  );
}

function Bubble({ m, you, peer, peerColor }: { m: Msg; you: string; peer: string; peerColor: string }) {
  if (m.who === "system") return <div className="text-center text-[10.5px] tracking-[0.1em] text-dim">— {m.text} —</div>;
  const fac = m.who === "facilitator";
  const mine = m.who === "me";
  return (
    <div className={`enter flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] border px-3 py-2 ${fac ? "border-signal/50 border-l-2 border-l-signal bg-panel" : mine ? "border-line-2 bg-panel-2" : "border-line bg-panel"}`}>
        <div className="mb-1 flex items-center gap-2 text-[9.5px] tracking-[0.14em] text-muted">
          {fac ? <span className="text-signal">FACILITATOR · MUSE SPARK</span> : <span className="flex items-center gap-1.5">{!mine && <Head color={peerColor} size={11} />}{(mine ? you : peer).toUpperCase()}</span>}
          {m.demo && <Demo />}
          {m.guard && <span className={m.guard.safe ? "text-ok" : "text-err"} title={`${m.guard.engine} · ${m.guard.ms}ms`}>✓ GUARD</span>}
        </div>
        <p className="whitespace-pre-line font-sans text-[14px] leading-relaxed">{m.text}</p>
      </div>
    </div>
  );
}
