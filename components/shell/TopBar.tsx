"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { BlockIcon } from "@/components/ui/bits";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/session", label: "Session" },
  { href: "/profile", label: "Profile" },
  { href: "/connectors", label: "Connectors" },
  { href: "/ops", label: "Ops" },
];

// Each backend dependency gets a pill: green live, orange demo, red down (DESIGN §2.1).
const PILLS: { key: string; label: string; title: string }[] = [
  { key: "muse", label: "Muse Spark", title: "Muse Spark 1.3: expansion, cards, grading, facilitation" },
  { key: "transcribe", label: "Voice", title: "Muse Voice Transcribe" },
  { key: "grounding", label: "Grounding", title: "Meta API web search grounding + oEmbed" },
  { key: "guard", label: "Llama Guard", title: "Llama Guard moderation on partner credits" },
  { key: "presence", label: "Presence", title: "Supabase Realtime Presence + Broadcast" },
  { key: "supabase", label: "Postgres", title: "Supabase Postgres + pgvector + Auth + RLS" },
  { key: "mcp", label: "MCP", title: "MCP server for Meta AI / Muse connectors" },
];

export default function TopBar() {
  const path = usePathname();
  const { status } = useStore();
  const anyDemo = status && Object.values(status).includes("demo");
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 sm:gap-4">
      <Link href="/" className="flex items-center gap-2" aria-label="Further home">
        <BlockIcon kind="diamond" slug="further" size={18} />
        <span className="pixel text-[15px] tracking-wider">FURTHER</span>
        <span className="hidden text-[10px] tracking-[0.2em] text-dim sm:inline">/// MISSION CONTROL</span>
      </Link>
      <nav className="flex h-full items-stretch sm:ml-2" aria-label="Main">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`flex items-center px-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors sm:px-3 ${active ? "text-text shadow-[inset_0_-2px_0_var(--color-signal)]" : "text-muted hover:text-text"} ${n.href === "/session" || n.href === "/connectors" ? "hidden md:flex" : ""}`}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto hidden items-center gap-1.5 xl:flex">
        {PILLS.map((p) => {
          const mode = status ? (status as unknown as Record<string, string>)[p.key] : undefined;
          const col = mode === "live" ? "var(--color-ok)" : mode === "demo" ? "var(--color-signal)" : mode === "down" ? "var(--color-err)" : "var(--color-dim)";
          return (
            <span key={p.key} className="chip" title={`${p.title}: ${mode ?? "checking"}`}>
              <span className="dot" style={{ background: col, boxShadow: mode === "live" ? `0 0 6px ${col}` : "none" }} />
              {p.label}
            </span>
          );
        })}
      </div>
      {anyDemo && (
        <Link href="/ops" className="chip chip-demo ml-auto xl:ml-0" title="Some systems have no keys yet and use labeled demo data. See Ops.">
          <span className="dot cursor-blink" style={{ background: "var(--color-signal)" }} /> Demo<span className="hidden sm:inline"> mode</span>
        </Link>
      )}
    </header>
  );
}
