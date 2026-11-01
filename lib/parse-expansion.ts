// Models do not always obey "JSON Lines, no markdown": they wrap output in
// code fences, return one JSON array, or nest nodes under `concepts`/`nodes`.
// Parse all of those instead of silently dropping every node (0 new steps).
export function parseModelPayload(line: string): unknown[] {
  const clean = line.replace(/```(?:json)?/gi, "").trim();
  if (!clean) return [];
  const candidates = [clean];
  const start = clean.indexOf(clean.startsWith("[") ? "[" : "{");
  if (start > 0) candidates.push(clean.slice(start));
  for (const c of candidates) {
    try {
      const v: unknown = JSON.parse(c);
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        for (const key of ["concepts", "nodes", "items", "results"]) {
          if (Array.isArray(o[key])) return o[key] as unknown[];
        }
        return [v];
      }
    } catch {
      // try the next candidate shape
    }
  }
  // Last resort: first balanced-looking object on the line.
  const m = clean.match(/\{.*\}/);
  if (m) {
    try {
      return [JSON.parse(m[0])];
    } catch {
      return [];
    }
  }
  return [];
}
