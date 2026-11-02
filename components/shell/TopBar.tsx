"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { Logo } from "@/components/ui/bits";
import { BUILDER_VIEW } from "@/lib/builder";

// Builder configuration indicators. They do not claim that a paid request was tested.
const PILLS: { key: string; label: string; title: string }[] = [
  { key: "storage", label: "Local storage", title: "Storage configuration" },
  { key: "agentProtocol", label: "Agents", title: "Independent agent transport" },
  { key: "modelMode", label: "Model mode", title: "Live provider or deterministic fixture configuration" },
  { key: "presence", label: "Presence", title: "Local presence with expiring availability" },
  { key: "embeddings", label: "Embeddings", title: "Local retrieval configuration" },
  { key: "transcribe", label: "Voice input", title: "Transcription configuration" },
];

const tab = "flex h-full items-center px-3 text-sm transition-colors";

export default function TopBar() {
  const path = usePathname();
  const { status, match, currentSessionId, rail, dispatch } = useStore();
  const onMap = path === "/";
  const sessionLive = Boolean(currentSessionId || (match && ["pending", "waiting", "accepted"].includes(match.status)));
  const sessionId = match?.sessionId ?? currentSessionId;
  const sessionHref = sessionId ? `/session?s=${encodeURIComponent(sessionId)}` : "/session";
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("?")[0]));

  const link = (href: string, label: string) => (
    <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={`${tab} ${isActive(href) ? "text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:text-text"}`}>
      {label}
    </Link>
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b border-line bg-bg pl-1 pr-2 sm:gap-3 sm:px-3">
      {onMap && (
        <button
          className="btn btn-ghost btn-icon border-transparent md:hidden"
          onClick={() => dispatch({ t: "rail", open: !rail })}
          aria-label={rail ? "Close your journey" : "Open your journey"}
          aria-expanded={rail}
          aria-controls="left-rail"
          title="Your journey"
        >
          <MenuIcon />
        </button>
      )}
      <Link href="/" className="flex shrink-0 items-center gap-2 px-1" aria-label="Further home">
        <Logo size={20} />
        <span className="hidden text-md font-semibold tracking-tight min-[380px]:inline">Further</span>
      </Link>
      <nav className="flex h-full items-stretch" aria-label="Main">
        {link("/", "Map")}
        {sessionLive || path.startsWith("/session") ? (
          link(sessionHref, "Session")
        ) : (
          <span className={`${tab} cursor-not-allowed text-dim`} aria-disabled="true" title="Start a session from a match on the map">
            Session
          </span>
        )}
        {link("/profile", "Profile")}
        {BUILDER_VIEW && link("/connectors", "Agents")}
        {BUILDER_VIEW && link("/ops", "Ops")}
      </nav>
      {BUILDER_VIEW && (
        <div className="ml-auto hidden items-center gap-1.5 2xl:flex">
          {PILLS.map((p) => {
            const value = status ? (status as unknown as Record<string, unknown>)[p.key] : undefined;
            const mode = typeof value === "string" ? value : value && typeof value === "object" ? JSON.stringify(value) : "checking";
            const col = ["live", "local", "http-json-v1"].includes(mode) ? "var(--color-success)" : ["demo", "fixture"].includes(mode) ? "var(--color-accent)" : mode === "down" ? "var(--color-err)" : "var(--color-dim)";
            return (
              <span key={p.key} className="chip" title={`${p.title}: ${mode ?? "checking"}`}>
                <span className="dot" style={{ background: col }} />
                {p.label}
              </span>
            );
          })}
        </div>
      )}
    </header>
  );
}

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
