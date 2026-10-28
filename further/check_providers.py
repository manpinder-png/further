"""Send one tiny request to each provider and print pass/fail, model and latency.

    python3 -m further.check_providers

Configured live providers receive one real, very small request (this can cost a
fraction of a cent). Providers without settings are reported as SKIP. Keys are
never printed.
"""

import sys
import time
from typing import Dict, List

from . import providers
from .server import load_local_env

SCHEMA = {"title": "health check", "type": "object", "required": ["ok"],
          "properties": {"ok": {"type": "boolean"}}}
SYSTEM = "You are a connectivity check. Reply with {\"ok\": true}."


def check(name: str) -> Dict[str, str]:
    started = time.monotonic()
    try:
        provider = (providers.DemoProvider(lambda: {"ok": True}) if name == "demo"
                    else providers.FACTORIES[name]())
    except providers.NotConfigured as error:
        return {"name": name, "status": "SKIP", "model": "-", "latency": "-", "note": str(error)}
    except providers.ProviderError as error:
        return {"name": name, "status": "FAIL", "model": "-", "latency": "-", "note": str(error)}
    try:
        data = provider.complete_json(SYSTEM, "ping", SCHEMA)
        ok = data.get("ok") is True
        note = "" if ok else "Replied, but not with ok=true."
    except providers.ProviderError as error:
        ok, note = False, str(error)
    latency = str(int((time.monotonic() - started) * 1000)) + "ms"
    return {"name": name, "status": "PASS" if ok else "FAIL", "model": provider.model or "(none, local)",
            "latency": latency, "note": note}


def main(argv: List[str] = None) -> int:
    load_local_env()
    try:
        order, strict = providers.provider_order()
        print("Active order: " + " -> ".join(order) + (" (strict, no fallback)" if strict else ""))
    except providers.ProviderError as error:
        print("Configuration error: " + str(error))
    rows = [check(name) for name in providers.DEFAULT_ORDER]
    widths = {"name": 10, "status": 6, "model": 28, "latency": 8}
    print("")
    print("  ".join(h.upper().ljust(w) for h, w in widths.items()) + "  NOTE")
    for row in rows:
        print("  ".join(row[h][:w].ljust(w) for h, w in widths.items()) + "  " + row["note"])
    live_pass = [r["name"] for r in rows if r["status"] == "PASS" and r["name"] != "demo"]
    print("")
    print("Live Meta-model providers working: " + (", ".join(live_pass) if live_pass else "none (demo only)"))
    return 1 if any(r["status"] == "FAIL" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
