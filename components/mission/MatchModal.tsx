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

// Screen-reader announcements at these marks, not every second.
const MARKS = [60, 45, 30, 15, 10, 5];

export default function MatchModal() {
  const { match, dispatch, say } = useStore();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [left, setLeft] = useState(HANDSHAKE_MS);
  const [announce, setAnnounce] = useState("");

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

  if (!match || match.status === "accepted") return null;
  const title = (s: string) => CATALOG[s]?.title ?? s;
  const secs = Math.max(0, Math.ceil(left / 1000));
  const frac = reduced ? 1 : Math.max(0, left / HANDSHAKE_MS);
  const R = 26, C = 2 * Math.PI * R;

  const accept = async () => {
    await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: match.id, decision: "accept" }) });
    dispatch({ t: "match", m: { ...match, status: "waiting" } });
    say("MATCH", `you accepted · waiting for ${match.peer.name}`);
    // DEMO: the sample peer accepts after a beat. Live: Supabase update on match_requests.
    setTimeout(() => {
      say("MATCH", `${match.peer.name} accepted · both in → session`, "ok", match.peer.demo);
      dispatch({ t: "note", text: `Matched with ${match.peer.name} on ${title(match.concept)}` });
      dispatch({ t: "match", m: { ...match, status: "accepted" } });
      router.push(`/session?m=${match.id}`);
    }, 1800);
  };
  const decline = () => {
    fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: match.id, decision: "decline" }) });
    say("MATCH", `declined ${match.peer.name} · won't re-match for 24h`, "warn");
    dispatch({ t: "match", m: null });
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
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Head color="#f26b1d" size={14} /> You teach</div>
            <div className="text-sm">{title(match.youStrong)}</div>
          </div>
          <div className="p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Head color={match.peer.color} size={14} /> {match.peer.name} teaches</div>
            <div className="text-sm">{title(match.peerStrong)}</div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-line p-3">
          {match.status === "waiting" ? (
            <div className="scanbar flex min-h-11 flex-1 items-center justify-center border border-line text-sm text-muted" aria-live="polite">Waiting for {match.peer.name}…</div>
          ) : (
            <>
              <button className="btn px-4 sm:flex-1" onClick={decline}>Not now</button>
              <button className="btn btn-primary flex-1 whitespace-nowrap px-3" onClick={accept} autoFocus>Learn together · 10 min</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
