import type { Concept, Edge } from "./types";
import type { KnowledgeOverviewGroup } from "./knowledge-overview";

/** No taxonomy is invented here: the source is saved parent → child part_of edges. */
export function conceptHierarchy(concepts: Concept[], edges: Edge[], scope: string[], excludedAncestors: string[] = []): KnowledgeOverviewGroup[] {
  const allowed = new Set(scope), excluded = new Set(excludedAncestors);
  const bySlug = new Map(concepts.filter(concept => allowed.has(concept.slug)).map(concept => [concept.slug, concept]));
  const children = new Map<string, string[]>(), parents = new Set<string>();
  const reaches = (from: string, target: string) => {
    const pending = [from], seen = new Set<string>();
    while (pending.length) { const next = pending.pop()!; if (next === target) return true; if (seen.has(next)) continue; seen.add(next); pending.push(...(children.get(next) ?? [])); }
    return false;
  };
  for (const edge of [...edges].sort((a,b) => `${a.src}:${a.dst}`.localeCompare(`${b.src}:${b.dst}`))) {
    if (edge.kind !== "part_of" || edge.src === edge.dst || !allowed.has(edge.src) || !allowed.has(edge.dst)) continue;
    // Do not let invalid legacy cycles become an infinite navigation path.
    if (reaches(edge.dst,edge.src)) continue;
    children.set(edge.src, [...new Set([...(children.get(edge.src) ?? []), edge.dst])].sort());
    parents.add(edge.dst);
  }
  const descendants = (slug: string) => {
    const seen = new Set<string>(), pending = [slug];
    while (pending.length) {
      const next = pending.pop()!;
      if (seen.has(next) || excluded.has(next)) continue;
      seen.add(next); pending.push(...(children.get(next) ?? []));
    }
    return [...seen].sort();
  };
  // Cyclic legacy data has no root. Keep it as visible leaf concepts rather than
  // manufacturing a hierarchy or losing the component.
  const roots = [...bySlug.keys()].filter(slug => !parents.has(slug) && !excluded.has(slug)).sort();
  const covered = new Set(roots.flatMap(descendants));
  roots.push(...[...bySlug.keys()].filter(slug => !covered.has(slug) && !excluded.has(slug)).sort());
  return roots.map(slug => {
    const concept = bySlug.get(slug)!;
    const members = descendants(slug);
    return { id: `concept-${slug}`, title: concept.title, summary: concept.hook, conceptSlugs: members.length ? members : [slug], anchorSlug: slug };
  });
}

export function childConceptHierarchy(concepts: Concept[], edges: Edge[], parent: KnowledgeOverviewGroup, ancestors: string[] = []) {
  if (!parent.anchorSlug) return conceptHierarchy(concepts, edges, parent.conceptSlugs, ancestors);
  const allowed = new Set(parent.conceptSlugs), excluded = [...ancestors, parent.anchorSlug];
  const children = edges.filter(edge => edge.kind === "part_of" && edge.src === parent.anchorSlug && allowed.has(edge.dst) && !excluded.includes(edge.dst));
  const groups = conceptHierarchy(concepts, edges, parent.conceptSlugs.filter(slug => !excluded.includes(slug)), excluded);
  const direct = new Set(children.map(edge => edge.dst));
  return groups.filter(group => direct.has(group.anchorSlug!));
}

/** A model response must actually narrow a branch before it becomes a new level. */
export function narrowsBranch(groups: KnowledgeOverviewGroup[], parentSlugs: string[]) {
  if (groups.length < 2) return false;
  const expected = new Set(parentSlugs), assigned = groups.flatMap(group => group.conceptSlugs);
  return groups.every(group => group.conceptSlugs.length < expected.size) && assigned.length === expected.size && new Set(assigned).size === assigned.length && assigned.every(slug => expected.has(slug));
}

export function hierarchyPathKey(path: KnowledgeOverviewGroup[]) { return path.map(group => group.id).join("/"); }
