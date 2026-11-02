"use client";
// F9 / E7: three-layer profile. Static (who you are), preferences (inferred, editable),
// current intent (point-in-time). Plus match settings and connected apps (per-user MCP token).
// Counts come from useMapStats(), the same source as the map.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMapStats, useStore } from "@/lib/client/store";
import { NodeIcon } from "@/components/ui/bits";
import { STATE_LABEL } from "@/lib/client/format";
import { BUILDER_VIEW } from "@/lib/builder";
import { liveConfigured, persistProfile } from "@/lib/client/live";
import LocalIdentity from "@/components/builder/LocalIdentity";
import { OperationStatus } from "@/components/activity/ActivityPanel";

export default function ProfilePage() {
  const { profile: savedProfile, nodes, concepts, refreshSnapshot, ready, loadingError, dataMode } = useStore();
  const [profile, setDraft] = useState(savedProfile);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!dirty) setDraft(savedProfile); }, [savedProfile, dirty]);
  const stats = useMapStats();
  const list = Object.values(nodes);
  const set = (p: Partial<typeof profile>) => {
    setDraft((old) => ({ ...old, ...p }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      if (!liveConfigured()) throw new Error("Profile editing is for your saved local map. Switch out of rehearsal mode first.");
      await persistProfile(profile);
      await refreshSnapshot();
      setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Your changes couldn't be saved."); }
    finally { setSaving(false); }
  };
  if (!ready) return <div className="p-6 text-sm text-muted">{loadingError ?? <OperationStatus label="Loading your profile" detail="Checking your local identity and reading saved preferences." />}{loadingError && <button className="btn ml-3" onClick={() => void refreshSnapshot().catch(() => undefined)}>Try again</button>}</div>;
  return (
    <div className="scroll grid-bg h-full">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <LocalIdentity />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel p-4"><p className="text-sm text-muted">See how your learning map, guide and conversations fit together.</p><Link href="/architecture" className="btn">How Further works →</Link></div>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3">
          <p className="flex-1 text-sm text-muted" role="status">{dataMode === "demo" ? "Sample profile · return to your saved map to edit your preferences." : saving ? "Saving your preferences…" : dirty ? "You have unsaved changes." : "Your profile is saved."}</p>
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
        {error && <p className="mb-4 text-sm text-err" role="alert">{error}</p>}
        {saving && <div className="mb-4"><OperationStatus label="Saving your profile" detail="Writing your preferences locally, then reloading the saved version. Your draft stays visible until this succeeds." /></div>}
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
          <Layer title="How you learn" sub="Your preferences · editable" badge={profile.preferences.inferred ? <span className="chip">Suggested</span> : null}>
            <Field label="Style"><input className="field" value={profile.preferences.style} onChange={(e) => set({ preferences: { ...profile.preferences, style: e.target.value, inferred: false } })} /></Field>
            <Field label="Pace"><input className="field" value={profile.preferences.pace} onChange={(e) => set({ preferences: { ...profile.preferences, pace: e.target.value, inferred: false } })} /></Field>
            <p className="text-xs text-muted">These preferences help shape your lessons. Change them whenever your needs change; a preference is not a fixed label.</p>
          </Layer>
          <Layer title="Right now" sub="What you're working toward">
            <Field label="Current goal"><textarea className="field h-28 resize-none" value={profile.currentIntent} onChange={(e) => set({ currentIntent: e.target.value })} /></Field>
            <p className="text-xs text-muted">Used to pick what to explore next and who to learn with today.</p>
          </Layer>
        </div>

        <section className="mt-4 border border-line bg-panel">
          <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">Matching</h2></header>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Toggle on={profile.openToMatch} onChange={(v) => set({ openToMatch: v })} label="Open to learn with others" hint="Save your changes to update whether others can find you." />
            <Toggle on={profile.staticProfile.age18Plus} onChange={(v) => set({ staticProfile: { ...profile.staticProfile, age18Plus: v } })} label="I'm 18 or older" hint="Required to learn with others." />
            <Field label="Language">
              <select className="field" value={profile.language} onChange={(e) => set({ language: e.target.value })}>
                <option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option><option value="pa">ਪੰਜਾਬੀ</option><option value="ja">日本語</option>
              </select>
            </Field>
            <Field label="Time available">
              <select className="field" value={profile.availableMinutes ?? 10} onChange={(e) => set({ availableMinutes: Number(e.target.value) })}>
                {[10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
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
  return (
    <section className="mt-4 border border-line bg-panel">
      <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">Connected apps</h2></header>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Your learning guide is available inside Further. Connecting the same map to an external assistant is a separate step; no external assistant is connected to this profile yet.</p>
        {BUILDER_VIEW && <p className="text-xs text-dim">Independent agent HTTP endpoints are available locally. External token delegation and protocol adapters remain separate from this browser session.</p>}
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
