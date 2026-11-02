"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { getRoom, liveFetch } from "@/lib/client/live";
import type { RoomMessage, RoomSnapshot } from "@/domains/ui/contracts";
import { mutationKey } from "@/domains/ui/contracts";
import { Head, NodeIcon, ShieldIcon } from "@/components/ui/bits";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";

export default function SessionPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-muted">Opening your session…</p>}><Session /></Suspense>;
}

function Session() {
  const { match, profile, ready, currentSessionId, dataMode, auth, authReady } = useStore();
  const params = useSearchParams();
  const id = params.get("s") ?? match?.sessionId ?? currentSessionId;
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready || !id || dataMode !== "local" || (!auth?.authenticated && !auth?.localProfilesEnabled)) return;
    let alive = true;
    setRoom(null); setError(null);
    getRoom(id).then((snapshot) => { if (alive) setRoom(snapshot); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, ready, dataMode, attempt, auth]);
  if (authReady && !auth?.authenticated && !auth?.localProfilesEnabled) return <section className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Sign in to your conversation</h1><p className="mt-3 text-muted">Your conversations are private to their participants.</p><Link href="/login" className="btn btn-primary mt-5">Sign in</Link></section>;
  if (!ready) return <div className="p-6"><OperationStatus label="Loading your learning profile" detail="Checking your browser identity and reading saved local data." /></div>;
  if (id && dataMode === "local" && !error && !room) return <div className="p-6"><OperationStatus label="Opening the shared conversation" detail="Checking room membership and restoring saved messages. This is a database read." /></div>;
  if (room) return <Room key={room.id} initial={room} you={profile.displayName} />;
  return (
    <div className="grid-bg scroll flex h-full items-center justify-center p-4 sm:p-6">
      <section className="w-full max-w-lg rounded-xl border border-line bg-panel p-5">
        <h1 className="text-xl font-semibold">{error ? "Couldn't open this session" : "Learn with someone"}</h1>
        <p className="mt-3 text-sm text-muted" role={error ? "alert" : undefined}>{error ?? (dataMode === "demo" ? "The sample map is for exploring the interface. Return to saved local data to start a real conversation between two learners." : "A session begins when two people accept the same match. Find a learning partner from your map, then come here to compare ideas.")}</p>
        <div className="mt-4 flex gap-2"><Link href="/" className="btn">Back to map</Link>{error && <button className="btn btn-primary" onClick={() => setAttempt((v) => v + 1)}>Try again</button>}</div>
      </section>
    </div>
  );
}

