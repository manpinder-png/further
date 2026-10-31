"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type Mission } from "./store";
import type { ExpansionLine, MatchRequest } from "../types";
import { placeNear } from "../layout";
import { CATALOG } from "../demo/seed";
import { HANDSHAKE_MS, MATCH_THRESHOLD } from "../matching";
import { liveInterest } from "../math";

let missionId = 1;

/** F2: stream /api/expand and grow the map node by node. */
export function useExpand() {
  const { dispatch, say, track, concepts, nodes } = useStore();
  const live = useRef({ concepts, nodes });
  live.current = { concepts, nodes };
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (text: string, source: Mission["source"]) => {
      const id = missionId++;
      const t0 = performance.now();
      dispatch({ t: "mission", m: { id, text, source, at: Date.now(), status: "running", added: 0, reused: 0 } });
      setBusy(true);
      say("EXPAND", `Muse Spark ← "${text.slice(0, 60)}" (stream: true)`);
      let added = 0, reused = 0, first = true;
      const alias: Record<string, string> = {}; // model slug → reused canonical slug
      try {
        const res = await fetch("/api/expand", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, mapSummary: Object.keys(live.current.nodes) }),
        });
        const demo = res.headers.get("x-further-mode") === "demo";
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i).replace(/^data:\s*/, "");
            buf = buf.slice(i + 2);
            let line: ExpansionLine;
            try { line = JSON.parse(chunk); } catch { continue; }
            if (line.type === "intent") {
              dispatch({ t: "missionPatch", id, patch: { intent: line.intent } });
              say("EXPAND", `intent: ${line.intent}`, "info", demo);
            } else if (line.type === "node") {
              line.edge.from = alias[line.edge.from] ?? line.edge.from;
              if (first) { say("EXPAND", `first node in ${Math.round(performance.now() - t0)}ms (target < 2500ms)`, "ok"); first = false; }
              const { concepts: cs, nodes: ns } = live.current;
              if (line.canonical) {
                reused++;
                const target = line.canonical.reusedSlug;
                alias[line.slug] = target;
                say("CANONICALIZE", `"${line.title}" ≈ ${target} (cos ${line.canonical.similarity.toFixed(2)} ≥ 0.88) → reuse`, "ok", demo);
                const parent = cs[line.edge.from];
                if (parent && cs[target]) dispatch({ t: "edge", e: { src: line.edge.from, dst: target, kind: line.edge.kind } });
                if (!ns[target]) track(target, "seed");
                continue;
              }
              const existing = cs[line.slug];
              if (existing && ns[line.slug]) { reused++; track(line.slug, "open"); say("CANONICALIZE", `${line.slug} already on map → reuse`, "info", demo); continue; }
              const parent = cs[line.edge.from];
              const pos = existing?.x !== undefined ? { x: existing.x, y: existing.y! } : placeNear(line.slug, parent?.x !== undefined ? { x: parent.x, y: parent.y! } : undefined, Object.values(cs));
              const c = { ...(CATALOG[line.slug] ?? {}), slug: line.slug, title: line.title, hook: line.hook, domain: "ai-tech", difficulty: line.difficulty, ...pos };
              live.current = { concepts: { ...cs, [c.slug]: c }, nodes: { ...ns, [c.slug]: { slug: c.slug, interest: 0.5, mastery: 0, state: "seeded", lastTouched: Date.now() } } };
              dispatch({ t: "concept", c, edge: line.edge.from !== line.slug ? { src: line.edge.from, dst: line.slug, kind: line.edge.kind } : undefined });
              track(line.slug, "seed");
              added++;
              say("CANONICALIZE", `"${line.title}" new concept (no neighbour ≥ 0.88)`, "info", demo);
              say("EXPAND", `+ ${line.slug}  [${line.edge.kind} ← ${line.edge.from}]  d${line.difficulty}`, "ok", demo);
              dispatch({ t: "missionPatch", id, patch: { added, reused } });
            } else if (line.type === "done") {
              say("EXPAND", `done: ${line.count} lines in ${line.ms}ms · ~$0.007`, "ok");
            } else if (line.type === "error") {
              throw new Error(line.message);
            }
          }
        }
        dispatch({ t: "missionPatch", id, patch: { status: "done", added, reused } });
      } catch (e) {
        say("EXPAND", (e as Error).message, "err");
        dispatch({ t: "missionPatch", id, patch: { status: "error" } });
      } finally {
        setBusy(false);
      }
    },
    [dispatch, say, track],
  );
  return { run, busy };
}

/** F1: MediaRecorder capture with a live level meter. */
export function useRecorder(maxMs = 20_000) {
  const [state, setState] = useState<"idle" | "recording" | "processing" | "denied">("idle");
  const [level, setLevel] = useState<number[]>(Array(24).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4"; // Safari → mp4
      const mr = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 64;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const t0 = Date.now();
      let raf = 0;
      const tick = () => {
        an.getByteFrequencyData(buf);
        setLevel(Array.from(buf.slice(0, 24), (v) => v / 255));
        setElapsed(Date.now() - t0);
        raf = requestAnimationFrame(tick);
      };
      tick();
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ac.close();
        setLevel(Array(24).fill(0));
        resolver.current?.(new Blob(chunks, { type: mime }));
      };
      mr.start();
      rec.current = mr;
      setState("recording");
      stopTimer.current = setTimeout(() => mr.state === "recording" && mr.stop(), maxMs);
      return new Promise<Blob | null>((r) => (resolver.current = r));
    } catch {
      setState("denied");
      return null;
    }
  }, [maxMs]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (rec.current?.state === "recording") { setState("processing"); rec.current.stop(); }
  }, []);

  return { state, setState, level, elapsed, start, stop };
}

