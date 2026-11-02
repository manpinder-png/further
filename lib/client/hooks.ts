"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type Mission } from "./store";
import type { ExpansionLine, MatchRequest } from "../types";
import { placeNear } from "../layout";
import { CATALOG } from "../demo/seed";
import { HANDSHAKE_MS, MATCH_THRESHOLD } from "../matching";
import { liveInterest } from "../math";
import { learnerModel } from "../learn";
import { getDataMode, liveFetch } from "./live";
import { encodeWav, resample } from "./audio";
import { useAIStream } from "./useAIStream";
import { mutationKey } from "@/domains/ui/contracts";
import { canUseNewRequestKey } from "./stream";

let missionId = Date.now(); // unique across reloads (missions are persisted)

/** Real agent progress and draft text stream separately from authoritative map updates. */
export function useExpand() {
  const { dispatch, say, track, concepts, nodes, events, refreshSnapshot } = useStore();
  const live = useRef({ concepts, nodes }); live.current = { concepts, nodes };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activity, run: stream, cancel } = useAIStream();
  const previous = useRef<{ text: string; source: Mission["source"]; key: string; id: number; retryWithNewKey: boolean } | null>(null);
  const run = useCallback(async (text: string, source: Mission["source"], key = mutationKey(), retriedMissionId?: number) => {
    const retryId = retriedMissionId ?? (previous.current?.key === key ? previous.current.id : undefined);
    const id = retryId ?? missionId++;
    previous.current = { text, source, key, id, retryWithNewKey: false };
    if (retryId !== undefined) dispatch({ t: "missionPatch", id, patch: { status: "running", error: undefined } });
    else dispatch({ t: "mission", m: { id, text, source, at: Date.now(), status: "running", added: 0, reused: 0 } });
    setBusy(true); setError(null);
    try {
      const result = await stream<{ runId?: string; lines: ExpansionLine[]; persisted: boolean; mode: string }>("/api/expand", {
        method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ text, mapSummary: Object.keys(live.current.nodes), learnerSummary: learnerModel(live.current.nodes, events).summary }),
      });
      let added = 0, reused = 0;
      const slugs: string[] = [];
      const aliases: Record<string, string> = {};
      for (const line of result.lines) {
        if (line.type === "error") throw new Error(line.message);
        if (line.type === "intent") dispatch({ t: "missionPatch", id, patch: { intent: line.intent } });
        if (line.type !== "node") continue;
        const slug = line.canonical?.reusedSlug ?? line.slug;
        aliases[line.slug] = slug;
        const from = aliases[line.edge.from] ?? line.edge.from;
        if (live.current.nodes[slug]) reused++; else added++;
        if (!slugs.includes(slug)) slugs.push(slug);
        // Sample mode has browser state only; local mode refreshes the saved canonical graph.
        if (getDataMode() === "demo" && !result.persisted) {
          const parent = live.current.concepts[from];
          const position = placeNear(slug, parent?.x === undefined ? undefined : { x: parent.x, y: parent.y! }, Object.values(live.current.concepts));
          const c = { ...(CATALOG[slug] ?? {}), slug, title: line.title, hook: line.hook, domain: "ai-tech", difficulty: line.difficulty, ...position };
          live.current = { ...live.current, concepts: { ...live.current.concepts, [slug]: c } };
          dispatch({ t: "concept", c, edge: from !== slug ? { src: from, dst: slug, kind: line.edge.kind } : undefined });
          if (!live.current.nodes[slug]) await track(slug, "seed");
        }
      }
      dispatch({ t: "missionPatch", id, patch: { runId: result.runId, status: "done", added, reused, slugs } });
      if (getDataMode() === "local") await refreshSnapshot();
      say("EXPAND", `Validated map result: ${added} added, ${reused} reused`, "ok", result.mode === "fixture" || result.mode === "demo");
      return true;
    } catch (e) {
      if (previous.current?.key === key) previous.current.retryWithNewKey = canUseNewRequestKey(e);
      const message = e instanceof Error && e.name === "AbortError" ? "Stopped waiting. Your saved map is unchanged unless the server already completed the request." : e instanceof Error ? e.message : "The map could not finish growing.";
      setError(message); say("EXPAND", message, "err");
      dispatch({ t: "missionPatch", id, patch: { status: "error", error: message } });
      return false;
    } finally { setBusy(false); }
  }, [dispatch, say, track, events, refreshSnapshot, stream]);
  const retry = useCallback(async () => {
    const attempt = previous.current;
    if (!attempt) return false;
    const restored = await run(attempt.text, attempt.source, attempt.retryWithNewKey ? mutationKey() : attempt.key, attempt.id);
    // An unknown disconnect first checks the old key. If the server confirms
    // failure before saving, this Retry click may safely make one new attempt.
    if (!restored && !attempt.retryWithNewKey && previous.current?.id === attempt.id && previous.current.retryWithNewKey) return run(attempt.text, attempt.source, mutationKey(), attempt.id);
    return restored;
  }, [run]);
  return { run, busy, error, activity, cancel, retry };
}