function Room({ initial, you }: { initial: RoomSnapshot; you: string }) {
  const { say, dispatch, nodes, concepts, refreshSnapshot } = useStore();
  const router = useRouter();
  const [room, setRoom] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { activity, run: stream, cancel } = useAIStream();
  const [tab, setTab] = useState<"chat" | "swap" | "safety">("chat");
  const box = useRef<HTMLDivElement>(null);
  const pendingSend = useRef<{ text: string; key: string } | null>(null);
  const finishKey = useRef(mutationKey());
  const endedSynced = useRef(false);
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);
  const title = useCallback((slug: string) => concepts[slug]?.title ?? slug.replace(/-/g, " "), [concepts]);
  const ended = Boolean(room.endedAt);
  const blocked = Boolean(room.blocked);
  const messages = useMemo(() => room.messages.filter((m) => !blocked || m.who !== "peer"), [room.messages, blocked]);

  const sync = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const next = await getRoom(initial.id);
    if (sequence >= appliedSequence.current) { appliedSequence.current = sequence; setRoom(next); setSyncError(null); }
    return next;
  }, [initial.id]);
  useEffect(() => {
    let alive = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const sequence = ++requestSequence.current;
      try {
        const next = await getRoom(initial.id);
        if (alive && sequence >= appliedSequence.current) { appliedSequence.current = sequence; setRoom(next); setSyncError(null); }
      } catch { if (alive) setSyncError("Connection interrupted. Retrying without replacing your conversation."); }
      finally { pending = false; }
    };
    const timer = setInterval(refresh, 1800);
    return () => { alive = false; clearInterval(timer); };
  }, [initial.id]);
  useEffect(() => {
    if (ended && !endedSynced.current) {
      endedSynced.current = true;
      void refreshSnapshot().catch(() => setError("The session is saved, but your map hasn't refreshed yet."));
    }
  }, [ended, refreshSnapshot]);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || ended || blocked) return;
    const pending = pendingSend.current?.text === body ? pendingSend.current : { text: body, key: mutationKey() };
    pendingSend.current = pending;
    setSending(true); setError(null); setNotice(null);
    try {
      const result = await stream<RoomSnapshot & { delivered?: boolean; facilitatorError?: string }>(`/api/session/${encodeURIComponent(room.id)}/message`, {
        method: "POST", headers: { "idempotency-key": pending.key },
        body: JSON.stringify({
          from: "me", text: body, idempotencyKey: pending.key,
          turn: messages.filter((m) => m.who === "me" || m.who === "peer").length,
          ctx: { a: you, aStrong: title(room.youStrong), b: room.peer.name, bStrong: title(room.peerStrong), shared: title(room.shared) },
          history: messages.filter((m) => m.who !== "system").slice(-30).map((m) => ({ role: m.who === "facilitator" ? "assistant" : "user", content: m.text })),
        }),
      });
      if (result.delivered === false) throw new Error("This message wasn't delivered. Review it before trying again.");
      if (typeof result.facilitatorError === "string") setNotice(result.facilitatorError);
      setText(""); pendingSend.current = null;
      say("SYSTEM", "Message saved to the shared conversation", "ok");
      await sync();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") setNotice("Stopped waiting for the guide. Your message may already be saved; the conversation will refresh automatically.");
      else setError(e instanceof Error ? e.message : "Your message couldn't be sent.");
    }
    finally { setSending(false); }
  };
  const finish = async () => {
    setEnding(true); setError(null);
    try {
      const res = await liveFetch(`/api/session/${encodeURIComponent(room.id)}/end`, {
        method: "POST", headers: { "idempotency-key": finishKey.current },
        body: JSON.stringify({ concepts: [...new Set([room.youStrong, room.peerStrong])], summary: ["Learning session completed"], idempotencyKey: finishKey.current }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "The session couldn't be completed yet.");
      // Completion records progress once on the server. Never track it again here.
      await sync(); await refreshSnapshot();
      say("FACILITATE", "Session completion saved for both participants", "ok");
    } catch (e) { setError(e instanceof Error ? e.message : "The session couldn't be completed yet."); }
    finally { setEnding(false); }
  };
  const act = async (action: "block" | "report") => {
    setError(null); setBlocking(true);
    try {
      const res = await liveFetch(`/api/local/sessions/${encodeURIComponent(room.id)}/${action}`, { method: "POST", body: JSON.stringify({ reason: action === "report" ? reportReason.trim() || "Please review this interaction" : undefined }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? `Couldn't save this ${action}.`);
      if (action === "block") { appliedSequence.current = ++requestSequence.current; setRoom((r) => ({ ...r, blocked: true })); dispatch({ t: "match", m: null }); }
      else { setReported(true); setReportOpen(false); }
      await refreshSnapshot();
    } catch (e) { setError(e instanceof Error ? e.message : `Couldn't save this ${action}.`); }
    finally { setBlocking(false); }
  };

  const swap = <><Piece label="You bring" color="#f26b1d" slug={room.youStrong} title={title(room.youStrong)} nodes={nodes} /><Piece label={`${room.peer.name} brings`} color={room.peer.color} slug={room.peerStrong} title={title(room.peerStrong)} /><p className="border-b border-line px-4 py-3 text-sm text-muted">Exploring <span className="text-text">{title(room.shared)}</span> together.</p></>;
  const safety = <ul className="space-y-3 p-4 text-sm text-muted"><li className="flex gap-2"><ShieldIcon size={16} /><span>You can leave, block or report at any time.</span></li><li>Blocking is saved and stops further interaction with this person.</li><li>Reports are saved on this Mac for review; they are not sent to an outside moderation team.</li><li>The guide helps you discuss and compare ideas. Its replies can be mistaken.</li></ul>;
  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
      <aside className="hidden min-h-0 flex-col border-r border-line bg-panel md:flex"><header className="border-b border-line px-4 py-3"><h2 className="label">Today&apos;s exchange</h2></header>{swap}<div className="scroll min-h-0 flex-1 xl:hidden">{safety}</div></aside>
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <Head color={room.peer.color} size={20} /><h1 className="min-w-0 flex-1 truncate text-sm font-medium">with {room.peer.name}</h1>
          <button className="btn px-3 text-xs" onClick={() => void act("block")} disabled={blocked || blocking}>{blocked ? "Blocked" : "Block"}</button>
          <button className="btn px-3 text-xs" onClick={() => setReportOpen((v) => !v)} disabled={reported || blocking}>{reported ? "Report saved" : "Report"}</button>
          {!ended && !blocked && <button className="btn px-3 text-xs" onClick={() => void finish()} disabled={ending}>{ending ? "Saving…" : "Finish session"}</button>}
        </header>
        {reportOpen && <form className="space-y-2 border-b border-line bg-panel p-3" onSubmit={(e) => { e.preventDefault(); void act("report"); }}><label className="block text-sm text-muted" htmlFor="report-reason">What happened?</label><textarea id="report-reason" className="field" value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={2000} /><button className="btn" disabled={blocking}>Save report</button></form>}
        <div className="flex shrink-0 border-b border-line md:hidden" role="tablist" aria-label="Session panels">{([['chat','Chat'],['swap',"Today's exchange"],['safety','Safety']] as const).map(([key,label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`touch-target flex-1 px-2 text-sm ${tab === key ? "text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted"}`}>{label}</button>)}</div>
        {tab === "swap" && <div className="scroll min-h-0 flex-1 md:hidden" role="tabpanel">{swap}</div>}
        {tab === "safety" && <div className="scroll min-h-0 flex-1 md:hidden" role="tabpanel">{safety}</div>}
        <div className={`min-h-0 flex-1 flex-col ${tab === "chat" ? "flex" : "hidden md:flex"}`}>
          {syncError && <p className="border-b border-line px-4 py-2 text-xs text-warn" role="status">{syncError}</p>}
          {notice && <p className="border-b border-line bg-panel px-4 py-2 text-sm text-muted" role="status">{notice}</p>}
          <div ref={box} className="scroll grid-bg min-h-0 flex-1 space-y-3 p-4" role="log" aria-live="polite">
            {!messages.length && <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">You&apos;re in the same room. Start with what you already know about {title(room.shared)}, then ask your partner about their piece.</p>}
            {messages.map((message) => <Bubble key={message.id} message={message} you={you} peer={room.peer.name} color={room.peer.color} />)}
            <ActivityPanel activity={activity} title="Message and learning guide" onCancel={cancel} onRetry={() => void send()} />
            {ending && <OperationStatus label="Finishing your session" detail="Saving the shared outcome and refreshing both participants' learning records." />}
            {blocking && <OperationStatus label="Saving your safety choice" detail="Waiting for local confirmation. Reports remain on this Mac for review." />}
          </div>
          {error && <p className="border-t border-err/40 bg-panel px-4 py-2 text-sm text-err" role="alert">{error}</p>}
          {ended || blocked ? <div className="border-t border-line bg-panel p-4"><h2 className="font-semibold">{blocked ? "This interaction is blocked." : "Your session is saved."}</h2><p className="mt-1 text-sm text-muted">{blocked ? "You won't receive further messages from this person." : "Your learning history now includes this conversation."}</p>{room.summary && <ul className="mt-2 space-y-1 text-sm text-muted">{room.summary.map((line) => <li key={line}>{line}</li>)}</ul>}<button className="btn btn-primary mt-3" onClick={() => { dispatch({ t: "match", m: null }); router.push("/"); }}>Return to learning</button></div> : <form className="flex shrink-0 gap-2 border-t border-line bg-panel p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}><input className="field h-11 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Share your idea or ask a question…" maxLength={1000} disabled={sending} aria-label="Message" /><button className="btn btn-primary h-11 shrink-0" disabled={sending || !text.trim()}>Send</button></form>}
        </div>
      </section>
      <aside className="hidden min-h-0 flex-col border-l border-line bg-panel xl:flex"><header className="border-b border-line px-4 py-3"><h2 className="label">Your choices</h2></header>{safety}</aside>
    </div>
  );
}

function Piece({ label, color, slug, title, nodes }: { label: string; color: string; slug: string; title: string; nodes?: Record<string, { state: string; mastery: number }> }) {
  const node = nodes?.[slug];
  return <div className="border-b border-line p-4"><div className="mb-2 flex items-center gap-2 text-xs text-muted"><Head color={color} size={14} />{label}</div><div className="flex items-center gap-3 rounded-lg border border-line bg-bg p-3"><NodeIcon state={node?.state ?? "explored"} mastery={node?.mastery ?? 0.4} slug={slug} size={28} /><span className="text-sm">{title}</span></div></div>;
}
function Bubble({ message, you, peer, color }: { message: RoomMessage; you: string; peer: string; color: string }) {
  if (message.who === "system") return <p className="text-center text-xs text-muted">{message.text}</p>;
  const mine = message.who === "me", guide = message.who === "facilitator";
  return <div className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-lg border px-3 py-2 sm:max-w-[85%] ${guide ? "border-line-2 border-l-mastery bg-panel" : mine ? "border-line-2 bg-panel-2" : "border-line bg-panel"}`}><div className="mb-1 flex items-center gap-2 text-xs text-muted">{guide ? <span className="font-medium text-text">Learning guide</span> : <span className="flex items-center gap-1.5">{!mine && <Head color={color} size={12} />}{mine ? you : peer}</span>}{message.demo && <span className="text-warn">Rehearsal response</span>}</div><p className="whitespace-pre-line break-words text-base">{message.text}</p></div></div>;
}
