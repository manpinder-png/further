"use client";
// F7 / E5: two-way handshake. Both must accept within 60s or it expires. Nothing
// connects without both. The reason always names a concept.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { CATALOG } from "@/lib/demo/seed";
import { HANDSHAKE_MS } from "@/lib/matching";
import { Demo, Head } from "@/components/ui/bits";

export default function MatchModal() {
  const { match, dispatch, say, profile } = useStore();
  const router = useRouter();
  const [left, setLeft] = useState(HANDSHAKE_MS);

  useEffect(() => {
    if (!match || match.status === "accepted") return;
    const iv = setInterval(() => {
      const l = match.expiresAt - Date.now();
      setLeft(l);
      if (l <= 0) {
        say("MATCH", `request to ${match.peer.name} expired (60s)`, "warn");
        dispatch({ t: "match", m: null });
      }
    }, 200);
    return () => clearInterval(iv);
  }, [match, dispatch, say]);

  if (!match || match.status === "accepted") return null;
  const title = (s: string) => CATALOG[s]?.title ?? s;
  const frac = Math.max(0, left / HANDSHAKE_MS);
  const R = 26, C = 2 * Math.PI * R;

  const accept = async () => {
    await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: match.id, decision: "accept" }) });
    dispatch({ t: "match", m: { ...match, status: "waiting" } });
    say("MATCH", `you accepted · waiting for ${match.peer.name}`);
    // DEMO: the seed peer accepts after a beat. Live: Supabase update on match_requests.
    setTimeout(() => {
      say("MATCH", `${match.peer.name} accepted · both in → session`, "ok", match.peer.demo);
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
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-3 sm:items-center" role="dialog" aria-modal aria-labelledby="match-title">
      <div className="enter w-full max-w-md border border-signal bg-panel shadow-[0_0_0_1px_#000,0_20px_80px_-20px_rgba(242,107,29,.5)]">
        <header className="flex h-9 items-center justify-between border-b border-line px-3">
          <h2 className="label !text-signal">Incoming match</h2>
          <span className="flex items-center gap-2">
            {match.peer.demo && <Demo title="Seed explorer standing in for a teammate's phone. Never presented as a stranger.">SEED PEER</Demo>}
            <span className="text-[10px] tabular-nums text-muted">score {match.score.toFixed(2)}</span>
          </span>
        </header>
        <div className="flex items-center gap-4 p-4">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" stroke="#2a1a10" strokeWidth="4" />
              <circle cx="32" cy="32" r={R} fill="none" stroke="#f26b1d" strokeWidth="4" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="butt" />
            </svg>
            <span className="pixel absolute inset-0 flex items-center justify-center text-[16px] tabular-nums" aria-label={`${Math.ceil(left / 1000)} seconds left`}>{Math.max(0, Math.ceil(left / 1000))}</span>
          </div>
          <div className="min-w-0">
            <p id="match-title" className="font-sans text-[16px] leading-snug">{match.reason}</p>
            <p className="mt-1 font-sans text-[13px] text-muted">Learn together?</p>
          </div>
        </div>
        <div className="mx-4 mb-4 grid grid-cols-2 border border-line text-[11px]">
          <div className="border-r border-line p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-muted"><Head color="#f26b1d" size={14} /> {profile.displayName.toUpperCase()} TEACHES</div>
            <div className="font-sans text-[13px]">{title(match.youStrong)}</div>
          </div>
          <div className="p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-muted"><Head color={match.peer.color} size={14} /> {match.peer.name.toUpperCase()} TEACHES</div>
            <div className="font-sans text-[13px]">{title(match.peerStrong)}</div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-line p-3">
          {match.status === "waiting" ? (
            <div className="scanbar flex h-[34px] flex-1 items-center justify-center border border-line text-[11px] tracking-[0.12em] text-muted">WAITING FOR {match.peer.name.toUpperCase()}…</div>
          ) : (
            <>
              <button className="btn flex-1" onClick={decline}>Not now</button>
              <button className="btn btn-primary flex-1" onClick={accept} autoFocus>Accept · jigsaw 10 min</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