/** Capture microphone PCM and release tracks on stop, failure or navigation. */
export function useRecorder(maxMs = 20_000) {
  const [state, setState] = useState<"idle" | "recording" | "processing" | "denied">("idle");
  const [level, setLevel] = useState<number[]>(Array(24).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (rec.current?.state === "recording") rec.current.stop();
      cleanup.current?.(); resolver.current?.(null); resolver.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (starting.current || rec.current?.state === "recording") return null;
    starting.current = true; setState("processing");
    cleanup.current = null;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return null; }
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      const ac = new AudioContext(); context = ac;
      const an = ac.createAnalyser(); an.fftSize = 64;
      const source = ac.createMediaStreamSource(stream); source.connect(an);
      // Upload mono 16-bit PCM WAV at 24 kHz, not MediaRecorder's WebM/MP4 container.
      const pcm: Float32Array[] = [];
      const processor = ac.createScriptProcessor(4096, 1, 1);
      const silent = ac.createGain(); silent.gain.value = 0;
      processor.onaudioprocess = (event) => pcm.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor); processor.connect(silent); silent.connect(ac.destination);
      const buf = new Uint8Array(an.frequencyBinCount);
      const started = Date.now();
      let raf = 0, released = false;
      const release = () => {
        if (released) return; released = true;
        cancelAnimationFrame(raf);
        if (stopTimer.current) clearTimeout(stopTimer.current);
        stream?.getTracks().forEach((track) => track.stop());
        processor.disconnect(); source.disconnect(); silent.disconnect();
        void ac.close(); rec.current = null;
      };
      cleanup.current = release;
      const tick = () => {
        if (!mounted.current) return;
        an.getByteFrequencyData(buf);
        setLevel(Array.from(buf.slice(0, 24), (value) => value / 255));
        setElapsed(Date.now() - started);
        raf = requestAnimationFrame(tick);
      };
      mr.ondataavailable = () => undefined;
      mr.onstop = () => {
        release();
        if (mounted.current) { setLevel(Array(24).fill(0)); setState("processing"); }
        const resolve = resolver.current; resolver.current = null;
        resolve?.(mounted.current ? encodeWav(resample(pcm, ac.sampleRate, 24_000), 24_000) : null);
      };
      mr.onerror = () => { release(); resolver.current?.(null); resolver.current = null; if (mounted.current) setState("denied"); };
      const result = new Promise<Blob | null>((resolve) => { resolver.current = resolve; });
      mr.start(); rec.current = mr; setElapsed(0); setState("recording"); tick();
      stopTimer.current = setTimeout(() => { if (mr.state === "recording") mr.stop(); }, maxMs);
      return result;
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      cleanup.current?.();
      if (context && context.state !== "closed") void context.close();
      if (mounted.current) setState("denied");
      return null;
    } finally { starting.current = false; }
  }, [maxMs]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (rec.current?.state === "recording") { setState("processing"); rec.current.stop(); }
  }, []);
  return { state, setState, level, elapsed, start, stop };
}

