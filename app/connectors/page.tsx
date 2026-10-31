"use client";
// F10 / E8: MCP connector console. Calls the real /api/mcp route with JSON-RPC,
// so add_curiosity here grows the map in any open tab (demo step 5).
import { useEffect, useState } from "react";
import { TOOLS } from "@/lib/mcp-tools";
import { Demo } from "@/components/ui/bits";

export default function Connectors() {
  const [tool, setTool] = useState(TOOLS[0].name);
  const [arg, setArg] = useState("what is HBM memory");
  const [token, setToken] = useState("fur_demo_7f3a9c");
  const [io, setIo] = useState<{ req: string; res: string; status: number; ms: number } | null>(null);
  const t = TOOLS.find((x) => x.name === tool)!;
  const argKey = Object.keys(t.inputSchema.properties)[0];

  const call = async () => {
    const body = { jsonrpc: "2.0", id: Date.now() % 1000, method: "tools/call", params: { name: tool, arguments: argKey ? { [argKey]: arg } : {} } };
    const t0 = performance.now();
    const r = await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    setIo({ req: JSON.stringify(body, null, 2), res: JSON.stringify(await r.json(), null, 2), status: r.status, ms: Math.round(performance.now() - t0) });
  };
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="scroll grid-bg h-full">
      <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center justify-between border-b border-line px-3"><h1 className="label">MCP server</h1><span className="chip chip-ok"><span className="dot bg-ok" />Online</span></header>
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 p-4 text-[12px]">
              <dt className="text-muted">Endpoint</dt><dd className="break-all text-signal">{origin}/api/mcp</dd>
              <dt className="text-muted">Transport</dt><dd>JSON-RPC over HTTP POST <span className="text-dim">(→ Streamable HTTP via official TS SDK)</span></dd>
              <dt className="text-muted">Auth</dt><dd>Bearer per-user token</dd>
              <dt className="text-muted">Meta AI</dt><dd className="flex items-center gap-2">Connectors early access <span className="chip">Applied · waiting</span></dd>
            </dl>
          </section>
          <section className="border border-line bg-panel">
            <header className="flex h-9 items-center border-b border-line px-3"><h2 className="label">Tools</h2></header>
            <ul>
              {TOOLS.map((x) => (
                <li key={x.name}>
                  <button onClick={() => { setTool(x.name); setArg(x.name === "find_peers" ? "cuda" : x.name === "add_curiosity" ? "what is HBM memory" : ""); }} className={`w-full border-b border-line px-4 py-2.5 text-left last:border-b-0 ${tool === x.name ? "bg-signal-dim" : "hover:bg-panel-2"}`}>
                    <div className={`text-[12.5px] ${tool === x.name ? "text-signal" : ""}`}>{x.name}({Object.keys(x.inputSchema.properties).join(", ")})</div>
                    <div className="font-sans text-[12px] text-muted">{x.description}</div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="border border-line bg-panel p-4 text-[11px] text-muted">
            <h2 className="label mb-2">Client config</h2>
            <pre className="overflow-x-auto border border-line bg-bg p-3 text-[11px] text-text">{`{
  "mcpServers": {
    "further": {
      "url": "${origin}/api/mcp",
      "headers": { "Authorization": "Bearer <your token>" }
    }
  }
}`}</pre>
          </section>
        </div>

        <section className="flex min-h-[420px] flex-col border border-line bg-panel">
          <header className="flex h-9 items-center justify-between border-b border-line px-3"><h2 className="label">Console</h2><span className="text-[10px] text-dim">tip: keep the Map open in another tab</span></header>
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex gap-2">
              <input className="field font-mono" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Token" />
              <button className="btn" onClick={() => setToken("bad_token")} title="Check that invalid tokens are rejected">Try bad token</button>
            </div>
            <div className="flex gap-2">
              <span className="field flex w-auto shrink-0 items-center text-signal">{tool}</span>
              {argKey ? <input className="field font-sans" value={arg} onChange={(e) => setArg(e.target.value)} placeholder={argKey} aria-label={argKey} /> : <span className="field text-dim">no arguments</span>}
              <button className="btn btn-primary" onClick={call}>Call</button>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-2 text-[11px]">
            <div className="min-h-0 border-b border-line p-3"><div className="label mb-1">Request</div><pre className="scroll max-h-full text-muted">{io?.req ?? "—"}</pre></div>
            <div className="min-h-0 p-3">
              <div className="mb-1 flex items-center gap-2"><span className="label">Response</span>{io && <span className={`chip ${io.status === 200 ? "chip-ok" : "chip-err"}`}>{io.status} · {io.ms}ms</span>}{tool !== "add_curiosity" && <Demo />}</div>
              <pre className="scroll max-h-full whitespace-pre-wrap text-text">{io?.res ?? "—"}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
