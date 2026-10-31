"use client";
// Ops: mission control for the system itself. Every agent, Meta model, requirement
// and production check from the plan, with its live/demo status and code location.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { FUNCTIONAL, META_MODELS, NONFUNCTIONAL, PIPELINE, TRUST, type Req, type Status } from "@/lib/requirements";

const TARGET = Date.parse("2026-11-04T23:00:00Z"); // Wed Nov 4, 6:00 PM ET (our target)
const DEADLINE = Date.parse("2026-11-05T02:00:00Z"); // 9:00 PM ET (official)

const ST: Record<Status, { label: string; cls: string }> = {
  live: { label: "Live", cls: "chip-ok" },
  ui: { label: "UI + demo", cls: "chip-signal" },
  stub: { label: "Stub", cls: "chip-demo" },
  todo: { label: "To do", cls: "" },
};

function useCountdown(to: number) {
  const [now, setNow] = useState(0); // set after mount so server and client HTML match
  useEffect(() => { setNow(Date.now()); const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  const d = now ? Math.max(0, to - now) : 0;
  return { d: Math.floor(d / 86_400_000), h: Math.floor(d / 3_600_000) % 24, m: Math.floor(d / 60_000) % 60, s: Math.floor(d / 1000) % 60 };
}

export default function Ops() {
  const { status } = useStore();
  const t = useCountdown(TARGET);
  const dl = useCountdown(DEADLINE);
  const mode = (key: string) => (key === "live" ? "live" : key === "lens" || key === "code" ? "n/a" : status ? (status as unknown as Record<string, string>)[key] ?? "n/a" : "…");
  const dot = (m: string) => (m === "live" ? "var(--color-ok)" : m === "demo" ? "var(--color-signal)" : m === "down" ? "var(--color-err)" : "var(--color-dim)");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        {/* Countdown */}
        <section className="mb-4 grid gap-px border border-line bg-line sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="bg-panel p-4">
            <h1 className="label mb-1">Ops · mission control</h1>
            <p className="font-sans text-[14px] text-muted">Every agent, Meta model and requirement in the build plan, where it lives in code, and whether it&apos;s live or running on labeled demo data.</p>
          </div>
          <div className="bg-panel p-4">
            <div className="text-[10px] tracking-[0.14em] text-muted">T− OUR TARGET · WED 6PM ET</div>
            <div className="pixel mt-1 text-[26px] tabular-nums text-signal">{t.d}D {pad(t.h)}:{pad(t.m)}:{pad(t.s)}</div>
          </div>
          <div className="bg-panel p-4">
            <div className="text-[10px] tracking-[0.14em] text-muted">T− OFFICIAL · WED 9PM ET</div>
            <div className="pixel mt-1 text-[26px] tabular-nums">{dl.d}D {pad(dl.h)}:{pad(dl.m)}:{pad(dl.s)}</div>
          </div>
        </section>

        {/* Pipeline */}
        <section className="mb-4 border border-line bg-panel">
          <header className="flex h-9 items-center justify-between border-b border-line px-3">
            <h2 className="label">Agent pipeline</h2>
            <span className="flex gap-3 text-[10px] text-muted"><span><span className="dot mr-1 bg-ok" />live</span><span><span className="dot mr-1 bg-signal" />demo</span><span><span className="dot mr-1 bg-dim" />n/a</span></span>
          </header>
          <div className="space-y-4 p-4">
            {PIPELINE.map((lane) => (
              <div key={lane.lane} className="grid gap-3 lg:grid-cols-[110px_1fr]">
                <div className="pt-2 text-[10.5px] uppercase tracking-[0.14em] text-muted">{lane.lane}</div>
                <ol className="flex flex-wrap items-stretch gap-y-2">
                  {lane.steps.map((s, i) => {
                    const m = mode(s.key);
                    return (
                      <li key={s.name + i} className="flex items-center">
                        <div className="min-w-[150px] border border-line-2 bg-bg px-3 py-2">
                          <div className="flex items-center gap-2 text-[11px] tracking-[0.1em]"><span className="dot" style={{ background: dot(m) }} />{s.name}</div>
                          <div className="mt-0.5 text-[10.5px] text-muted">{s.model}</div>
                          <div className="text-[10px] text-dim">{s.route}</div>
                        </div>
                        {i < lane.steps.length - 1 && <span className="px-1.5 text-dim">→</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Meta models */}
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center justify-between border-b border-line px-3"><h2 className="label">Meta AI stack</h2><span className="text-[10px] text-dim">25% of judging</span></header>
            <table className="w-full text-left text-[11.5px]">
              <tbody>
                {META_MODELS.map((m) => {
                  const st = mode(m.key);
                  return (
                    <tr key={m.model} className="border-b border-line last:border-b-0 align-top">
                      <td className="w-6 py-2 pl-3"><span className="dot" style={{ background: dot(st) }} /></td>
                      <td className="py-2 pr-2"><div className="text-text">{m.model}</div><div className="font-sans text-[12px] text-muted">{m.job}</div></td>
                      <td className="py-2 pr-3 text-right text-[10px] text-dim">{m.where}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-[10.5px] text-dim">Privacy: user data only goes to <span className="text-text">{status?.model ?? "muse-spark-1.3"}</span>. Contributor models are for dev and evals only.</p>
          </section>

          {/* Trust */}
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center justify-between border-b border-line px-3"><h2 className="label">Production trust · E9</h2><span className="text-[10px] text-dim">“holds up in production”</span></header>
            <ul>
              {TRUST.map((c) => (
                <li key={c.check} className="flex items-start gap-3 border-b border-line px-3 py-2 last:border-b-0">
                  <span className={`chip mt-0.5 w-[78px] justify-center ${ST[c.status].cls}`}>{ST[c.status].label}</span>
                  <div><div className="text-[12px]">{c.check}</div><div className="text-[10.5px] text-dim">{c.where}</div></div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <ReqTable title="Functional requirements" rows={FUNCTIONAL} />
        <ReqTable title="Non-functional requirements" rows={NONFUNCTIONAL} />

        <section className="border border-line bg-panel">
          <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Out of scope · roadmap</h2></header>
          <p className="p-3 font-sans text-[13px] text-muted">Paid SME tier (experts paid for 15-minute consults, matched by the same graph) · group lobbies · multi-university indexing · gamification · full voice calls · other domains</p>
        </section>
      </div>
    </div>
  );
}

function ReqTable({ title, rows }: { title: string; rows: Req[] }) {
  return (
    <section className="mb-4 border border-line bg-panel">
      <header className="flex h-9 items-center justify-between border-b border-line px-3">
        <h2 className="label">{title}</h2>
        <span className="text-[10px] text-dim">{rows.filter((r) => r.status === "live").length}/{rows.length} live</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[11.5px]">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-dim">
            <tr className="border-b border-line"><th className="px-3 py-2 font-normal">ID</th><th className="font-normal">Requirement</th><th className="font-normal">UI</th><th className="font-normal">Backend hook</th><th className="font-normal">Owner</th><th className="px-3 font-normal">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                <td className="px-3 py-2 text-signal">{r.id}</td>
                <td className="py-2 pr-3 font-sans text-[12.5px]">{r.name}</td>
                <td className="py-2 pr-3 text-muted">{r.ui}</td>
                <td className="py-2 pr-3 text-[10.5px] text-dim">{r.hook}</td>
                <td className="py-2 pr-3 text-muted">{r.owner}</td>
                <td className="px-3 py-2"><span className={`chip ${ST[r.status].cls}`}>{ST[r.status].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
