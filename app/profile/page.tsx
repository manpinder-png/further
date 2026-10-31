"use client";
// F9 / E7: three-layer profile. Static (who you are), preferences (inferred, editable),
// current intent (point-in-time). Plus match settings and the per-user MCP token.
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/client/store";
import { Demo, NodeIcon } from "@/components/ui/bits";

export default function ProfilePage() {
  const { profile, dispatch, nodes, sessions, missions } = useStore();
  const [copied, setCopied] = useState(false);
  const list = Object.values(nodes);
  const set = (p: Partial<typeof profile>) => dispatch({ t: "profile", p });

  return (
    <div className="scroll grid-bg h-full">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <h1 className="label mb-1">Profile</h1>
            <p className="font-sans text-[24px] font-semibold">{profile.displayName}</p>
          </div>
          <div className="ml-auto flex gap-px border border-line bg-line text-center">
            {[["Concepts", list.length], ["Understood", list.filter((n) => n.state === "understood").length], ["Sessions", sessions.length], ["Missions", missions.length]].map(([k, v]) => (
              <div key={k} className="bg-panel px-4 py-2"><div className="pixel text-[18px]">{v}</div><div className="text-[9.5px] tracking-[0.14em] text-muted">{String(k).toUpperCase()}</div></div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Layer n="01" title="Who you are" sub="Static · you set it">
            <Field label="Display name"><input className="field" value={profile.displayName} onChange={(e) => set({ displayName: e.target.value.slice(0, 40) })} /></Field>
            <Field label="Role"><input className="field" value={profile.staticProfile.role} onChange={(e) => set({ staticProfile: { ...profile.staticProfile, role: e.target.value } })} /></Field>
            <Field label="Background"><textarea className="field h-20 resize-none" value={profile.staticProfile.background} onChange={(e) => set({ staticProfile: { ...profile.staticProfile, background: e.target.value } })} /></Field>
          </Layer>
          <Layer n="02" title="How you learn" sub="Inferred · editable" badge={profile.preferences.inferred ? <Demo title="Inferred from your events (seed rules). Production: Muse Spark summarises events weekly.">INFERRED</Demo> : null}>
            <Field label="Style"><input className="field" value={profile.preferences.style} onChange={(e) => set({ preferences: { ...profile.preferences, style: e.target.value, inferred: false } })} /></Field>
            <Field label="Pace"><input className="field" value={profile.preferences.pace} onChange={(e) => set({ preferences: { ...profile.preferences, pace: e.target.value, inferred: false } })} /></Field>
            <p className="text-[10.5px] leading-relaxed text-dim">Why we think this: you open videos before articles, and most sessions are under 15 minutes. Edit anything that&apos;s wrong.</p>
          </Layer>
          <Layer n="03" title="Right now" sub="Point-in-time intent">
            <Field label="Current intent"><textarea className="field h-28 resize-none font-sans" value={profile.currentIntent} onChange={(e) => set({ currentIntent: e.target.value })} /></Field>
            <p className="text-[10.5px] leading-relaxed text-dim">Used to rank what to explore next and who to match with today.</p>
          </Layer>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Matching</h2></header>
            <div className="space-y-3 p-4 text-[12px]">
              <Toggle on={profile.openToMatch} onChange={(v) => set({ openToMatch: v })} label="Open to match" hint="Respected immediately. You leave the presence pool when off." />
              <Toggle on={profile.staticProfile.age18Plus} onChange={(v) => set({ staticProfile: { ...profile.staticProfile, age18Plus: v } })} label="I'm 18 or older" hint="Required for peer matching in the MVP." />
              <Field label="Language">
                <select className="field" value={profile.language} onChange={(e) => set({ language: e.target.value })}>
                  <option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option><option value="pa">ਪੰਜਾਬੀ</option><option value="ja">日本語</option>
                </select>
              </Field>
            </div>
          </section>
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center justify-between border-b border-line px-3"><h2 className="label">MCP token</h2><Demo title="Fixed demo token. Production: random per user, stored hashed in mcp_tokens.">DEMO TOKEN</Demo></header>
            <div className="space-y-3 p-4">
              <p className="font-sans text-[13px] text-muted">Lets Muse, Meta AI or any MCP client add curiosities to your map without opening Further.</p>
              <div className="flex gap-2">
                <code className="field flex items-center font-mono text-[12px] text-signal">fur_demo_7f3a9c</code>
                <button className="btn" onClick={() => { navigator.clipboard?.writeText("fur_demo_7f3a9c"); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost" disabled title="TODO(Connor): POST /api/mcp/token rotates and returns once">Regenerate</button>
                <Link href="/connectors" className="btn">Open connector console →</Link>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-4 border border-line bg-panel">
          <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Inventory</h2></header>
          <div className="grid grid-cols-6 gap-1 p-3 sm:grid-cols-10">
            {list.sort((a, b) => b.mastery - a.mastery).map((n) => (
              <div key={n.slug} className="flex aspect-square items-center justify-center border border-line bg-bg" title={`${n.slug} · ${n.state} · mastery ${Math.round(n.mastery * 100)}%`}>
                <NodeIcon state={n.state} mastery={n.mastery} slug={n.slug} size={26} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Layer({ n, title, sub, badge, children }: { n: string; title: string; sub: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="pixel text-[14px] text-signal">{n}</span>
        <div><h2 className="text-[12px] uppercase tracking-[0.12em]">{title}</h2><p className="text-[10px] text-dim">{sub}</p></div>
        <span className="ml-auto">{badge}</span>
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] tracking-[0.14em] text-muted">{label.toUpperCase()}</span>{children}</label>;
}
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 text-left">
      <span className={`flex h-5 w-9 items-center border p-0.5 transition-colors ${on ? "border-signal bg-signal-dim" : "border-line-2 bg-bg"}`}>
        <span className={`h-3.5 w-3.5 transition-transform ${on ? "translate-x-4 bg-signal" : "bg-dim"}`} />
      </span>
      <span><span className="block text-[12.5px]">{label}</span><span className="block text-[10.5px] text-dim">{hint}</span></span>
    </button>
  );
}
