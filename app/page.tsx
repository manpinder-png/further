"use client";

// Composition: the map fills the screen; one side panel holds the question, its
// path or the open card, and the composer. Question focus changes which saved
// concepts are shown, not the workspace layout.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { learningPaths } from "@/lib/client/learning-paths";
import SidePanel from "@/components/mission/SidePanel";
import Inspector from "@/components/mission/Inspector";
import Review from "@/components/mission/Review";
import PanelResizer from "@/components/mission/PanelResizer";
import MatchModal from "@/components/mission/MatchModal";
import TimeLapse, { type TL } from "@/components/mission/TimeLapse";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";
import { replay } from "@/lib/math";
import GeomindMap from "@/components/map/GeomindMap";
import GeomindInspector from "@/components/mission/GeomindInspector";
import { useGeomind } from "@/lib/client/use-geomind";
import { useKnowledgeOverview } from "@/lib/client/use-knowledge-overview";
import { useCompletionCounts } from "@/lib/client/use-completion-counts";
import KnowledgeOverviewInspector from "@/components/mission/KnowledgeOverviewInspector";
import type { KnowledgeOverviewGroup } from "@/lib/knowledge-overview";
import type { FEvent } from "@/lib/types";
import { childConceptHierarchy, conceptHierarchy, hierarchyPathKey, narrowsBranch } from "@/lib/knowledge-hierarchy";

const KnowledgeMap = dynamic(() => import("@/components/map/KnowledgeMap"), { ssr: false });
type MapView = "question" | "knowledge" | "geomind";
// Side panel width (desktop). The map always keeps MAP_MIN pixels so its controls still fit.
const PANEL_KEY = "further:panel-width";
const PANEL_DEFAULT = 400, PANEL_MIN = 320, PANEL_MAX = 1100, MAP_MIN = 380, PANEL_WIDE = 560;
const panelMax = () => typeof window === "undefined" ? PANEL_MAX : Math.max(PANEL_MIN, Math.min(PANEL_MAX, window.innerWidth - MAP_MIN));
const MAP_VIEWS: Array<{ id: MapView; label: string }> = [{ id: "question", label: "This question" }, { id: "knowledge", label: "My knowledge map" }, { id: "geomind", label: "Geomind" }];

