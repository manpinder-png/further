"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeomindResponse } from "@/lib/geomind";
import { geomindLayout } from "@/lib/geomind-layout";
import { OperationStatus } from "@/components/activity/ActivityPanel";
import { Head } from "@/components/ui/bits";

export interface GeomindMapProps {
  snapshot: GeomindResponse | null; loading: boolean; error: string | null; selectedId: string | null;
  onSelect: (id: string) => void; onRefresh: () => void; sample: boolean; inviteError?: string | null;
}

export default function GeomindMap({ snapshot, loading, error, selectedId, onSelect, onRefresh, sample, inviteError }: GeomindMapProps) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 700, height: 500 });
  const [list, setList] = useState(false);
  const peers = useMemo(() => geomindLayout(snapshot?.neighbors ?? []), [snapshot]);
  const extent = Math.max(330, ...peers.map(item => item.radius + 95));
  const viewScale = camera.zoom * Math.min(1, Math.max(160, Math.min(size.width - 170, size.height - 130)) / (extent * 2));
  const topics = useMemo(() => {
    const result = new Map<string, { title: string; x: number; y: number }>();
    for (const item of peers) if (item.topic && !result.has(item.topic.slug)) result.set(item.topic.slug, { title: item.topic.title, x: Math.cos(item.bearing) * (item.radius + 112), y: Math.sin(item.bearing) * (item.radius + 112) });
    return [...result.entries()];
  }, [peers]);
  const zoom = (factor: number) => setCamera(value => ({ ...value, zoom: Math.max(.25, Math.min(2.4, value.zoom * factor)) }));
  const fit = () => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  };
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setSize({ width: rect.width, height: rect.height }); });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault(); setCamera(value => ({ ...value, zoom: Math.max(.25, Math.min(2.4, value.zoom * Math.exp(-event.deltaY * .0015))) }));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);
  const reason = snapshot?.emptyReason;
  const hasPeers = peers.length > 0 && !sample && !error;
  return <div className="absolute inset-0 overflow-hidden bg-[#10191d]" aria-label="Geomind community map">
    <div className="absolute inset-x-0 top-28 z-10 mx-4 flex items-start justify-between gap-3 sm:mx-6">
      <div className="rounded-xl border border-white/10 bg-panel/95 px-4 py-3 shadow-lg backdrop-blur"><h2 className="text-base font-medium">Your idea neighborhood</h2><p className="mt-1 text-xs text-muted">People close to what you’re exploring.</p></div>
      <button className="btn shrink-0 bg-panel/95" onClick={onRefresh} disabled={loading}>{loading ? "Checking…" : "Refresh"}</button>
    </div>
    <div ref={frame} className="absolute inset-x-0 bottom-16 top-48 touch-none outline-none" tabIndex={0} role="region" aria-label="Conceptual map. Drag to pan, use plus and minus to zoom, or open the people list."
      onKeyDown={event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); setCamera(value => ({ ...value, x: value.x + (event.key === "ArrowLeft" ? 45 : event.key === "ArrowRight" ? -45 : 0), y: value.y + (event.key === "ArrowUp" ? 45 : event.key === "ArrowDown" ? -45 : 0) })); }
        else if (event.key === "+" || event.key === "=") zoom(1.25); else if (event.key === "-") zoom(.8);
      }}
      onPointerDown={event => { if ((event.target as HTMLElement).closest("button,a,input")) return; drag.current = { x: event.clientX, y: event.clientY, ox: camera.x, oy: camera.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const point = drag.current; if (point) setCamera(value => ({ ...value, x: point.ox + event.clientX - point.x, y: point.oy + event.clientY - point.y })); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${viewScale})` }}>
        <svg className="pointer-events-none absolute max-w-none" style={{ left: -1000, top: -800 }} width="2000" height="1600" viewBox="-1000 -800 2000 1600" aria-hidden>
          <defs><pattern id="geomind-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#8ac4c9" strokeOpacity=".045" /></pattern><radialGradient id="geomind-land"><stop stopColor="#28483e" stopOpacity=".7" /><stop offset="1" stopColor="#28483e" stopOpacity="0" /></radialGradient></defs>
          <rect x="-1000" y="-800" width="2000" height="1600" fill="url(#geomind-grid)" />
          <path d="M-900 300 Q-540 50 -500-240 T80-420 T600-120 T1000 40" stroke="#65b8c1" strokeOpacity=".06" strokeWidth="85" fill="none" />
          {[185, 310, 460, 630].map(radius => <circle key={radius} r={radius} fill="none" stroke="#8dd8ca" strokeOpacity=".09" strokeDasharray={radius === 185 ? undefined : "3 9"} />)}
          {topics.map(([slug, topic]) => <g key={slug}><ellipse cx={topic.x * .78} cy={topic.y * .78} rx="220" ry="150" fill="url(#geomind-land)" /><text x={topic.x} y={topic.y} textAnchor="middle" fill="#9ebbb5" fontSize={11 / viewScale} letterSpacing={.5 / viewScale}>{topic.title}</text></g>)}
          {peers.filter(item => item.peer.id === selectedId).map(item => <path key={item.peer.id} d={`M0 0 Q${item.x * .4} ${item.y * .8} ${item.x} ${item.y}`} stroke="#f59654" strokeWidth="2" strokeDasharray="5 6" opacity=".65" fill="none" />)}
        </svg>
        <div style={{ transform: `scale(${1 / viewScale})` }} className="absolute -left-8 -top-8 flex h-16 w-16 flex-col items-center justify-center rounded-full border border-accent/70 bg-panel shadow-[0_0_0_12px_#ed965514,0_0_45px_#ed965525]"><span className="text-sm font-semibold">You</span><span className="mt-0.5 text-[9px] text-muted">Here in ideas</span></div>
        {hasPeers && peers.map(({ peer, x, y }) => <button key={peer.id} style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${1 / viewScale})` }} onClick={() => onSelect(peer.id)} className={`group absolute flex w-32 flex-col items-center rounded-xl px-2 py-2 outline-offset-4 ${selectedId === peer.id ? "z-20" : "z-10"}`} aria-pressed={selectedId === peer.id} aria-label={`${peer.name}, available now, ${peer.sharedTopics[0]?.title ?? "related ideas"}`}>
          <span className={`relative rounded-full border-[3px] bg-panel p-1 shadow-[0_7px_20px_#0008] transition-transform group-hover:scale-110 ${selectedId === peer.id ? "border-accent" : "border-[#386f70]"}`}><Head name={peer.name} color={selectedId === peer.id ? "#f59654" : "#63c4bc"} size={38} /><span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-panel bg-success" /></span>
          <span className={`mt-2 max-w-full truncate rounded-full border px-2.5 py-1 text-xs shadow-lg ${selectedId === peer.id ? "border-accent/40 bg-panel text-text" : "border-white/10 bg-panel/95 text-text/85"}`}>{peer.name}</span>
          {selectedId === peer.id && <span className="mt-1 rounded-md bg-panel/95 px-2 py-1 text-[10px] text-muted">{peer.commonMinutes} min to learn together</span>}
        </button>)}
      </div>
    </div>
    <div className="absolute bottom-20 right-4 z-20 flex flex-col overflow-hidden rounded-xl border border-line-2 bg-panel/95 shadow-xl"><button className="h-11 w-11 text-xl hover:bg-panel-2" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button><button className="h-11 w-11 border-t border-line text-xl hover:bg-panel-2" onClick={() => zoom(.8)} aria-label="Zoom out">−</button><button className="h-11 w-11 border-t border-line text-xs hover:bg-panel-2" onClick={fit} aria-label="Fit community map">Fit</button><button className="h-11 w-11 border-t border-line text-lg hover:bg-panel-2" onClick={() => setCamera(value => ({ ...value, x: 0, y: 0 }))} aria-label="Centre on me">◎</button></div>
    {(!hasPeers || inviteError) && <div className="absolute inset-x-4 top-52 z-20 mx-auto max-w-sm">
      {inviteError && <p className="mb-3 rounded-xl border border-err/40 bg-panel p-4 text-sm text-err" role="alert">{inviteError}</p>}
      {sample ? <Empty title="Meet people through your own map" detail="Sign in to discover learners who have chosen to be available." /> : loading && !snapshot ? <div className="rounded-xl bg-panel/95 p-4"><OperationStatus label="Peer guide · Finding nearby ideas" detail="Checking your searchable topics and who is available to learn." /></div> : error ? <Empty title="Couldn’t load your neighborhood" detail={error} refresh={onRefresh} /> : !hasPeers ? <Empty title={emptyTitle(reason)} detail={emptyDetail(reason)} profile={reason === "discovery-off" || reason === "adult-confirmation-needed"} refresh={reason === "indexing" || reason === "index-unavailable" || reason === "no-neighbors" ? onRefresh : undefined} /> : null}
    </div>}
    {list && hasPeers && <div className="absolute bottom-20 left-4 z-30 max-h-[45%] w-64 overflow-y-auto rounded-xl border border-line-2 bg-panel/95 p-2 shadow-xl" aria-label="Nearby people list">{snapshot?.neighbors.map(peer => <button key={peer.id} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-panel-2 ${selectedId === peer.id ? "bg-mastery-soft" : ""}`} onClick={() => onSelect(peer.id)}><Head name={peer.name} color="#63c4bc" size={28} /><span className="min-w-0"><span className="block truncate text-sm">{peer.name}</span><span className="block truncate text-[10px] text-muted">{peer.sharedTopics[0]?.title} · {peer.commonMinutes} min</span></span></button>)}</div>}
    <div className="absolute inset-x-0 bottom-0 z-20 flex h-16 items-center justify-between gap-3 border-t border-white/10 bg-panel/90 px-4 backdrop-blur"><button className="btn btn-ghost shrink-0 text-xs" onClick={() => setList(value => !value)} aria-expanded={list}>{list ? "Hide people" : `People nearby${hasPeers ? ` · ${peers.length}` : ""}`}</button><p className="max-w-xs text-right text-[10px] leading-relaxed text-muted">Closer to you means more similar ideas.<br />Illustrative layout · physical location is off.</p></div>
  </div>;
}

function Empty({ title, detail, profile, refresh }: { title: string; detail: string; profile?: boolean; refresh?: () => void }) {
  return <section className="rounded-xl border border-line-2 bg-panel/95 p-5 text-center shadow-xl backdrop-blur"><h2 className="text-lg font-medium">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted">{detail}</p>{profile && <Link className="btn mt-5" href="/profile">Choose your availability</Link>}{refresh && <button className="btn mt-5" onClick={refresh}>Check again</button>}</section>;
}
function emptyTitle(reason?: GeomindResponse["emptyReason"]) {
  if (reason === "discovery-off") return "Choose when to be discoverable";
  if (reason === "adult-confirmation-needed") return "Complete your profile to meet peers";
  if (reason === "no-topics") return "Your ideas are the starting point";
  if (reason === "indexing") return "Your ideas are finding their place";
  if (reason === "index-unavailable") return "Your idea map isn’t searchable yet";
  return "No one nearby in ideas right now";
}
function emptyDetail(reason?: GeomindResponse["emptyReason"]) {
  if (reason === "discovery-off") return "Choose to be available in your profile to meet people around your learning topics.";
  if (reason === "adult-confirmation-needed") return "Confirm you’re an adult and choose to be available before meeting other learners.";
  if (reason === "no-topics") return "Explore a question below. Your saved ideas become the starting point for discovery.";
  if (reason === "indexing") return "Your learning is saved. Related ideas will appear when the local search index catches up.";
  if (reason === "index-unavailable") return "Your learning is safe. Local semantic search needs to reconnect before we can find related people.";
  return "This neighborhood shows willing learners available now. Keep exploring, or check again when someone is here.";
}
