"""Meta-family model providers behind one interface, tried in order.

Every provider exposes complete_json(system, user, schema) -> dict. Each response is
checked against a small JSON-schema subset; in fallback mode any error or timeout moves
on to the next provider, and the deterministic demo provider always comes last.

Keys come only from the server environment and are never logged or returned.
"""

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

LOG = logging.getLogger("further.providers")
DEFAULT_ORDER = ("meta", "fireworks", "baseten", "demo")
MAX_RESPONSE_BYTES = 65536


class ProviderError(Exception):
    """An upstream failure safe to describe without credentials or response bodies."""


class NotConfigured(ProviderError):
    """The provider is missing a key, URL or model, so it is skipped."""


def check_schema(value: Any, schema: Dict[str, Any], path: str = "value") -> Any:
    """Validate the subset of JSON Schema used by Further. Raises ValueError."""
    kind = schema.get("type")
    if kind == "object":
        if not isinstance(value, dict):
            raise ValueError(path + " must be an object.")
        for key in schema.get("required", ()):
            if key not in value:
                raise ValueError(path + "." + key + " is missing.")
        for key, sub in schema.get("properties", {}).items():
            if key in value:
                check_schema(value[key], sub, path + "." + key)
    elif kind == "array":
        if not isinstance(value, list):
            raise ValueError(path + " must be a list.")
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", 100):
            raise ValueError(path + " has the wrong number of items.")
        for index, item in enumerate(value):
            check_schema(item, schema.get("items", {}), path + "[" + str(index) + "]")
    elif kind == "string":
        if not isinstance(value, str):
            raise ValueError(path + " must be text.")
        if not schema.get("minLength", 0) <= len(value.strip()) <= schema.get("maxLength", 10000):
            raise ValueError(path + " has the wrong length.")
    elif kind == "integer":
        if type(value) is not int:
            raise ValueError(path + " must be a whole number.")
        if not schema.get("minimum", value) <= value <= schema.get("maximum", value):
            raise ValueError(path + " is out of range.")
    elif kind == "boolean":
        if type(value) is not bool:
            raise ValueError(path + " must be true or false.")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(path + " is not an allowed value.")
    return value


