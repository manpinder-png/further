"use client";
import { useEffect, useState } from "react";
import type { LocalIdentity as Identity } from "@/domains/ui/contracts";
import { changeIdentity, chooseDataMode, localIdentity } from "@/lib/client/live";
import { useStore } from "@/lib/client/store";
import { OperationStatus } from "@/components/activity/ActivityPanel";

/** Development-only UI; server must independently restrict persona switching to loopback. */
export default function LocalIdentity() {
  const { actorId, dataMode, profile } = useStore();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { localIdentity().then(setIdentity).catch((e: Error) => setError(e.message)); }, []);
  const change = async (value: { displayName: string } | { userId: string }) => {
    setBusy(true); setError(null);
    try {
      await changeIdentity(value);
      chooseDataMode("local");
      window.location.assign("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't switch local user."); setBusy(false); }
  };
  return (
    <section className="mb-4 rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Local development</h2>
      <p className="mt-1 text-xs text-muted">Profiles and conversations stay on this Mac. Use a separate browser profile for a second independent learner. Switching here changes this browser&apos;s identity.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-44 flex-1 text-xs text-muted">Active local learner
          <select className="field mt-1" value={actorId ?? identity?.actorId ?? ""} disabled={busy || !identity} onChange={(e) => { void change({ userId: e.target.value }); }}>
            {(identity?.personas ?? []).map((person) => <option key={person.id} value={person.id}>{person.id === actorId && dataMode === "local" ? profile.displayName : person.displayName}</option>)}
          </select>
        </label>
        <form className="flex min-w-56 flex-1 items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void change({ displayName: name.trim() }); }}>
          <label className="flex-1 text-xs text-muted">New local learner<input className="field mt-1" placeholder="Display name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn h-10" disabled={busy || !name.trim()}>Create</button>
        </form>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className="text-xs text-muted">Data mode: {dataMode === "demo" ? "explicit rehearsal" : "saved local data"}</span>
        <button className="btn btn-ghost text-xs" onClick={() => { chooseDataMode(dataMode === "demo" ? "local" : "demo"); window.location.assign("/"); }}>{dataMode === "demo" ? "Return to my saved map" : "Explore the sample map"}</button>
      </div>
      {error && <p className="mt-2 text-sm text-err" role="alert">{error}</p>}
      {busy && <div className="mt-3"><OperationStatus label="Changing this browser's learner" detail="Saving the local identity and reopening its independent learning map." /></div>}
    </section>
  );
}
