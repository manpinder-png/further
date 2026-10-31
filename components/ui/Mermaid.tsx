"use client";
// Mermaid diagrams from the card agent (plan §5.3). Rendered client-side, lazily.
import { useEffect, useId, useState } from "react";

export default function Mermaid({ code, large = false }: { code: string; large?: boolean }) {
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
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          themeVariables: {
            darkMode: true, background: "#0a0a0b", primaryColor: "#16161a", primaryBorderColor: "#5a5a62",
            primaryTextColor: "#ece9e4", lineColor: "#a3a3ab", fontSize: "14px", secondaryColor: "#111113", tertiaryColor: "#111113",
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
  if (err) return <p className="text-xs text-muted">This diagram couldn&apos;t be drawn. Hidden rather than shown wrong.</p>;
  if (!svg) return <div className="scanbar h-24 bg-panel-2" aria-label="Drawing diagram" />;
  return <div className={`mermaid-wrap ${large ? "mermaid-large" : ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
