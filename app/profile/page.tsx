"use client";
// F9 / E7: three-layer profile. Static (who you are), preferences (inferred, editable),
// current intent (point-in-time). Plus match settings and connected apps (per-user MCP token).
// Counts come from useMapStats(), the same source as the map.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMapStats, useStore } from "@/lib/client/store";
import { Demo, NodeIcon } from "@/components/ui/bits";
import { STATE_LABEL } from "@/lib/client/format";
import { BUILDER_VIEW } from "@/lib/builder";
import { liveConfigured, persistProfile } from "@/lib/client/live";

// TODO(Connor): fetch the user's token from the server; production tokens are random per user, stored hashed.
const TOKEN = "fur_demo_7f3a9c";
const masked = (t: string) => `fur_••••${t.slice(-4)}`;

export default function ProfilePage() {
  const { profile, dispatch, nodes, concepts } = useStore();
  const stats = useMapStats();
  const list = Object.values(nodes);
  const set = (p: Partial<typeof profile>) => {
    dispatch({ t: "profile", p });
    if (liveConfigured()) void persistProfile({ ...profile, ...p }).catch(() => undefined);
  };

  return (
    <div className="scroll grid-bg h-full">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <h1 className="label mb-1">Profile</h1>
            <p className="text-2xl font-semibold">{profile.displayName}</p>
          </div>
          <dl className="ml-auto grid w-full grid-cols-4 gap-px border border-line bg-line text-center sm:w-auto">
            {([["Concepts", stats.concepts], ["Understood", stats.understood], ["Sessions", stats.sessions], ["Quests", stats.quests]] as const).map(([k, v]) => (
              <div key={k} className="flex flex-col-reverse bg-panel px-3 py-2 sm:px-5">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="text-xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Layer title="Who you are" sub="You set this">
            <Field label="Display name"><input className="field" value={profile.displayName} onChange={(e) => set({ displayName: e.target.value.slice(0, 40) })} /></Field>
            <Field label="Role"><input className="field" value={profile.staticProfile.role} onChange={(e) => set({ staticProfile: { ...profile.staticProfile, role: e.target.value } })} /></Field>
            <Field label="Background"><textarea className="field h-20 resize-none" value={profile.staticProfile.background} onChange={(e) => set({ staticProfile: { ...profile.staticProfile, background: e.target.value } })} /></Field>
          </Layer>
          <Layer title="How you learn" sub="Inferred · editable" badge={profile.preferences.inferred ? <Demo title="Inferred from your events (seed rules).">INFERRED</Demo> : null}>
            <Field label="Style"><input className="field" value={profile.preferences.style} onChange={(e) => set({ preferences: { ...profile.preferences, style: e.target.value, inferred: false } })} /></Field>
            <Field label="Pace"><input className="field" value={profile.preferences.pace} onChange={(e) => set({ preferences: { ...profile.preferences, pace: e.target.value, inferred: false } })} /></Field>
            <p className="text-xs text-muted">Why we think this: you open videos before articles, and most sessions are under 15 minutes. Edit anything that&apos;s wrong.</p>
          </Layer>
          <Layer title="Right now" sub="What you're working toward">
            <Field label="Current goal"><textarea className="field h-28 resize-none" value={profile.currentIntent} onChange={(e) => set({ currentIntent: e.target.value })} /></Field>
            <p className="text-xs text-muted">Used to pick what to explore next and who to learn with today.</p>
          </Layer>
        </div>

        <section className="mt-4 border border-line bg-panel">
          <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">Matching</h2></header>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Toggle on={profile.openToMatch} onChange={(v) => set({ openToMatch: v })} label="Open to learn with others" hint="Takes effect right away. Turn off to stop getting matches." />
            <Toggle on={profile.staticProfile.age18Plus} onChange={(v) => set({ staticProfile: { ...profile.staticProfile, age18Plus: v } })} label="I'm 18 or older" hint="Required to learn with others." />
            <Field label="Language">
              <select className="field" value={profile.language} onChange={(e) => set({ language: e.target.value })}>
                <option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option><option value="pa">ਪੰਜਾਬੀ</option><option value="ja">日本語</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="mt-4 border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h2 className="label">Inventory</h2>
            <span className="text-xs text-dim">{stats.concepts} concepts</span>
          </header>
          <ul className="grid grid-cols-1 gap-1.5 p-3 min-[480px]:grid-cols-2 md:grid-cols-4">
            {[...list].sort((a, b) => b.mastery - a.mastery).map((n) => {
              const title = concepts[n.slug]?.title ?? n.slug;
              return (
                <li key={n.slug} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${n.state === "understood" ? "border-[#1b4a4d] bg-mastery-soft" : "border-line bg-bg"}`} title={`${title} · ${STATE_LABEL[n.state]}`}>
                  <NodeIcon state={n.state} mastery={n.mastery} size={18} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{title}</span>
                    <span className="block text-xs text-muted">{STATE_LABEL[n.state]}{n.state !== "seeded" ? ` · Level ${Math.min(10, Math.floor(n.mastery * 10))}` : ""}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <ConnectedApps />
      </div>
    </div>
  );
}

function ConnectedApps() {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("https://further.app");
  useEffect(() => setOrigin(window.location.origin), []);
  const copy = () => {
    navigator.clipboard?.writeText(TOKEN).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <section className="mt-4 border border-line bg-panel">
      <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">Connected apps</h2></header>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Let AI assistants like Meta AI add questions to your map without opening Further. Treat this key like a password.</p>
        <div className="flex flex-wrap gap-2">
          <code className="field flex min-h-9 w-auto min-w-[180px] flex-1 items-center font-mono text-sm" aria-label={shown ? "Your key" : "Your key, hidden"}>{shown ? TOKEN : masked(TOKEN)}</code>
          <button className="btn" onClick={() => setShown(!shown)} aria-pressed={shown}>{shown ? "Hide" : "Reveal"}</button>
          <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <button className="btn btn-ghost" disabled title="Coming soon">Regenerate</button>
        </div>
        <details className="group border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm touch-target">
            <span className="text-dim transition-transform group-open:rotate-90" aria-hidden>▸</span> How to connect
          </summary>
          <div className="space-y-2 border-t border-line p-3 text-sm text-muted">
            <p>Add this to your assistant&apos;s connector settings, then paste your key where it says &lt;your key&gt;.</p>
            <pre className="overflow-x-auto border border-line bg-bg p-3 font-mono text-xs text-text">{`{
  "mcpServers": {
    "further": {
      "url": "${origin}/mcp",
      "headers": { "Authorization": "Bearer <your key>" }
    }
  }
}`}</pre>
          </div>
        </details>
        {BUILDER_VIEW && <Link href="/connectors" className="btn">Open connector console →</Link>}
      </div>
    </section>
  );
}

function Layer({ title, sub, badge, children }: { title: string; sub: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted">{sub}</p></div>
        <span className="ml-auto">{badge}</span>
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>{children}</label>;
}
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-start gap-3 text-left">
      <span className={`mt-0.5 flex h-6 w-10 shrink-0 items-center border p-0.5 transition-colors ${on ? "border-accent bg-accent-soft" : "border-line-2 bg-bg"}`}>
        <span className={`h-4 w-4 transition-transform ${on ? "translate-x-4 bg-accent" : "bg-dim"}`} />
      </span>
      <span><span className="block text-sm">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
    </button>
  );
}
