/** Selected learning fields only. Demographic/identity/profile attributes are
 * deliberately absent; the result remains private and is never a peer target. */
export function metadataIndexText(values: Record<string, unknown>): string | null {
  const clean = (value: unknown, max = 500) => typeof value === "string" ? value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email omitted]")
    .replace(/(?:\+?\d[\d(). -]{7,}\d)/g,"[number omitted]")
    .replace(/\s+/g," ").trim().slice(0,max) : "";
  const intent = clean(values.intent,800);
  const goals = Array.isArray(values.goals) ? values.goals.slice(0,8).map(v=>clean(v,250)).filter(Boolean) : [];
  const concepts = Array.isArray(values.concepts) ? values.concepts.slice(0,12).map(v=>v && typeof v === "object" ? clean((v as Record<string,unknown>).title,160) : "").filter(Boolean) : [];
  const matching = clean(values.matchingText,800);
  const lines = [intent && `Learning intent: ${intent}`,goals.length && `Goals: ${goals.join("; ")}`,concepts.length && `Ideas: ${concepts.join("; ")}`,matching && `Learning description: ${matching}`].filter(Boolean);
  return lines.length ? lines.join("\n").slice(0,6000) : null;
}
