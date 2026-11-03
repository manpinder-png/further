"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/client/store";
import { IDENTITY_CHANGE_KEY, MAP_RESET_KEY, MODE_KEY, liveFetch, persistProfile, resetLearningMap } from "@/lib/client/live";
import { mutationKey } from "@/domains/ui/contracts";
import LocalIdentity from "@/components/builder/LocalIdentity";
import { Activity, Connections, ProgressSummary, Sessions } from "@/components/mission/History";

export default function ProfilePage() {
  const { auth, authReady, profile: savedProfile, refreshAuth, refreshSnapshot, ready, loadingError, dataMode } = useStore();
  const [profile, setProfile] = useState(savedProfile);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (!dirty) setProfile(savedProfile); }, [savedProfile, dirty]);
  const update = (patch: Partial<typeof profile>) => { setProfile((old) => ({ ...old, ...patch })); setDirty(true); setNotice(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try { await persistProfile(profile); await refreshSnapshot(); setDirty(false); setNotice("Your preferences are saved."); }
    catch (err) { setError(err instanceof Error ? err.message : "Your preferences couldn't be saved."); }
    finally { setSaving(false); }
  };
  if (authReady && auth && !auth.authenticated && !auth.localProfilesEnabled) return <div className="mx-auto max-w-md p-8 text-center"><h1 className="text-2xl font-semibold">Your own space to learn.</h1><p className="mt-3 text-muted">Sign in to save your profile and questions.</p><Link href="/login" className="btn btn-primary mt-5">Sign in</Link></div>;
  if (!ready) return <div className="p-8 text-sm text-muted">{loadingError ?? "Loading your profile…"}</div>;
  return <div className="scroll h-full px-5 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-4xl">
    <div className="mb-8 flex items-center justify-between gap-4"><div><Link href="/" className="text-xs text-muted hover:text-text">← Back to learning</Link><h1 className="mt-3 text-3xl font-semibold">Your profile</h1><p className="mt-2 text-sm text-muted">A little context helps people and your guide meet you where you are.</p></div></div>
    {auth?.account && <AccountSettings account={auth.account} onSaved={async () => { await refreshAuth(); await refreshSnapshot(); }} />}
    {auth?.localProfilesEnabled && <details className="mb-6 rounded-xl border border-line p-4"><summary className="cursor-pointer text-sm text-muted">Local test profiles</summary><div className="mt-4"><LocalIdentity /></div></details>}
    {dataMode === "demo" && <p className="mb-5 text-sm text-warn">Sample profile. Return to your account’s saved data before editing.</p>}
    <section className="mb-6 rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="your-learning"><h2 id="your-learning" className="text-lg font-semibold">Your learning</h2><p className="mt-2 text-sm text-muted">Progress, recent activity and the people you’ve learned with. The map itself stays on the Map page.</p><div className="mt-5 grid gap-6 md:grid-cols-2"><div><h3 className="label mb-3">Progress</h3><ProgressSummary /></div><div><h3 className="label mb-3">Recent activity</h3><Activity /></div><div><h3 className="label mb-3">Sessions</h3><Sessions /></div><div><h3 className="label mb-3">Connections</h3><Connections /></div></div></section>
    <form onSubmit={(event) => void save(event)} className="space-y-6">
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold">Learning with others</h2><p className="mt-2 text-sm text-muted">You decide when you’re available. A conversation starts only after both people accept.</p></div><div className="space-y-5"><Toggle label="I'm open to a learning partner" hint="Let available learners with related interests find you." on={profile.openToMatch} onChange={(value) => update({ openToMatch: value })} /><Toggle label="I'm 18 or older" hint="This peer-learning pilot is for adults." on={profile.staticProfile.age18Plus} onChange={(value) => update({ staticProfile: { ...profile.staticProfile, age18Plus: value } })} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Language"><select className="field rounded-lg" value={profile.language} onChange={(event) => update({ language: event.target.value })}><option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option><option value="pa">ਪੰਜਾਬੀ</option><option value="ja">日本語</option></select></Field><Field label="Time available"><select className="field rounded-lg" value={profile.availableMinutes ?? 15} onChange={(event) => update({ availableMinutes: Number(event.target.value) })}>{[10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></Field></div></div></section>
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6"><h2 className="text-lg font-semibold">Where you’re starting from</h2><p className="mt-2 text-sm text-muted">Optional. Your background and preferences help shape explanations.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{!auth?.account && <Field label="Display name"><input className="field rounded-lg" value={profile.displayName} onChange={(event) => update({ displayName: event.target.value.slice(0, 40) })} /></Field>}<Field label="Role or interests"><input className="field rounded-lg" placeholder="What do you spend time doing?" value={profile.staticProfile.role} onChange={(event) => update({ staticProfile: { ...profile.staticProfile, role: event.target.value } })} /></Field><Field label="Preferred pace"><input className="field rounded-lg" placeholder="For example, one idea at a time" value={profile.preferences.pace} onChange={(event) => update({ preferences: { ...profile.preferences, pace: event.target.value, inferred: false } })} /></Field><div className="sm:col-span-2"><Field label="Anything useful about your background?"><textarea className="field min-h-24 resize-y rounded-lg" value={profile.staticProfile.background} onChange={(event) => update({ staticProfile: { ...profile.staticProfile, background: event.target.value } })} /></Field></div><Field label="What helps you learn?"><input className="field rounded-lg" placeholder="Examples, diagrams, trying things…" value={profile.preferences.style} onChange={(event) => update({ preferences: { ...profile.preferences, style: event.target.value, inferred: false } })} /></Field><Field label="Current learning goal"><textarea className="field min-h-20 resize-y rounded-lg" value={profile.currentIntent} onChange={(event) => update({ currentIntent: event.target.value })} /></Field></div></section>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className={`text-sm ${error ? "text-err" : "text-muted"}`} role={error ? "alert" : "status"}>{error ?? (saving ? "Saving your preferences…" : dirty ? "You have unsaved changes." : notice ?? "Your preferences are saved.")}</p><button className="btn btn-primary rounded-lg" disabled={!dirty || saving || dataMode === "demo"}>{saving ? "Saving…" : "Save preferences"}</button></div>
    </form>
    <ResetLearningMap />
    <div className="mt-10 border-t border-line pt-5 text-xs text-muted"><Link href="/architecture" className="underline underline-offset-4 hover:text-text">How Further works</Link><span className="mx-3">·</span>Your profile and conversations are saved with your account.</div>
  </div></div>;
}

interface Account { email: string; username: string; displayName: string; emailVerified: boolean; provider: "password" | "google" | "cognito" }
function ResetLearningMap() {
  const { dataMode, pendingWrites, missions, currentSessionId, match } = useStore();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = dataMode === "demo" ? "Return to your saved map before resetting it."
    : currentSessionId || match ? "Finish your conversation or resolve your invitation before resetting."
    : pendingWrites > 0 || missions.some(mission => mission.status === "running") ? "Wait for your current learning requests to finish before resetting." : null;
  const reset = async () => {
    if (!key || blocked || busy) return;
    setBusy(true); setError(null);
    try {
      await resetLearningMap(key);
      try { localStorage.setItem(MAP_RESET_KEY, mutationKey()); } catch { /* Hard navigation still clears this tab when browser storage is disabled. */ }
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your map couldn't be reset. Please retry.");
      setBusy(false);
    }
  };
  return <section className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="reset-learning-map">
    <h2 id="reset-learning-map" className="text-lg font-semibold">Reset your learning map</h2>
    <p className="mt-2 text-sm text-muted">Start again with an empty map. Your account, profile, uploaded images, and shared conversations stay.</p>
    {key ? <div className="mt-4 rounded-lg border border-err p-4" aria-label="Confirm map reset">
      <p className="text-sm">All your saved questions, map concepts, learning progress, and generated learning history will be permanently removed. This cannot be undone.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn rounded-lg text-err" disabled={busy || Boolean(blocked)} onClick={() => void reset()}>{busy ? "Resetting your map…" : error ? "Retry reset" : "Permanently reset my map"}</button>
        <button type="button" className="btn btn-ghost rounded-lg" disabled={busy} onClick={() => { setKey(null); setError(null); }}>Cancel</button>
      </div>
    </div> : <button type="button" className="btn mt-4 rounded-lg text-err" disabled={Boolean(blocked)} onClick={() => { setKey(mutationKey()); setError(null); }}>Reset learning map</button>}
    {blocked && <p className="mt-3 text-sm text-muted" role="status">{blocked}</p>}
    {error && <p className="mt-3 text-sm text-err" role="alert">{error}</p>}
  </section>;
}

function AccountSettings({ account, onSaved }: { account: Account; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(account.displayName), [username, setUsername] = useState(account.username);
  const [busy, setBusy] = useState(false), [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const dirty = name !== account.displayName || username !== account.username;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try { const response = await liveFetch("/api/auth/account", { method: "PATCH", body: JSON.stringify({ displayName: name.trim(), username: username.trim() }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Your account couldn't be updated."); await onSaved(); setSaved(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Your account couldn't be updated."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setLeaving(true); setError(null);
    try { const response = await liveFetch("/api/auth/logout", { method: "POST", body: "{}" }); if (!response.ok) throw new Error("Sign-out couldn't finish. Please try again."); const result = await response.json(); try { localStorage.setItem(MODE_KEY, "local"); localStorage.setItem(IDENTITY_CHANGE_KEY, String(Date.now())); } catch { /* hard navigation still clears this tab */ } window.location.replace(typeof result.logoutUrl === "string" ? result.logoutUrl : "/"); }
    catch (err) { setError(err instanceof Error ? err.message : "Sign-out couldn't finish."); setLeaving(false); }
  };
  return <section className="mb-6 rounded-2xl border border-line bg-panel p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Your account</h2><p className="mt-2 break-all text-sm text-muted">{account.email}</p><p className="mt-1 text-xs text-dim">{account.provider === "google" ? "Signed in with Google" : account.provider === "cognito" ? (account.emailVerified ? "Connected account" : "Connected account · email ownership isn't verified") : account.emailVerified ? "Email account" : "Email account · email ownership isn't verified"}</p></div><button className="btn btn-ghost rounded-lg text-muted" onClick={() => void logout()} disabled={leaving || busy}>{leaving ? "Signing out…" : "Sign out"}</button></div><form onSubmit={(event) => void save(event)} className="mt-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Your name"><input className="field rounded-lg" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required disabled={busy} autoComplete="name" /></Field><Field label="Username"><input className="field rounded-lg" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required disabled={busy} autoComplete="username" /></Field></div>{dirty && <button className="btn mt-4 rounded-lg" disabled={busy}>{busy ? "Saving…" : "Save account details"}</button>}{saved && !dirty && <p className="mt-3 text-xs text-mastery" role="status">Account details saved.</p>}{error && <p className="mt-3 text-sm text-err" role="alert">{error}</p>}</form></section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-muted">{label}</span>{children}</label>; }
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (value: boolean) => void; label: string; hint: string }) { return <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-start gap-3 text-left"><span className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 ${on ? "border-accent bg-accent-soft" : "border-line-2 bg-bg"}`}><span className={`h-4 w-4 rounded-full transition-transform ${on ? "translate-x-4 bg-accent" : "bg-dim"}`} /></span><span><span className="block text-sm">{label}</span><span className="mt-1 block text-xs text-muted">{hint}</span></span></button>; }
