"use client";
// Narrated changes (DESIGN D37): short captions on the map that say what just changed
// and why. Built by diffing the live store, never from replayed history, so a reload
// or the weekly replay never floods the screen.
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import type { Suggestion } from "../insight";
import { personName, plural } from "./format";

export interface Caption { id: number; key: string; text: string; tone: "info" | "up" | "fade"; until: number }
const LIFE = 6500;
let cid = 1;

export function useNarration(suggestions: Suggestion[], paused = false) {
  const { ready, concepts, nodes, events, edges, missions } = useStore();
  const [captions, setCaptions] = useState<Caption[]>([]);
  const prev = useRef<{ concepts: Set<string>; states: Map<string, string>; lastEvent: number; suggestions: Set<string> } | null>(null);
  const addRun = useRef<{ key: string; slugs: string[]; at: number; mission?: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const snap = {
      concepts: new Set(Object.keys(concepts).filter((s) => nodes[s])),
      states: new Map(Object.values(nodes).map((n) => [n.slug, n.state])),
      lastEvent: events.length ? events[events.length - 1].id : 0,
      suggestions: new Set(suggestions.map((s) => s.slug)),
    };
    const before = prev.current;
    prev.current = snap;
    if (!before || paused) return;

    const title = (s: string) => concepts[s]?.title ?? s;
    const out: Omit<Caption, "id" | "until">[] = [];
    const now = Date.now();

    // New topics: one caption per burst, updated in place while a quest streams in.
    const added = [...snap.concepts].filter((s) => !before.concepts.has(s));
    if (added.length) {
      const mission = missions.find((m) => now - m.at < 60_000);
      const run = addRun.current && now - addRun.current.at < 5000 && addRun.current.mission === mission?.text ? addRun.current : { key: `add-${now}`, slugs: [], at: now, mission: mission?.text };
      run.slugs.push(...added);
      run.at = now;
      addRun.current = run;
      let text: string;
      if (run.slugs.length === 1) {
        const parent = edges.find((e) => e.dst === run.slugs[0] && snap.concepts.has(e.src));
        text = parent
          ? `Added ${title(run.slugs[0])}, linked to ${title(parent.src)}${mission ? ` because you asked about it` : ""}`
          : `Added ${title(run.slugs[0])} to your map`;
      } else {
        text = mission ? `Added ${plural(run.slugs.length, "topic")} from “${mission.text.slice(0, 48)}${mission.text.length > 48 ? "…" : ""}”` : `Added ${plural(run.slugs.length, "topic")} to your map`;
      }
      out.push({ key: run.key, text, tone: "info" });
    }

    // State changes.
    for (const [slug, st] of snap.states) {
      const was = before.states.get(slug);
      if (!was || was === st) continue;
      if (st === "understood") out.push({ key: `up-${slug}`, text: `${title(slug)} is understood. It moved closer to you.`, tone: "up" });
      else if (st === "explored" && was === "seeded") out.push({ key: `up-${slug}`, text: `${title(slug)} is lighting up`, tone: "up" });
    }

    // Events with their own story.
    const fresh = events.filter((e) => e.id > before.lastEvent);
    const sessionPeers = new Set<string>();
    for (const e of fresh) {
      if (e.kind === "skip") out.push({ key: `skip-${e.slug}`, text: `${title(e.slug)} is drifting into the fog. It comes back when you do.`, tone: "fade" });
      if (e.kind === "session") sessionPeers.add(personName(String(e.payload?.with ?? "a peer")));
    }
    for (const p of sessionPeers) out.push({ key: `session-${p}`, text: `Learned with ${p}. Both maps updated.`, tone: "up" });

    // The map suggesting something new.
    const newSugg = suggestions.filter((s) => !before.suggestions.has(s.slug));
    if (newSugg.length && !added.length) {
      const s = newSugg[0];
      out.push({ key: `sugg-${s.slug}`, text: `New suggestion: ${s.title}. ${s.reason}`, tone: "info" });
    }

    if (!out.length) return;
    setCaptions((cs) => {
      let next = [...cs];
      for (const c of out) {
        const i = next.findIndex((x) => x.key === c.key);
        const item = { ...c, id: i >= 0 ? next[i].id : cid++, until: Date.now() + LIFE };
        if (i >= 0) next[i] = item;
        else next.push(item);
      }
      next = next.slice(-3);
      return next;
    });
  }, [ready, concepts, nodes, events, edges, missions, suggestions, paused]);

  // Expire old captions.
  useEffect(() => {
    if (!captions.length) return;
    const soonest = Math.min(...captions.map((c) => c.until));
    const t = setTimeout(() => setCaptions((cs) => cs.filter((c) => c.until > Date.now())), Math.max(50, soonest - Date.now()));
    return () => clearTimeout(t);
  }, [captions]);

  return captions;
}