export interface Transcription { text: string; ms: number; demo: boolean }
export async function transcribeBlob(blob: Blob, purpose: "curiosity" | "explain", stream: (path: string, init: RequestInit) => Promise<Transcription>) {
  const form = new FormData(); form.append("audio", blob); form.append("purpose", purpose);
  return stream("/api/transcribe", { method: "POST", body: form });
}

/** E8: off-app captures (MCP) arrive here. DEMO polling stands in for Supabase Realtime. */
export function useInbox(onItem: (text: string, source: string) => void) {
  const after = useRef(0);
  const cb = useRef(onItem);
  cb.current = onItem;
  useEffect(() => {
    if (getDataMode() !== "demo") return;
    let alive = true;
    // Demo captures are never delivered into a real local learner map.
    liveFetch("/api/inbox?after=0").then((r) => r.json()).then((d) => { after.current = d.items.at(-1)?.id ?? 0; }).catch(() => {});
    const iv = setInterval(async () => {
      try {
        const d = await (await liveFetch(`/api/inbox?after=${after.current}`)).json();
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
    async (opts: { quietIfNone?: boolean; conceptSlugs?: string[] } = {}) => {
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
      const r = await liveFetch("/api/match", { method: "POST", body: JSON.stringify({ me, edges, ...(opts.conceptSlugs === undefined ? {} : { conceptSlugs: opts.conceptSlugs }) }) });
      const d = await r.json();
      if (!r.ok) {
        say("MATCH", d.error ?? "Match service unavailable", "err");
        throw new Error(d.error ?? "Match service unavailable");
      }
      type Row = { peer: MatchRequest["peer"]; score: number; overlap: number; complementarity: number; recency: number; teach?: { from: "a" | "b"; slug: string; near: string }; filteredBy?: string };
      for (const row of (d.ranked ?? []) as Row[])
        say("MATCH", `${row.peer.name}${row.peer.demo ? " (seed)" : ""}: ${row.filteredBy ? `filtered · ${row.filteredBy}` : `${row.score.toFixed(2)} = .5×${row.overlap.toFixed(2)} + .3×${row.complementarity} + .2×${row.recency}`}`, "info", d.demo);
      if (!d.demo && d.match) {
        say("MATCH", `match_request → ${d.match.peer.name} (${d.match.score.toFixed(2)} ≥ ${MATCH_THRESHOLD})`, "ok");
        dispatch({ t: "match", m: d.match as MatchRequest });
        return d.match as MatchRequest;
      }
      if (getDataMode() === "local") {
        if (!opts.quietIfNone) say("MATCH", "No suitable peer is available right now. Your map stays ready while you learn.", "info");
        return null;
      }
      // Rehearsal-only matching below. Local peers are selected by the server.
      const met = new Set(sessions.filter((x) => now - x.at < 86_400_000).map((x) => x.peer));
      for (const row of (d.ranked ?? []) as Row[]) if (met.has(row.peer.name) && !row.filteredBy) { row.filteredBy = "met in last 24h"; row.score = 0; say("MATCH", `${row.peer.name}: skipped · met in last 24h`, "info"); }
      const demoRanked = (d.ranked ?? []) as Row[];
      demoRanked.sort((x, y) => y.score - x.score);
      const best = demoRanked[0];
      if (!best || best.score < MATCH_THRESHOLD) {
        if (!opts.quietIfNone) say("MATCH", `no pair ≥ ${MATCH_THRESHOLD}`, "warn");
        return null;
      }
      // Your piece: the freshest concept you've got a real grip on (mastery ≥ 0.4), else your strongest.
      const all = Object.values(nodes);
      if (!all.length) return null;
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