export async function transcribeBlob(blob: Blob, purpose: "curiosity" | "explain") {
  const form = new FormData();
  form.append("audio", blob);
  form.append("purpose", purpose);
  const r = await fetch("/api/transcribe", { method: "POST", body: form });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Transcription failed");
  return d as { text: string; ms: number; demo: boolean };
}

/** E8: off-app captures (MCP) arrive here. DEMO polling stands in for Supabase Realtime. */
export function useInbox(onItem: (text: string, source: string) => void) {
  const after = useRef(0);
  const cb = useRef(onItem);
  cb.current = onItem;
  useEffect(() => {
    let alive = true;
    // Skip anything queued before this tab opened.
    fetch("/api/inbox?after=0").then((r) => r.json()).then((d) => { after.current = d.items.at(-1)?.id ?? 0; }).catch(() => {});
    const iv = setInterval(async () => {
      try {
        const d = await (await fetch(`/api/inbox?after=${after.current}`)).json();
        for (const it of d.items) {
          after.current = it.id;
          if (alive) cb.current(it.text, it.source);
        }
      } catch { /* offline */ }
    }, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
}

/** F7: run the match scorer against present explorers. Production: server job every 15s. */
export function useMatchJob() {
  const { nodes, edges, profile, dispatch, say, match, sessions } = useStore();
  return useCallback(
    async (opts: { quietIfNone?: boolean } = {}) => {
      if (match) return null;
      if (!profile.openToMatch) { say("MATCH", "You're not open to match. Skipping.", "warn"); return null; }
      const now = Date.now();
      const ranked = Object.values(nodes).sort((a, b) => liveInterest(b, now) - liveInterest(a, now));
      const me = {
        activeConcepts: ranked.slice(0, 5).map((n) => n.slug),
        mastery: Object.fromEntries(Object.values(nodes).map((n) => [n.slug, n.mastery])),
        openToMatch: profile.openToMatch,
        language: profile.language,
      };
      say("MATCH", `scoring pairs · me=[${me.activeConcepts.join(", ")}]`);
      const r = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ me, edges }) });
      const d = await r.json();
      type Row = { peer: MatchRequest["peer"]; score: number; overlap: number; complementarity: number; recency: number; teach?: { from: "a" | "b"; slug: string; near: string }; filteredBy?: string };
      for (const row of d.ranked as Row[])
        say("MATCH", `${row.peer.name}${row.peer.demo ? " (seed)" : ""}: ${row.filteredBy ? `filtered · ${row.filteredBy}` : `${row.score.toFixed(2)} = .5×${row.overlap.toFixed(2)} + .3×${row.complementarity} + .2×${row.recency}`}`, "info", true);
      // Cool-down: don't re-offer someone you just had a session with (24h).
      const met = new Set(sessions.filter((x) => now - x.at < 86_400_000).map((x) => x.peer));
      for (const row of d.ranked as Row[]) if (met.has(row.peer.name) && !row.filteredBy) { row.filteredBy = "met in last 24h"; row.score = 0; say("MATCH", `${row.peer.name}: skipped · met in last 24h`, "info"); }
      (d.ranked as Row[]).sort((x, y) => y.score - x.score);
      const best = (d.ranked as Row[])[0];
      if (!best || best.score < MATCH_THRESHOLD) {
        if (!opts.quietIfNone) say("MATCH", `no pair ≥ ${MATCH_THRESHOLD}`, "warn");
        return null;
      }
      // Your piece: the freshest concept you've got a real grip on (mastery ≥ 0.4), else your strongest.
      const all = Object.values(nodes);
      const myBest = all.filter((n) => n.mastery >= 0.4).sort((a, b) => b.lastTouched - a.lastTouched)[0] ?? all.sort((a, b) => b.mastery - a.mastery)[0];
      const peerStrong = best.teach?.from === "b" ? best.teach.slug : Object.entries(best.peer.mastery).sort((a, b) => b[1] - a[1])[0][0];
      const shared = best.peer.activeConcepts.find((s) => nodes[s]) ?? best.peer.activeConcepts[0];
      const title = (s: string) => CATALOG[s]?.title ?? s;
      const m: MatchRequest = {
        id: `m${now.toString(36)}`,
        peer: best.peer,
        concept: shared,
        peerStrong,
        youStrong: myBest.slug,
        reason: `${best.peer.name} is exploring ${title(shared)} right now and is ahead on ${title(peerStrong).toLowerCase()}.`,
        score: best.score,
        expiresAt: now + HANDSHAKE_MS,
        status: "pending",
      };
      say("MATCH", `match_request → ${best.peer.name} (${best.score.toFixed(2)} ≥ ${MATCH_THRESHOLD})`, "ok", true);
      dispatch({ t: "match", m });
      return m;
    },
    [nodes, edges, profile, dispatch, say, match, sessions],
  );
}
