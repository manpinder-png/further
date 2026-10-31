"use client";
// Mermaid flowcharts from Muse Spark (plan §5.3). Rendered client-side, lazily.
import { useEffect, useId, useState } from "react";

export default function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = (await import("mermaid")).default;
        m.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "var(--font-geist-mono), monospace",
          themeVariables: {
            darkMode: true, background: "#0a0a0b", primaryColor: "#16161a", primaryBorderColor: "#f26b1d",
            primaryTextColor: "#ece9e4", lineColor: "#85858c", fontSize: "12px", secondaryColor: "#111113", tertiaryColor: "#111113",
          },
        });
        const out = await m.render(`m${id}`, code);
        if (alive) setSvg(out.svg);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => { alive = false; };
  }, [code, id]);
  if (err) return <p className="text-[11px] text-muted">Diagram failed to render. Hidden rather than shown wrong.</p>;
  if (!svg) return <div className="scanbar h-24 bg-panel-2" aria-label="Rendering diagram" />;
  return <div className="mermaid-wrap" dangerouslySetInnerHTML={{ __html: svg }} />;
}