def parse_json_content(content: Any) -> Any:
    """Parse a model message as JSON, tolerating a surrounding ``` code fence."""
    if not isinstance(content, str):
        raise ValueError("Model content must be text.")
    body = content.strip()
    if body.startswith("```"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
        body = body.rsplit("```", 1)[0]
    return json.loads(body)


def env(*names: str, default: str = "") -> str:
    """First non-empty value among the given environment variables."""
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return default


def timeout_seconds() -> float:
    raw = env("FURTHER_PROVIDER_TIMEOUT_SECONDS", "MODEL_API_TIMEOUT_SECONDS", default="10")
    try:
        value = float(raw)
    except ValueError:
        value = 0
    if not 1 <= value <= 60:
        raise ProviderError("FURTHER_PROVIDER_TIMEOUT_SECONDS must be between 1 and 60.")
    return value


def https_base(value: str, name: str) -> str:
    base = value.rstrip("/")
    parsed = urlsplit(base)
    if (parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password
            or parsed.query or parsed.fragment):
        raise ProviderError(name + " must be an HTTPS base URL.")
    return base


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a provider redirect while carrying an Authorization header."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ChatProvider:
    """One OpenAI-compatible chat-completions client, shared by every live provider."""

    def __init__(self, name: str, label: str, base_url: str, key: str, model: str,
                 system_role: str = "system", token_field: str = "max_tokens",
                 max_tokens: int = 1500, timeout: Optional[float] = None):
        self.name = name
        self.label = label
        self.base_url = base_url
        self._key = key
        self.model = model
        self.system_role = system_role
        self.token_field = token_field
        self.max_tokens = max_tokens
        self.timeout = timeout_seconds() if timeout is None else timeout

    def __repr__(self):
        return "ChatProvider(" + self.name + ", model=" + self.model + ")"

    def complete_json(self, system: str, user: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        instructions = (system + "\nReturn only one JSON object that matches this JSON schema, "
                        "with no prose and no code fences: " + json.dumps(schema))
        payload = {
            "model": self.model,
            "messages": [{"role": self.system_role, "content": instructions},
                         {"role": "user", "content": user}],
            self.token_field: self.max_tokens,
        }
        request = urllib.request.Request(
            self.base_url + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + self._key, "Content-Type": "application/json"},
            method="POST",
        )
        title = schema.get("title", "response")
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise ValueError("Response too large.")
            envelope = json.loads(raw.decode("utf-8"))
            data = parse_json_content(envelope["choices"][0]["message"]["content"])
            check_schema(data, schema)
            return data
        except urllib.error.HTTPError as error:
            raise ProviderError(self.label + " returned HTTP " + str(error.code)
                                + ". Check access, billing, and model configuration.")
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ProviderError(self.label + " could not be reached within the configured timeout.")
        except (ValueError, KeyError, IndexError, TypeError):
            raise ProviderError(self.label + " returned an invalid " + title + ".")


class DemoProvider:
    """Deterministic, local output. No network, no key, never fails."""

    name = "demo"
    label = "Demo"
    model = None

    def __init__(self, build: Callable[[], Dict[str, Any]]):
        self.build = build

    def complete_json(self, system: str, user: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        return check_schema(self.build(), schema)


def meta_provider() -> ChatProvider:
    # Meta Model API (Muse). Docs: https://dev.meta.ai/docs/quickstart and
    # https://dev.meta.ai/docs/protocols/chat-completions (URL and model checked Oct 27, 2026).
    # The MODEL_API_* names are the starter's original names and still work.
    key = env("META_API_KEY", "MODEL_API_KEY")
    if not key:
        raise NotConfigured("META_API_KEY is not set on the server.")
    base = https_base(env("META_API_URL", "MODEL_API_BASE_URL", default="https://api.meta.ai/v1"), "META_API_URL")
    model = env("META_MODEL", "MODEL_ID", default="muse-spark-1.3")
    return ChatProvider("meta", "Meta API", base, key, model,
                        system_role="developer", token_field="max_completion_tokens")


def openai_compatible(name: str, label: str, prefix: str, url_name: str) -> ChatProvider:
    key = env(prefix + "_API_KEY")
    base = env(url_name)
    model = env(prefix + "_MODEL")
    missing = [n for n, v in ((prefix + "_API_KEY", key), (url_name, base), (prefix + "_MODEL", model)) if not v]
    if missing:
        raise NotConfigured(label + " needs " + ", ".join(missing) + ".")
    return ChatProvider(name, label, https_base(base, url_name), key, model)


def fireworks_provider() -> ChatProvider:
    # TODO(fireworks): set FIREWORKS_URL (OpenAI-compatible base URL, without /chat/completions)
    # and FIREWORKS_MODEL (a Meta Llama model ID) from https://docs.fireworks.ai/ .
    # Nothing is defaulted here so we never call a guessed endpoint or model.
    return openai_compatible("fireworks", "Fireworks", "FIREWORKS", "FIREWORKS_URL")


def baseten_provider() -> ChatProvider:
    # TODO(baseten): set BASETEN_URL (OpenAI-compatible base URL, without /chat/completions)
    # and BASETEN_MODEL (a Meta Llama model ID) from https://docs.baseten.co/ .
    # Nothing is defaulted here so we never call a guessed endpoint or model.
    return openai_compatible("baseten", "Baseten", "BASETEN", "BASETEN_URL")


FACTORIES = {"meta": meta_provider, "fireworks": fireworks_provider, "baseten": baseten_provider}


def provider_order() -> Tuple[List[str], bool]:
    """Return (provider names, strict).

    FURTHER_AI_MODE=demo   -> demo only, no network (CI and offline use).
    FURTHER_AI_MODE=meta   -> Meta only and strict: failures are shown, never replaced by demo.
    unset                  -> FURTHER_PROVIDERS (default meta,fireworks,baseten,demo); demo always last.
    """
    mode = os.environ.get("FURTHER_AI_MODE", "").strip().lower()
    if mode == "demo":
        return ["demo"], False
    if mode == "meta":
        return ["meta"], True
    if mode:
        raise ProviderError("FURTHER_AI_MODE must be demo or meta, or unset to use FURTHER_PROVIDERS.")
    raw = os.environ.get("FURTHER_PROVIDERS", "").strip()
    names = [n.strip().lower() for n in raw.split(",") if n.strip()] if raw else list(DEFAULT_ORDER)
    for name in names:
        if name not in DEFAULT_ORDER:
            raise ProviderError("FURTHER_PROVIDERS has an unknown provider: " + name[:20] + ".")
    ordered = []
    for name in names:
        if name != "demo" and name not in ordered:
            ordered.append(name)
    return ordered + ["demo"], False


def describe_providers() -> Dict[str, Any]:
    """Safe summary for /api/health: names and whether each is configured. No values."""
    try:
        names, strict = provider_order()
    except ProviderError as error:
        return {"order": [], "strict": True, "error": str(error), "configured": {}}
    configured = {}
    for name in names:
        if name == "demo":
            configured[name] = True
            continue
        try:
            FACTORIES[name]()
            configured[name] = True
        except ProviderError:
            configured[name] = False
    return {"order": names, "strict": strict, "configured": configured}


def complete_with_fallback(system: str, user: str, schema: Dict[str, Any],
                           demo: Callable[[], Dict[str, Any]], task: str = "task",
                           validate: Optional[Callable[[Dict[str, Any]], Any]] = None
                           ) -> Tuple[Any, Dict[str, Any]]:
    """Try each provider in order. Returns (validated data, info about who served it)."""
    names, strict = provider_order()
    failures = []  # type: List[Dict[str, str]]
    skipped = []  # type: List[str]
    for name in names:
        started = time.monotonic()
        try:
            provider = DemoProvider(demo) if name == "demo" else FACTORIES[name]()
            data = provider.complete_json(system, user, schema)
            result = validate(data) if validate else data
        except NotConfigured as error:
            if strict:
                raise
            skipped.append(name)
            LOG.info("task=%s provider=%s skipped (not configured)", task, name)
            continue
        except (ProviderError, ValueError) as error:
            message = str(error) if isinstance(error, ProviderError) else (
                getattr(provider, "label", name) + " returned an invalid " + schema.get("title", "response") + ".")
            if strict:
                raise ProviderError(message + " No demo fallback was used.")
            failures.append({"provider": name, "reason": message})
            LOG.info("task=%s provider=%s failed: %s", task, name, message)
            continue
        latency = int((time.monotonic() - started) * 1000)
        LOG.info("task=%s provider=%s model=%s served in %dms", task, name, provider.model or "none", latency)
        return result, {"provider": name, "model": provider.model, "latency_ms": latency,
                        "fallbacks": failures, "skipped": skipped}
    raise ProviderError("No provider could complete the request.")
