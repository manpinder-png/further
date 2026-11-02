"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { Logo } from "@/components/ui/bits";
import { BUILDER_VIEW } from "@/lib/builder";

const tab = "flex h-full shrink-0 items-center px-3 text-sm transition-colors";

export default function TopBar() {
  const path = usePathname();
  const { auth, authReady, profile, match, currentSessionId, rail, dispatch } = useStore();
  const signedIn = auth?.authenticated || auth?.localProfilesEnabled;
  const onMap = path === "/";
  const sessionLive = Boolean(currentSessionId || (match && ["pending", "waiting", "accepted"].includes(match.status)));
  const sessionId = match?.sessionId ?? currentSessionId;
  const sessionHref = sessionId ? `/session?s=${encodeURIComponent(sessionId)}` : "/session";
  const name = auth?.account?.displayName ?? profile.displayName;
  const link = (href: string, label: string) => {
    const active = href === "/" ? path === "/" : path.startsWith(href.split("?")[0]);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`${tab} ${active ? "text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:text-text"}`}>{label}</Link>;
  };
  return <header className="flex h-12 shrink-0 items-center gap-1 whitespace-nowrap border-b border-line bg-bg pl-1 pr-2 sm:gap-3 sm:px-3">
    {signedIn && onMap && <button className="btn btn-ghost btn-icon border-transparent md:hidden" onClick={() => dispatch({ t: "rail", open: !rail })} aria-label={rail ? "Close your journey" : "Open your journey"} aria-expanded={rail} aria-controls="left-rail" title="Your journey"><MenuIcon /></button>}
    <Link href="/" className="flex shrink-0 items-center gap-2 px-1" aria-label="Further home"><Logo size={20} /><span className="hidden text-md font-semibold tracking-tight min-[380px]:inline">Further</span></Link>
    {signedIn && <nav className="flex h-full min-w-0 items-stretch overflow-x-auto" aria-label="Main">{link("/", "Map")}{sessionLive || path.startsWith("/session") ? link(sessionHref, "Session") : <span className={`${tab} cursor-not-allowed text-dim`} aria-disabled="true" title="Start a session from a match on the map">Session</span>}{link("/profile", "Profile")}{BUILDER_VIEW && link("/architecture", "Build")}</nav>}
    <div className="ml-auto flex min-w-0 items-center">{signedIn ? <Link href="/profile" aria-label={`Your profile${name ? `: ${name}` : ""}`} className="hidden min-w-0 items-center gap-2 text-xs text-muted hover:text-text sm:flex"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-2 bg-panel text-xs text-text">{name?.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-32 truncate lg:inline">{name}</span></Link> : authReady && path !== "/login" && <Link href="/login" className="text-sm text-muted hover:text-text">Sign in</Link>}</div>
  </header>;
}

const MenuIcon = () => <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" /></svg>;
