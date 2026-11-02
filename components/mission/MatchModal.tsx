"use client";
// F7 / E5: two-way handshake. Both must accept within 60s or it expires. Nothing
// connects without both. The reason always names a concept.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { CATALOG } from "@/lib/demo/seed";
import { HANDSHAKE_MS } from "@/lib/matching";
import { Demo, Head, useReducedMotion } from "@/components/ui/bits";
import { BUILDER_VIEW } from "@/lib/builder";
import { liveFetch } from "@/lib/client/live";
import { OperationStatus } from "@/components/activity/ActivityPanel";

// Screen-reader announcements at these marks, not every second.
const MARKS = [60, 45, 30, 15, 10, 5];

export default function MatchModal() {
  const { match, dispatch, say, concepts } = useStore();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [left, setLeft] = useState(HANDSHAKE_MS);
  const [announce, setAnnounce] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match || match.status === "accepted") return;
    let lastMark = Infinity;
    const iv = setInterval(() => {
      const l = match.expiresAt - Date.now();
      setLeft(l);
      const secs = Math.max(0, Math.ceil(l / 1000));
      if (secs !== lastMark && (lastMark === Infinity || MARKS.includes(secs))) { lastMark = secs; setAnnounce(`Expires in ${secs} seconds`); }
      if (l <= 0) {
        say("MATCH", `request to ${match.peer.name} expired (60s)`, "warn");
        dispatch({ t: "match", m: null });
      }
    }, 200);
    return () => clearInterval(iv);
  }, [match, dispatch, say]);

  // Live (Connor): poll the durable request while waiting for the other person.
  useEffect(() => {
    if (!match || match.peer.demo || !["pending", "waiting"].includes(match.status)) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await liveFetch(`/api/match?requestId=${encodeURIComponent(match.id)}`);
        const d = await r.json();
        if (!alive || !r.ok) return;
        if (d.status === "accepted") {
          say("MATCH", `${match.peer.name} accepted · both in → session`, "ok");
          dispatch({ t: "note", text: `Matched with ${match.peer.name} on ${CATALOG[match.concept]?.title ?? match.concept}` });
          dispatch({ t: "match", m: { ...match, status: "accepted", sessionId: d.sessionId ?? undefined } });
          router.push(`/session?m=${match.id}${d.sessionId ? `&s=${d.sessionId}` : ""}`);
        } else if (d.status === "declined" || d.status === "expired") {
          say("MATCH", `request to ${match.peer.name} ${d.status}`, "warn");
          dispatch({ t: "match", m: null });
        }
      } catch { /* retries; the countdown keeps running */ }
    };
    void check();
    const iv = setInterval(check, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [match, dispatch, router, say]);

  if (!match || match.status === "accepted" || match.peer.demo) return null;
  const title = (s: string) => concepts[s]?.title ?? CATALOG[s]?.title ?? s;
  const secs = Math.max(0, Math.ceil(left / 1000));
  const frac = reduced ? 1 : Math.max(0, left / HANDSHAKE_MS);
  const R = 26, C = 2 * Math.PI * R;

  const answer = async (decision: "accept" | "decline") => {
    setBusy(true); setError(null);
    try {
      const response = await liveFetch("/api/match", { method: "POST", body: JSON.stringify({ requestId: match.id, decision }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Couldn't save your answer.");
      if (decision === "decline" || ["declined", "expired"].includes(result.status)) {
        dispatch({ t: "match", m: null });
        return;
      }
      const sessionId = result.sessionId ?? result.session_id;
      if (result.status === "accepted" && sessionId) {
        dispatch({ t: "note", text: `Matched with ${match.peer.name} on ${title(match.concept)}` });
        dispatch({ t: "match", m: { ...match, status: "accepted", sessionId } });
        router.push(`/session?s=${encodeURIComponent(sessionId)}`);
        return;
      }
      dispatch({ t: "match", m: { ...match, status: "waiting" } });
      say("MATCH", `You accepted. Waiting for ${match.peer.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save your answer."); }
    finally { setBusy(false); }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal aria-labelledby="match-title" aria-describedby="match-desc">
      <div className="enter w-full max-w-md border border-line-2 bg-panel shadow-[0_20px_80px_-20px_rgba(0,0,0,.9)]">
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <h2 className="label">Someone to learn with</h2>
          {BUILDER_VIEW && (
            <span className="flex items-center gap-2">
              {match.peer.demo && <Demo title="Seed explorer standing in for a teammate's phone.">SEED PEER</Demo>}
              <span className="font-mono text-2xs tabular-nums text-muted">score {match.score.toFixed(2)}</span>
            </span>
          )}
        </header>
        <div className="flex items-center gap-4 p-4">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" stroke="#2a2a30" strokeWidth="4" />
              <circle cx="32" cy="32" r={R} fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="butt" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-medium tabular-nums" aria-hidden>{secs}</span>
            <span className="sr-only" aria-live="polite">{announce}</span>
          </div>
          <div className="min-w-0">
            <p id="match-title" className="text-md leading-snug">{match.reason}</p>
            <p id="match-desc" className="mt-1 text-sm text-muted">Learn together for 10 minutes? You both have to say yes.</p>
          </div>
        </div>
        <div className="mx-4 mb-4 grid grid-cols-2 border border-line">
          <div className="border-r border-line p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Head color="#f26b1d" size={14} /> Your starting point</div>
            <div className="text-sm">{title(match.youStrong)}</div>
          </div>
          <div className="p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Head color={match.peer.color} size={14} /> {match.peer.name}’s starting point</div>
            <div className="text-sm">{title(match.peerStrong)}</div>
          </div>
        </div>
        {error && <p className="px-4 pb-3 text-sm text-err" role="alert">{error}</p>}
        {busy && <div className="px-4 pb-3"><OperationStatus label="Saving your answer" detail="Waiting for the local matching service to confirm your choice." /></div>}
        <div className="flex gap-2 border-t border-line p-3">
          {match.status === "waiting" ? (
            <><div className="flex-1"><OperationStatus label={`Waiting for ${match.peer.name}`} detail="Your acceptance is saved. The conversation opens only when they also accept; you can cancel this invitation." /></div><button className="btn" disabled={busy} onClick={() => void answer("decline")}>Cancel</button></>
          ) : (
            <>
              <button className="btn px-4 sm:flex-1" disabled={busy} onClick={() => void answer("decline")}>Not now</button>
              <button className="btn btn-primary flex-1 whitespace-nowrap px-3" disabled={busy} onClick={() => void answer("accept")} autoFocus>{busy ? "Saving…" : "Learn together · 10 min"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
