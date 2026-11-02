"use client";

import type { KnowledgeTopicGroup } from "@/lib/knowledge-overview";
import type { UserNode } from "@/lib/types";

export default function KnowledgeOverviewInspector({ groups, activeGroupId, currentGroup, nodes, onEnter, onExit, onOpenConcept }: {
  groups: KnowledgeTopicGroup[];
  activeGroupId: string | null;
  currentGroup?: KnowledgeTopicGroup;
  nodes: Record<string, UserNode>;
  onEnter: (id: string) => void;
  onExit: () => void;
  onOpenConcept?: (slug: string) => void;
}) {
  const active = currentGroup ?? groups.find(group => group.id === activeGroupId);
  const included = [...new Set((active ? [active] : groups).flatMap(group => group.conceptSlugs))].filter(slug => nodes[slug]);
  return <article className="flex h-full min-h-0 flex-col">
    <header className="flex h-10 shrink-0 items-center border-b border-line px-4"><h2 className="label">{active ? active.anchorSlug ? "Inside this concept" : "Inside this topic" : "My knowledge map"}</h2></header>
    <div className="scroll min-h-0 flex-1 px-4 py-5">
      <h3 className="text-xl font-semibold leading-snug">{active?.title ?? "Your learning, seen together."}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{active?.summary ?? "Start with the big ideas. Open a topic, then its subtopics, to see how concepts connect across your questions."}</p>
      <div className="mt-5 flex gap-8 border-y border-line py-4">{groups.length > 0 && <div><span className="block text-xl tabular-nums">{groups.length}</span><span className="text-xs text-muted">{active ? "Subtopics" : "Topics"}</span></div>}<div><span className="block text-xl tabular-nums">{included.length}</span><span className="text-xs text-muted">Saved concepts</span></div></div>
      {active?.anchorSlug && onOpenConcept && <button className="btn btn-primary mt-5 w-full" onClick={() => onOpenConcept(active.anchorSlug!)}>Learn this concept</button>}
      {groups.length > 0 ? <><h4 className="label mb-3 mt-6">{active ? "Go deeper" : "Explore a topic"}</h4><ul className="space-y-2">{groups.map(group => <li key={group.id}><button className="flex w-full items-start gap-3 rounded-md border border-line bg-panel-2 p-3 text-left hover:border-dim" onClick={() => onEnter(group.id)}><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{group.title}</span><span className="mt-1 block text-xs text-muted">{new Set(group.conceptSlugs.filter(slug => nodes[slug])).size} concepts{group.children?.length ? ` · ${group.children.length} subtopics` : ""}</span></span><span className="text-muted" aria-hidden>↗</span></button></li>)}</ul></> : <p className="mt-5 text-sm leading-relaxed text-muted">Choose a concept on the map to continue learning. Use the breadcrumb or zoom out to move back one level.</p>}
      {active && <button className="btn mt-5 w-full" onClick={onExit}>← Back one level</button>}
      <p className="mt-5 text-xs leading-relaxed text-muted">Topics organize your saved ideas. A concept can connect to more than one parent; its learning history stays the same wherever you open it.</p>
    </div>
  </article>;
}
