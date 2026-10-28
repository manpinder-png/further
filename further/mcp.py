"""MCP endpoint stub (stretch): POST /mcp speaks a minimal JSON-RPC 2.0 subset.

It exposes two tools so Further could later be opened from an MCP client
(Muse, Claude, ChatGPT): share_my_intent and find_my_group. This is a local
stub only. It supports initialize, tools/list and tools/call, with no sessions,
streaming or auth, and it inherits the server's loopback-only checks.
"""

import json
from typing import Any, Dict, Optional

from .ai import ProviderError, create_profile
from .domain import Profile, pick_group

PROTOCOL_VERSION = "2025-06-18"
TOOLS = [
    {"name": "share_my_intent",
     "description": "Turn a vague learning intent into a Further profile (concept, sharpened question, tier).",
     "inputSchema": {"type": "object", "required": ["intent"],
                     "properties": {"intent": {"type": "string", "minLength": 3, "maxLength": 240}}}},
    {"name": "find_my_group",
     "description": "Find a small mixed-tier group of sample learners exploring the same concept now.",
     "inputSchema": {"type": "object", "required": ["profile"],
                     "properties": {"profile": {"type": "object"},
                                    "exclude": {"type": "array", "items": {"type": "string"}}}}},
]


def _result(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _tool_text(data: Dict[str, Any], is_error: bool = False) -> Dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(data)}], "isError": is_error}


def handle(body: Any) -> Optional[Dict[str, Any]]:
    """Return a JSON-RPC response, or None for a notification."""
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0" or not isinstance(body.get("method"), str):
        return _error(None, -32600, "Invalid JSON-RPC request.")
    request_id = body.get("id")
    method = body["method"]
    params = body.get("params") or {}
    if request_id is None:
        return None
    if method == "initialize":
        return _result(request_id, {"protocolVersion": PROTOCOL_VERSION,
                                    "capabilities": {"tools": {}},
                                    "serverInfo": {"name": "further-local-stub", "version": "0.1"}})
    if method == "tools/list":
        return _result(request_id, {"tools": TOOLS})
    if method != "tools/call":
        return _error(request_id, -32601, "Method not found.")
    if not isinstance(params, dict):
        return _error(request_id, -32602, "Params must be an object.")
    name = params.get("name")
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        return _error(request_id, -32602, "Arguments must be an object.")
    try:
        if name == "share_my_intent":
            return _result(request_id, _tool_text(create_profile(args.get("intent"))))
        if name == "find_my_group":
            group = pick_group(Profile.from_dict(args.get("profile")), args.get("exclude", []))
            return _result(request_id, _tool_text(group))
    except (ValueError, ProviderError) as error:
        return _result(request_id, _tool_text({"error": str(error)}, is_error=True))
    return _error(request_id, -32602, "Unknown tool.")
