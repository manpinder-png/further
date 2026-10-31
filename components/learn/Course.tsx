"use client";
// Muse builds the course: 4 short lessons written for THIS learner, adapted
// to their strengths/pace/style (lib/learn.ts). Shared by the guided home
// and the inspector. The cited source is "go deeper", never the lesson.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { learnerModel } from "@/lib/learn";

interface CourseData {
  lessons: { title: string; body: string; format: string }[];
  adaptedNote: string;
  demo: boolean;
}

export default function Course({ slug, title, onDone }: { slug: string; title: string; onDone?: () => void }) {
  const { nodes, events, track, say } = useStore();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<{ score: number; feedback: string; demo: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    const r = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, transcript: answer.trim() }) });
    const d = await r.json();
    if (!r.ok) return;
    setGrade(d);
    track(slug, "explain", { score: d.score });
    say("GRADE", `${d.score}/3 · "${d.feedback}"`, "ok", d.demo);
  };

  useEffect(() => {
    setCourse(null);
    setError(null);
    setStep(0);
    setFinished(false);
    const learnerSummary = learnerModel(nodes, events).summary;
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    fetch("/api/course", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, learnerSummary }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = (await r.json()) as CourseData & { error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? `Course failed (${r.status})`);
        if (cancelled) return;
        setCourse(d);
        say("EXPAND", `Muse built a 4-lesson course for ${title}`, "ok", d.demo);
      })
      .catch((e: Error) => { if (!cancelled && e.name !== "AbortError") setError(e.message); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  if (error)
    return (
      <section className="border border-err/60 bg-panel px-4 py-4">
        <h4 className="label mb-2 !text-err">Muse couldn&apos;t write this lesson</h4>
        <p className="font-sans text-[14px] text-muted">{error}</p>
        <button className="btn mt-3 h-9 px-3" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </section>
    );

  if (!course)
    return (
      <section className="border border-line bg-panel px-4 py-4">
        <h4 className="label mb-2">Muse is writing your lesson…</h4>
        <div className="scanbar h-3 w-10/12 bg-panel-2" />
      </section>
    );

  const lesson = course.lessons[step];
  return (
    <section className="border border-signal/60 bg-panel px-4 py-4">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="label !text-signal">Built for you by Muse</h4>
        <span className="text-[11px] tabular-nums text-muted">
          {step + 1}/{course.lessons.length} · ~2 min
        </span>
      </div>
      <p className="mb-3 font-sans text-[13px] italic leading-relaxed text-muted">
        {course.adaptedNote}
        {course.demo && " (demo template — add your Meta key for a course Muse writes live)"}
      </p>
      <div className="mb-3 flex gap-1">
        {course.lessons.map((_, i) => (
          <span key={i} className={`h-1 flex-1 ${i <= step ? "bg-signal" : "bg-line"}`} />
        ))}
      </div>
      <h5 className="font-sans text-[20px] font-semibold leading-snug">{lesson.title}</h5>
      <p className="mt-2 font-sans text-[16px] leading-relaxed text-text/90">{lesson.body}</p>
      {finished ? (
        <div className="mt-4">
          <p className="font-sans text-[14px] text-ok">Done. Now say it back — Muse adapts your next steps from this.</p>
          {grade ? (
            <p className="mt-2 font-sans text-[14px]">{grade.score}/3 — {grade.feedback}{grade.demo && " (demo grader)"}</p>
          ) : (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void submitAnswer(); }}>
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={3000} placeholder="In my own words…" className="field h-10 flex-1 px-3 font-sans text-[14px]" aria-label="Explain it back" />
              <button className="btn h-10 px-3">Say it back</button>
            </form>
          )}
        </div>
      ) : step < course.lessons.length - 1 ? (
        <button className="btn btn-primary mt-4 h-11 px-5 text-[13px]" onClick={() => setStep(step + 1)}>
          Next bite →
        </button>
      ) : (
        <button
          className="btn btn-primary mt-4 h-11 px-5 text-[13px]"
          onClick={() => {
            setFinished(true);
            track(slug, "watch");
            say("SYSTEM", `course finished → mastery +0.2 on ${slug}`, "ok");
            onDone?.();
          }}
        >
          I get it ✓
        </button>
      )}
    </section>
  );
}