export default function MapScreen() {
  const { auth, authReady, ready, actorId, concepts, edges, nodes, events, explorers, selected, dispatch, missions, fitKey, profile, dataMode, modelMode, loadingError, saveError, pendingWrites, refreshAuth, refreshSnapshot, retryPendingWrites } = useStore();
  const paths = useMemo(() => learningPaths(missions, concepts), [missions, concepts]);
  const [questionKey, setQuestionKey] = useState<string | null>(null);
  const [view, setView] = useState<MapView>("question");
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [knowledgeTrail, setKnowledgeTrail] = useState<KnowledgeOverviewGroup[]>([]);
  const [knowledgePage, setKnowledgePage] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [maxPanel, setMaxPanel] = useState(PANEL_MAX);
  const [review, setReview] = useState(false);
  // A requested starting tab applies only to the concept it was requested for (e.g. Review's Explain again).
  const [inspectorTab, setInspectorTab] = useState<{ slug: string; tab: "learn" | "explain" | "sources" } | null>(null);
  const [tl, setTl] = useState<TL>({ on: false, t: 0, playing: false });
  const restoredFor = useRef<string | null>(null);
  const lastOverviewHash = useRef<string | null>(null);
  const graphRevision = useMemo(() => JSON.stringify({
    mode: modelMode,
    concepts: Object.values(concepts).map(({ slug, title, hook }) => ({ slug, title, hook })).sort((a, b) => a.slug.localeCompare(b.slug)),
    edges: [...edges].sort((a, b) => `${a.src}:${a.dst}:${a.kind}`.localeCompare(`${b.src}:${b.dst}:${b.kind}`)),
  }), [concepts, edges, modelMode]);
  const knowledge = useKnowledgeOverview({ active: view === "knowledge" && ready && dataMode === "local", actorId: actorId ?? null, revision: graphRevision });
  const knowledgeGroups = knowledge.result?.overview.groups ?? [];
  const knowledgeGroup = view === "knowledge" ? knowledgeTrail.at(-1) : undefined;
  const knowledgeBranch = useKnowledgeOverview({ active: view === "knowledge" && ready && dataMode === "local" && Boolean(knowledgeGroup && !knowledgeGroup.anchorSlug && !knowledgeGroup.children?.length && knowledgeGroup.conceptSlugs.length > 4), actorId: actorId ?? null, revision: graphRevision, conceptSlugs: knowledgeGroup?.conceptSlugs });
  const canonicalGroups = useMemo(() => knowledgeGroup ? knowledgeGroup.anchorSlug
    ? childConceptHierarchy(Object.values(concepts), edges, knowledgeGroup, knowledgeTrail.flatMap(group => group.anchorSlug ? [group.anchorSlug] : []).slice(0,-1))
    : conceptHierarchy(Object.values(concepts), edges, knowledgeGroup.conceptSlugs)
    : [], [knowledgeGroup, knowledgeTrail, concepts, edges]);
  const scopedGroups = knowledgeBranch.result?.overview.groups;
  const semanticChildren = knowledgeGroup?.children?.length ? knowledgeGroup.children : knowledgeGroup && scopedGroups && narrowsBranch(scopedGroups, knowledgeGroup.conceptSlugs) ? scopedGroups : [];
  const levelGroups = !knowledgeGroup ? knowledgeGroups : semanticChildren.length ? semanticChildren : canonicalGroups.some(group => group.conceptSlugs.length > 1) ? canonicalGroups : [];
  const shownGroups = levelGroups.slice(knowledgePage * 12, (knowledgePage + 1) * 12);
  const knowledgeLevelKey = hierarchyPathKey(knowledgeTrail) + `:page-${knowledgePage}`;
  const currentPath = paths.find((path) => path.key === questionKey) ?? paths[0];
  const activePath = view === "question" ? currentPath : undefined;
  const activeSlugs = activePath?.slugs ?? knowledgeGroup?.conceptSlugs;
  const scope = useMemo(() => activeSlugs ? new Set(activeSlugs) : null, [activeSlugs]);
  const conceptList = useMemo(() => Object.values(concepts).filter((concept) => !scope || scope.has(concept.slug)), [concepts, scope]);
  const visibleEdges = useMemo(() => edges.filter((edge) => !scope || (scope.has(edge.src) && scope.has(edge.dst))), [edges, scope]);
  const shownNodes = useMemo(() => {
    const snapshot = tl.on ? replay(events, tl.t) : nodes;
    return Object.fromEntries(Object.entries(snapshot).filter(([slug]) => !scope || scope.has(slug)));
  }, [tl, events, nodes, scope]);
  const completionScopes = [
    ...(view === "knowledge" && levelGroups.length ? [] : conceptList.filter(concept => shownNodes[concept.slug]).map(concept => ({ id: `concept:${concept.slug}`, conceptSlugs: [concept.slug] }))),
    ...(view === "knowledge" ? shownGroups.map(group => ({ id: `topic:${group.id}`, conceptSlugs: group.conceptSlugs })) : []),
    ...(knowledgeGroup ? [{ id: "current-topic", conceptSlugs: knowledgeGroup.conceptSlugs }] : []),
  ];
  const completions = useCompletionCounts({
    active: ready && dataMode === "local" && view !== "geomind" && !tl.on,
    actorId, revision: `${events.length}:${events.at(-1)?.id ?? ""}`, scopes: completionScopes,
  });
  const visibleKey = (activePath?.key ?? knowledgeGroup?.id ?? "all-topics") + ":" + conceptList.map((concept) => concept.slug).join(",");
  // Per-concept history for the map cards: when it appeared and the latest thing you did with it.
  const nodeMeta = useMemo(() => {
    const meta: Record<string, { addedAt?: number; lastAt?: number; lastLabel?: string }> = {};
    const labels: Partial<Record<FEvent["kind"], string>> = { open: "Opened", dwell: "Read", watch: "Source read", explain: "Explained", session: "Discussed", skip: "Skipped" };
    for (const event of events) {
      const entry = meta[event.slug] ??= {};
      if (event.kind === "seed") { if (entry.addedAt === undefined || event.at < entry.addedAt) entry.addedAt = event.at; continue; }
      if (entry.lastAt === undefined || event.at >= entry.lastAt) { entry.lastAt = event.at; entry.lastLabel = labels[event.kind] ?? "Activity"; }
    }
    return meta;
  }, [events]);
  // Directly selected saved lessons remain accessible while the derived overview loads or fails.
  const selectedInView = selected && concepts[selected] && (!scope || scope.has(selected)) ? selected : null;
  const geomind = useGeomind({ active: view === "geomind" && ready && dataMode === "local", actorId: actorId ?? null, revision: `${profile.openToMatch}:${profile.staticProfile.age18Plus}:${profile.language}:${profile.availableMinutes}:${events.length}` });
  const selectedPeer = geomind.snapshot?.neighbors.find(peer => peer.id === selectedPeerId) ?? null;
  const cardOpen = view === "geomind" ? Boolean(selectedPeer) : Boolean(selectedInView);
  const sheetOpen = sheet || cardOpen || review;

  // Restore the saved panel width and keep it within bounds as the window changes size.
  useEffect(() => {
    let saved = PANEL_DEFAULT;
    try { const value = Number(localStorage.getItem(PANEL_KEY)); if (Number.isFinite(value) && value > 0) saved = value; } catch { /* Optional layout preference. */ }
    const clampToWindow = () => { const max = panelMax(); setMaxPanel(max); setPanelWidth(width => Math.min(max, Math.max(PANEL_MIN, width))); };
    setPanelWidth(saved); clampToWindow();
    window.addEventListener("resize", clampToWindow);
    return () => window.removeEventListener("resize", clampToWindow);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!ready || !actorId || restoredFor.current === actorId) return;
    restoredFor.current = actorId;
    try {
      const savedQuestion = localStorage.getItem("further:path:" + actorId);
      const savedView = localStorage.getItem("further:map-view:" + actorId);
      setQuestionKey(savedQuestion === "all-topics" ? null : savedQuestion);
      setView(savedView === "question" || savedView === "knowledge" || savedView === "geomind" ? savedView : savedQuestion === "all-topics" ? "knowledge" : "question");
    } catch { /* Optional view preference. */ }
  }, [ready, actorId]);
  useEffect(() => {
    if (selected && scope && !scope.has(selected)) dispatch({ t: "select", slug: null });
  }, [scope, selected, dispatch]);
  useEffect(() => {
    const hash = knowledge.result?.sourceHash;
    if (!hash) return;
    if (lastOverviewHash.current && lastOverviewHash.current !== hash) {
      setKnowledgeTrail([]); setKnowledgePage(0); dispatch({t:"select",slug:null});
    }
    lastOverviewHash.current = hash;
  }, [knowledge.result?.sourceHash, dispatch]);
  useEffect(() => { dispatch({ t: "fit" }); }, [visibleKey, dispatch]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (view === "geomind" && selectedPeerId) setSelectedPeerId(null);
      else if (selected) dispatch({ t: "select", slug: null });
      else if (review) setReview(false);
      else if (view === "knowledge" && knowledgeTrail.length) { setKnowledgeTrail(old => old.slice(0,-1)); setKnowledgePage(0); setTl(old => ({ ...old, on: false, playing: false })); dispatch({ t: "fit" }); }
      else if (sheet) setSheet(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected, selectedPeerId, view, sheet, review, knowledgeTrail.length, dispatch]);
  useEffect(() => {
    if (!geomind.loading && selectedPeerId && !selectedPeer) setSelectedPeerId(null);
  }, [geomind.loading, selectedPeerId, selectedPeer]);

  const chooseView = (next: MapView) => {
    setView(next); setSelectedPeerId(null); setKnowledgeTrail([]); setKnowledgePage(0); setTl(old => ({ ...old, on: false, playing: false }));
    dispatch({ t: "select", slug: null }); dispatch({ t: "fit" });
    try { if (actorId) localStorage.setItem("further:map-view:" + actorId, next); } catch { /* Optional view preference. */ }
  };
  const enterKnowledgeGroup = (id: string) => {
    const group = levelGroups.find(item => item.id === id);
    if (!group) return;
    if (group.anchorSlug && group.conceptSlugs.length === 1) { dispatch({ t:"select",slug:group.anchorSlug }); return; }
    setKnowledgeTrail(old => [...old, group]); setKnowledgePage(0); setTl(old => ({ ...old, on: false, playing: false }));
    dispatch({ t: "select", slug: null }); dispatch({ t: "fit" });
  };
  const leaveKnowledgeGroup = () => {
    setKnowledgeTrail(old => old.slice(0,-1)); setKnowledgePage(0); setTl(old => ({ ...old, on: false, playing: false }));
    dispatch({ t: "select", slug: null }); dispatch({ t: "fit" });
  };
  const jumpKnowledgeLevel = (depth: number) => {
    setKnowledgeTrail(old => old.slice(0,depth)); setKnowledgePage(0); setTl(old => ({...old,on:false,playing:false}));
    dispatch({t:"select",slug:null}); dispatch({t:"fit"});
  };

  const chooseQuestion = (key: string) => {
    chooseView("question");
    setQuestionKey(key); setTl((old) => ({ ...old, on: false, playing: false }));
    dispatch({ t: "select", slug: null }); dispatch({ t: "fit" });
    try { if (actorId) localStorage.setItem("further:path:" + actorId, key); } catch { /* Optional view preference. */ }
  };
  const finishQuestion = () => {
    chooseView("question");
    setQuestionKey(null); setTl((old) => ({ ...old, on: false, playing: false }));
    dispatch({ t: "select", slug: null }); dispatch({ t: "fit" });
    try { if (actorId) localStorage.removeItem("further:path:" + actorId); } catch { /* Optional view preference. */ }
  };
  const openTopic = (slug: string, tab?: "learn" | "explain" | "sources") => {
    setInspectorTab(tab ? { slug, tab } : null);
    const group = view === "knowledge" ? knowledgeGroups.find(item => item.conceptSlugs.includes(slug)) : undefined;
    if (group) { setKnowledgeTrail([group]); setKnowledgePage(0); }
    else if (view === "geomind" || view === "knowledge" || (scope && !scope.has(slug))) {
      const containing = paths.find((path) => path.slugs.includes(slug));
      if (containing) chooseQuestion(containing.key);
      else chooseView("knowledge");
    }
    dispatch({ t: "select", slug });
  };
  const commitPanelWidth = (width: number) => {
    setPanelWidth(width);
    try { localStorage.setItem(PANEL_KEY, String(width)); } catch { /* Optional layout preference. */ }
    dispatch({ t: "fit" });
  };
  // One click between the default and a roomy half-screen panel, for people who don't drag.
  const togglePanelWidth = () => commitPanelWidth(panelWidth >= PANEL_WIDE ? PANEL_DEFAULT : Math.min(maxPanel, Math.max(PANEL_WIDE, Math.round(window.innerWidth * 0.5))));
  const toggleSheet = () => {
    if (cardOpen) { dispatch({ t: "select", slug: null }); setSelectedPeerId(null); setSheet(false); }
    else if (review) setReview(false);
    else setSheet(open => !open);
  };
  const resumeQuestion = (key: string, slug: string | null) => {
    setReview(false);
    chooseQuestion(key);
    if (slug) dispatch({ t: "select", slug });
  };
  const invitePeer = async (peerId: string, conceptSlug: string, peerConceptSlug?: string) => {
    const match = await geomind.invite(peerId, conceptSlug, peerConceptSlug);
    if (!match) { void refreshSnapshot().catch(() => undefined); return; }
    dispatch({ t: "match", m: match });
    setSelectedPeerId(null);
    void refreshSnapshot().catch(() => undefined);
    void geomind.refresh();
  };

  if (authReady && auth && !auth.authenticated && !auth.localProfilesEnabled) return <div className="grid-bg flex h-full items-center justify-center p-6"><section className="max-w-md rounded-xl border border-line bg-panel p-6"><h1 className="text-2xl font-semibold">Your map starts with a question.</h1><p className="mt-3 text-sm leading-relaxed text-muted">Save what you’re learning, explore connected ideas, and find someone to learn with.</p><div className="mt-5 flex gap-3"><Link href="/signup" className="btn btn-primary">Create account</Link><Link href="/login" className="btn">Sign in</Link></div><p className="mt-4 text-xs text-muted">Your account keeps your learning history together.</p></section></div>;
  if (!ready) return <div className="grid-bg flex h-full items-center justify-center p-6"><section className="max-w-md rounded-xl border border-line bg-panel p-6 text-center" aria-live="polite"><h1 className="text-xl font-semibold">{loadingError ? "Your map couldn't load" : "Opening your map…"}</h1><p className="mt-3 text-sm text-muted">{loadingError ?? "Getting your saved topics and recent learning together."}</p>{loadingError && <button className="btn btn-primary mt-4" onClick={() => void (auth ? refreshSnapshot() : refreshAuth()).catch(() => undefined)}>Try again</button>}</section></div>;

  const peerInspector = <GeomindInspector key={selectedPeer?.id ?? "community"} peer={selectedPeer} onClose={() => setSelectedPeerId(null)} onInvite={(peerId, slug, peerSlug) => { void invitePeer(peerId, slug, peerSlug); }} inviting={Boolean(geomind.invitingPeerId)} checking={geomind.loading} error={geomind.inviteError} />;
  const knowledgeInspector = knowledge.phase === "ready" ? <KnowledgeOverviewInspector groups={levelGroups} activeGroupId={knowledgeGroup?.id ?? null} currentGroup={knowledgeGroup} nodes={tl.on ? replay(events, tl.t) : nodes} onEnter={enterKnowledgeGroup} onExit={leaveKnowledgeGroup} onOpenConcept={(slug) => dispatch({t:"select",slug})} /> : <section className="px-4 py-5"><h2 className="text-xl font-semibold">Your knowledge at a glance.</h2><p className="mt-3 text-sm leading-relaxed text-muted">Related ideas come together as topics. Open one to explore its concepts, then zoom back out to see the bigger picture.</p><p className="mt-5 text-xs text-muted">{Object.keys(concepts).length} saved concepts · your learning history stays intact.</p></section>;
  // Only a durable saved question can be extended; "Saved topics" and unsaved placeholders cannot.
  const pathRunId = view === "question" && activePath && activePath.key !== "saved-topics" && missions.some(mission => mission.runId === activePath.key) ? activePath.key : undefined;
  const reviewPanel = <Review paths={paths} onExplainAgain={(slug) => { setReview(false); openTopic(slug, "explain"); }} onResume={resumeQuestion} onReplay={events.length ? () => { setReview(false); chooseView("question"); setTl({ on: true, t: events[0].at, playing: true }); } : undefined} onClose={() => setReview(false)} />;
  const panelBody = view === "geomind" ? peerInspector : review && !selectedInView ? reviewPanel : view === "knowledge" && !selectedInView ? knowledgeInspector : <Inspector key={(actorId ?? "sample") + ":" + (selectedInView ?? "map")} slug={selectedInView} activeSlugs={activeSlugs} onPathCreated={finishQuestion} onClose={() => dispatch({ t: "select", slug: null })} pathRunId={pathRunId} initialTab={inspectorTab && inspectorTab.slug === selectedInView ? inspectorTab.tab : undefined} />;
  return <div className="absolute inset-0 flex min-h-0 flex-col">
    {(modelMode === "fixture" || dataMode === "demo") && <p className="shrink-0 border-b border-line bg-panel px-4 py-2 text-xs text-muted" role="status">{dataMode === "demo" ? "Sample map · your account’s saved data is separate." : "Rehearsal AI is enabled. Responses are labelled examples."}</p>}
    {(saveError || loadingError) && <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-err/40 bg-panel px-4 py-2 text-sm" role="alert"><span className="flex-1 text-err">{saveError ?? loadingError}</span><button className="btn" disabled={pendingWrites > 0} onClick={() => void (saveError ? retryPendingWrites() : refreshSnapshot()).catch(() => undefined)}>Try again</button></div>}
    {completions.error && <div className="flex shrink-0 items-center gap-3 border-b border-err/40 bg-panel px-4 py-2 text-xs" role="alert"><span className="flex-1 text-err">{completions.error}</span><button className="btn" onClick={() => void completions.refresh()}>Retry counts</button></div>}
    {pendingWrites > 0 && <div className="shrink-0 px-4 py-1"><OperationStatus label="Saving your progress" detail="Waiting for the local workspace to confirm your changes." /></div>}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section className="relative min-h-0 flex-1 bg-bg" aria-label="Your map">
        {view === "geomind" ? <GeomindMap snapshot={geomind.snapshot} loading={geomind.loading} error={geomind.error} inviteError={geomind.inviteError} selectedId={selectedPeerId} onSelect={setSelectedPeerId} onRefresh={() => { void geomind.refresh(); }} sample={dataMode === "demo"} /> : view === "knowledge" && (dataMode === "demo" || knowledge.phase !== "ready") ? <div className="grid-bg absolute inset-0 overflow-y-auto px-5 pb-8 pt-24">
          <div className="mx-auto max-w-md">
            {dataMode === "demo" ? <p className="text-sm text-muted">Open your saved local map to see its topic overview.</p> : knowledge.phase === "empty" ? <><h2 className="text-xl font-semibold">Your interests will take shape here.</h2><p className="mt-3 text-sm leading-relaxed text-muted">Ask a question in the panel. As you explore, related concepts come together into topics you can zoom into.</p></> : <>
              <h2 className="mb-4 text-xl font-semibold">Bringing your learning together</h2>
              {knowledge.phase === "checking" ? <OperationStatus label="Opening your topic overview" detail="Checking for a saved summary of your concepts." /> : <ActivityPanel activity={knowledge.activity} title="Organizing your knowledge map" onCancel={knowledge.cancel} />}
              {knowledge.error && !knowledge.activity.error && <p role="alert" className="mt-4 text-sm text-err">{knowledge.error}</p>}
              {knowledge.phase === "error" && <button className="btn mt-4" onClick={() => { void knowledge.reload(); }}>Retry overview</button>}
            </>}
          </div>
        </div> : <KnowledgeMap
          concepts={view === "knowledge" ? Object.values(concepts) : conceptList}
          edges={view === "knowledge" ? edges : visibleEdges}
          nodes={view === "knowledge" ? (tl.on ? replay(events, tl.t) : nodes) : shownNodes}
          suggestions={[]} explorers={tl.on ? [] : explorers} selected={selectedInView} meta={nodeMeta}
          completionCounts={completions.counts}
          onSelect={(slug) => dispatch({ t: "select", slug })} now={tl.on ? tl.t : Date.now()}
          fitKey={fitKey} holdCamera={tl.on} celebrate={!tl.on} topInset={view === "knowledge" ? 132 : 64}
          you={{ name: profile.displayName, level: 1, frac: 0 }}
          focus={activePath ? { title: activePath.question, topicCount: Object.keys(shownNodes).length } : undefined}
          overview={view === "knowledge" ? { groups: shownGroups, activeGroupId: knowledgeGroup?.id ?? null, currentGroup: knowledgeGroup, showGroups: levelGroups.length > 0, levelKey: knowledgeLevelKey, onEnter: enterKnowledgeGroup, onExit: leaveKnowledgeGroup } : undefined}
        />}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex max-w-full flex-wrap rounded-md border border-line-2 bg-panel/95 p-0.5 shadow-sm" role="group" aria-label="Map view">{MAP_VIEWS.map(item => <button key={item.id} className={`min-h-9 rounded px-2 text-xs sm:px-3 ${view === item.id ? "bg-panel-2 text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:text-text"}`} onClick={() => chooseView(item.id)} aria-pressed={view === item.id}>{item.label}</button>)}</div>
          {view === "knowledge" && knowledge.phase === "ready" && <>
            <nav aria-label="Knowledge map levels" className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-md border border-line bg-panel/95 px-2 py-1 text-xs">
              {knowledgeGroup ? <><button className="shrink-0 py-1 text-muted hover:text-text" onClick={() => jumpKnowledgeLevel(0)} aria-label="Zoom out to all topics">All topics</button>{knowledgeTrail.map((group,index) => <span key={`${index}:${group.id}`} className="flex min-w-0 items-center gap-2"><span aria-hidden className="text-dim">/</span><button className={`max-w-40 truncate py-1 ${index === knowledgeTrail.length-1 ? "text-text" : "text-muted hover:text-text"}`} title={group.title} onClick={() => jumpKnowledgeLevel(index+1)} aria-current={index === knowledgeTrail.length-1 ? "location" : undefined}>{group.title}</button></span>)}</> : <span className="py-1">{knowledgeGroups.length} {knowledgeGroups.length === 1 ? "topic" : "topics"} · {Object.keys(concepts).length} concepts</span>}
            </nav>
            {knowledgeGroup?.anchorSlug && <button className="btn pointer-events-auto min-h-8 bg-panel/95 px-3 py-1 text-xs" onClick={() => dispatch({t:"select",slug:knowledgeGroup.anchorSlug!})}>Learn this concept</button>}
            <span className="bg-bg/90 px-2 py-0.5 text-xs text-muted">{knowledgeGroup ? `${levelGroups.length ? `${levelGroups.length} subtopics · ` : ""}${Object.keys(shownNodes).length} concepts · ${levelGroups.length ? "open a subtopic" : "select a concept"}` : "Select a topic to zoom in"}{knowledge.result?.mode === "fixture" && " · Rehearsal overview"}</span>
          </>}
        </div>
        {view === "knowledge" && knowledgeGroup && knowledgeBranch.phase !== "ready" && knowledgeGroup.conceptSlugs.length > 4 && !knowledgeGroup.anchorSlug && !knowledgeGroup.children?.length && <div className="pointer-events-auto absolute bottom-16 left-3 z-10 max-w-[min(360px,calc(100%-24px))] rounded-lg border border-line bg-panel/95 p-3 shadow-lg">{knowledgeBranch.phase === "checking" ? <p className="text-xs text-muted" role="status">Opening saved subtopics…</p> : <ActivityPanel activity={knowledgeBranch.activity} title="Organizing these subtopics" compact onCancel={knowledgeBranch.cancel} />}{knowledgeBranch.error && <><p className="mt-2 text-xs text-err" role="alert">{knowledgeBranch.error}</p><button className="btn mt-2" onClick={() => void knowledgeBranch.reload()}>Retry subtopics</button></>}</div>}
        {view === "knowledge" && levelGroups.length > 12 && <div className="absolute bottom-16 left-3 z-10 flex items-center gap-3 rounded-md border border-line bg-panel/95 p-2 text-xs"><button className="btn" disabled={knowledgePage === 0} onClick={() => setKnowledgePage(old => old-1)}>Previous</button><span>Topics {knowledgePage*12+1}–{Math.min(levelGroups.length,(knowledgePage+1)*12)} of {levelGroups.length}</span><button className="btn" disabled={(knowledgePage+1)*12 >= levelGroups.length} onClick={() => setKnowledgePage(old => old+1)}>More topics</button></div>}
        {(view === "question" || (view === "knowledge" && knowledgeGroup)) && events.length > 0 && <TimeLapse start={events[0].at} end={Date.now()} tl={tl} setTl={setTl} hideButton />}
        {view !== "geomind" && !tl.on && Object.keys(concepts).length > 0 && <button className={`btn absolute bottom-3 left-3 bg-panel/90 backdrop-blur ${review ? "border-accent text-text" : ""}`} onClick={() => { setReview(open => !open); if (!review) { dispatch({ t: "select", slug: null }); setSelectedPeerId(null); } }} aria-pressed={review} title="What's slipping, this week, and where to pick up">Review</button>}
        <MatchModal />
      </section>
      <aside style={{ "--panel-w": `${panelWidth}px` } as React.CSSProperties} className={`relative flex min-h-0 shrink-0 flex-col border-line bg-panel max-md:border-t md:w-[var(--panel-w)] md:border-l ${mobile && sheetOpen ? (cardOpen ? "h-[80dvh]" : "h-[62dvh]") : ""}`} aria-label={view === "geomind" ? "Learner details" : "Question and concept details"}>
        <PanelResizer width={panelWidth} min={PANEL_MIN} max={maxPanel} defaultWidth={PANEL_DEFAULT} onResize={setPanelWidth} onCommit={commitPanelWidth} />
        <SidePanel view={view} paths={paths} activeQuestionKey={activePath?.key} onChooseQuestion={chooseQuestion} activeSlugs={activeSlugs} showPath={view === "question" && !selectedInView && !review} onSelectTopic={(slug) => openTopic(slug)} question={activePath?.question} onComplete={finishQuestion} onOpenTopic={openTopic} extendsRunId={pathRunId} mobileSheet={mobile ? { open: sheetOpen, onToggle: toggleSheet } : undefined} widthControl={mobile ? undefined : { wide: panelWidth >= PANEL_WIDE, onToggle: togglePanelWidth }} wide={!mobile && panelWidth >= PANEL_WIDE}>{panelBody}</SidePanel>
      </aside>
    </div>
  </div>;
}
