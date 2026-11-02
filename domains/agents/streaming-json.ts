import { AgentError } from "./contracts.ts";

export const READABLE_DRAFT_FIELDS = ["body", "answer", "explanation", "intent", "description", "suggestedCuriosity"] as const;

/** Incremental JSON lexer, not a partial-result validator. Only top-level string
 * values in an allowlist leave this boundary. It never emits syntax, nested
 * fields, raw escapes, tool arguments or incomplete UTF-16 surrogate pairs. */
export class JsonStringDraftParser {
  private depth = 0;
  private started = false;
  private finished = false;
  private invalid = false;
  private inString = false;
  private role: "key" | "value" | "ignored" = "ignored";
  private expecting: "key" | "colon" | "value" | "comma" = "key";
  private key = "";
  private token = "";
  private escape = false;
  private unicode: string | null = null;
  private highSurrogate = "";
  private bytes = 0;
  private fieldChars = 0;
  private readonly seen = new Set<string>();
  private readonly fields: Set<string>;
  constructor(fields: readonly string[] = READABLE_DRAFT_FIELDS) { this.fields = new Set(fields); }

  push(fragment: string): Array<{ field: string; delta: string }> {
    this.bytes += Buffer.byteLength(fragment);
    if (this.bytes > 128_000) throw new AgentError("BUDGET_EXCEEDED", "The streamed answer exceeds this run's output limit.");
    const emitted = new Map<string, string>();
    const character = (value: string) => {
      const code = value.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdbff) { if (this.highSurrogate) append("\uFFFD"); this.highSurrogate = value; return; }
      if (this.highSurrogate) {
        const high = this.highSurrogate; this.highSurrogate = "";
        if (code >= 0xdc00 && code <= 0xdfff) { append(high + value); return; }
        append("\uFFFD");
      }
      append(code >= 0xdc00 && code <= 0xdfff ? "\uFFFD" : value);
    };
    const append = (value: string) => {
      if (this.role === "key") { if (this.token.length < 256) this.token += value; else this.invalid = true; }
      else if (this.role === "value" && this.fieldChars + value.length <= 6000) {
        this.fieldChars += value.length;
        emitted.set(this.key, (emitted.get(this.key) ?? "") + value);
      }
    };
    for (let i = 0; i < fragment.length && !this.invalid && !this.finished; i++) {
      const c = fragment[i];
      if (this.inString) {
        if (this.unicode !== null) {
          if (!/[0-9a-f]/i.test(c)) { this.invalid = true; break; }
          this.unicode += c;
          if (this.unicode.length === 4) { character(String.fromCharCode(parseInt(this.unicode, 16))); this.unicode = null; }
        } else if (this.escape) {
          this.escape = false;
          if (c === "u") this.unicode = "";
          else {
            const escaped: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
            if (!Object.hasOwn(escaped, c)) { this.invalid = true; break; }
            character(escaped[c]);
          }
        } else if (c === "\\") this.escape = true;
        else if (c === '"') {
          if (this.highSurrogate) { append("\uFFFD"); this.highSurrogate = ""; }
          this.inString = false;
          if (this.role === "key") { this.key = this.token; this.expecting = "colon"; }
          else if (this.depth === 1) { this.expecting = "comma"; if (this.role === "value") this.seen.add(this.key); }
        } else if (c.charCodeAt(0) < 0x20) this.invalid = true;
        else character(c);
        continue;
      }
      if (!this.started) { if (c === "{") { this.started = true; this.depth = 1; } continue; }
      if (c === '"') {
        this.inString = true; this.token = ""; this.highSurrogate = ""; this.fieldChars = 0;
        this.role = this.depth === 1 && this.expecting === "key" ? "key" : this.depth === 1 && this.expecting === "value" && this.fields.has(this.key) && !this.seen.has(this.key) ? "value" : "ignored";
      } else if (c === "{" || c === "[") this.depth++;
      else if (c === "}" || c === "]") { this.depth--; if (!this.depth) this.finished = true; else if (this.depth === 1) this.expecting = "comma"; }
      else if (this.depth === 1 && c === ":") this.expecting = "value";
      else if (this.depth === 1 && c === ",") { this.expecting = "key"; this.key = ""; }
    }
    return [...emitted].map(([field, delta]) => ({ field, delta }));
  }
}

/** Search synthesis normally returns cited prose. Keep structured fixture/model
 * compatibility without ever showing a raw JSON object as the readable draft. */
export function isStructuredResourceText(text: string): boolean {
  const first = text.trimStart();
  // The compatible result envelope is an object. A leading '[' can be a
  // legitimate Markdown citation, so it must remain readable prose.
  return first.startsWith("{") || first.startsWith("```");
}

// Observed unresolved Meta source markers, not a citation protocol. Display
// cleanup confers no provenance; url_citation annotations remain mandatory.
const SOURCE_MARKER = /^†\d{16,22}†L\d{1,7}-L\d{1,7}$/;
const SOURCE_MARKER_PREFIX = /^†(?:\d{0,22}|\d{16,22}†(?:L\d{0,7}(?:-(?:L\d{0,7})?)?)?)$/;
export function stripOpaqueSourceMarkers(text: string): string {
  return text.replace(/†\d{16,22}†L\d{1,7}-L\d{1,7}(?=$|[^\dA-Za-z_-])/g, "");
}

/** Holds only a possible bounded marker until it can be distinguished from an
 * ordinary dagger, footnote, or math expression. No marker fragments leak. */
class SourceMarkerDraftFilter {
  private pending = "";
  push(fragment: string): string {
    let output = "";
    for (const character of fragment) {
      if (this.pending) {
        const next = this.pending + character;
        if (SOURCE_MARKER_PREFIX.test(next)) { this.pending = next; continue; }
        if (!SOURCE_MARKER.test(this.pending) || /[\dA-Za-z_-]/.test(character)) output += this.pending;
        this.pending = "";
      }
      if (character === "†") this.pending = character;
      else output += character;
    }
    return output;
  }
  finish(): string {
    const output = SOURCE_MARKER.test(this.pending) ? "" : this.pending;
    this.pending = "";
    return output;
  }
}

export class ResourceDraftParser {
  private mode: "pending" | "json" | "prose" = "pending";
  private prefix = "";
  private highSurrogate = "";
  private bytes = 0;
  private readonly json = new JsonStringDraftParser(["answer"]);
  private readonly markers = new SourceMarkerDraftFilter();
  push(fragment: string): Array<{ field: string; delta: string }> {
    this.bytes += Buffer.byteLength(fragment);
    if (this.bytes > 128_000) throw new AgentError("BUDGET_EXCEEDED", "The source answer exceeds this run's output limit.");
    if (this.mode === "pending") {
      this.prefix += fragment;
      const first = this.prefix.trimStart();
      if (!first || (first.startsWith("`") && first.length < 3)) return [];
      this.mode = isStructuredResourceText(first) ? "json" : "prose";
      fragment = this.prefix; this.prefix = "";
    }
    if (this.mode === "json") fragment = this.json.push(fragment).map(part => part.delta).join("");
    let text = this.highSurrogate + this.markers.push(fragment); this.highSurrogate = "";
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) { this.highSurrogate = text.slice(-1); text = text.slice(0, -1); }
    return text ? [{ field: "answer", delta: text }] : [];
  }
  finish(): Array<{ field: string; delta: string }> {
    const text = (this.highSurrogate ? "\uFFFD" : "") + this.markers.finish();
    this.highSurrogate = "";
    return text ? [{ field: "answer", delta: text }] : [];
  }
}
