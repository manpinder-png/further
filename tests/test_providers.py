import json
import os
import unittest
import urllib.error
from unittest.mock import patch

from further import providers
from further.ai import create_plan, create_profile
from further.domain import Goal
from further.providers import ProviderError, check_schema, complete_with_fallback, provider_order

GOAL = Goal("Why do GPUs help machine learning?", "beginner", "English", 15)
PLAN = {"question": "Why do GPUs help machine learning?",
        "prompts": ["Explain your starting point.", "Compare a practical example.", "Explain it back without notes."],
        "check": "Give one example and one limitation."}
PROFILE = {"focus_area": "GPUs & ML hardware", "concept": "GPU parallelism",
           "sharpened_question": "Why are GPUs faster than CPUs for training?", "tier": 2,
           "learning_style": "visual", "language": "English", "availability_minutes": 20}
TINY = {"title": "tiny", "type": "object", "required": ["ok"], "properties": {"ok": {"type": "boolean"}}}
ALL_LIVE = {
    "META_API_KEY": "meta-test-key",
    "FIREWORKS_API_KEY": "fw-test-key", "FIREWORKS_URL": "https://fireworks.test/v1", "FIREWORKS_MODEL": "llama-test",
    "BASETEN_API_KEY": "bt-test-key", "BASETEN_URL": "https://baseten.test/v1", "BASETEN_MODEL": "llama-test-2",
}


class Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, size):
        return json.dumps(self.payload).encode("utf-8")


def reply(content):
    return Response({"choices": [{"message": {"content": content if isinstance(content, str) else json.dumps(content)}}]})


class SchemaTests(unittest.TestCase):
    def test_accepts_valid_and_rejects_each_kind_of_mismatch(self):
        from further.ai import PLAN_SCHEMA, PROFILE_SCHEMA
        check_schema(PLAN, PLAN_SCHEMA)
        check_schema(PROFILE, PROFILE_SCHEMA)
        bad = [dict(PROFILE, tier="2"), dict(PROFILE, tier=9), dict(PROFILE, language="Klingon"),
               {k: v for k, v in PROFILE.items() if k != "concept"}, dict(PROFILE, concept=""), []]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                check_schema(value, PROFILE_SCHEMA)
        with self.assertRaises(ValueError):
            check_schema(dict(PLAN, prompts=["one", "two"]), PLAN_SCHEMA)
        with self.assertRaises(ValueError):
            check_schema({"ok": 1}, TINY)

    def test_code_fenced_json_is_accepted(self):
        self.assertEqual(providers.parse_json_content('```json\n{"ok": true}\n```'), {"ok": True})


class OrderTests(unittest.TestCase):
    def test_default_order_and_overrides(self):
        cases = [({}, (["meta", "fireworks", "baseten", "demo"], False)),
                 ({"FURTHER_PROVIDERS": "baseten, meta"}, (["baseten", "meta", "demo"], False)),
                 ({"FURTHER_PROVIDERS": "demo,fireworks"}, (["fireworks", "demo"], False)),
                 ({"FURTHER_AI_MODE": "demo", "FURTHER_PROVIDERS": "meta"}, (["demo"], False)),
                 ({"FURTHER_AI_MODE": "meta"}, (["meta"], True))]
        for env, expected in cases:
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True):
                self.assertEqual(provider_order(), expected)

    def test_unknown_provider_is_rejected(self):
        with patch.dict(os.environ, {"FURTHER_PROVIDERS": "meta,openai"}, clear=True):
            with self.assertRaises(ProviderError):
                provider_order()

    def test_health_summary_never_contains_key_values(self):
        with patch.dict(os.environ, ALL_LIVE, clear=True):
            summary = providers.describe_providers()
        self.assertEqual(summary["configured"], {"meta": True, "fireworks": True, "baseten": True, "demo": True})
        for value in ALL_LIVE.values():
            if "key" in value:
                self.assertNotIn(value, json.dumps(summary))


class FallbackTests(unittest.TestCase):
    def test_no_keys_means_demo_and_no_network(self):
        with patch.dict(os.environ, {}, clear=True), patch("urllib.request.build_opener") as opener:
            data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": True})
        opener.assert_not_called()
        self.assertEqual(data, {"ok": True})
        self.assertEqual(info["provider"], "demo")
        self.assertEqual(info["skipped"], ["meta", "fireworks", "baseten"])
        self.assertEqual(info["fallbacks"], [])

    def test_falls_through_in_order_on_error_timeout_and_invalid_output(self):
        with patch.dict(os.environ, ALL_LIVE, clear=True), patch("urllib.request.build_opener") as build:
            build.return_value.open.side_effect = [
                urllib.error.HTTPError("https://api.meta.ai", 500, "boom", {}, None),
                TimeoutError(),
                reply("not json at all"),
            ]
            with self.assertLogs("further.providers", "INFO") as logs:
                data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": True}, task="t")
            urls = [call[0][0].full_url for call in build.return_value.open.call_args_list]
        self.assertEqual(urls, ["https://api.meta.ai/v1/chat/completions",
                                "https://fireworks.test/v1/chat/completions",
                                "https://baseten.test/v1/chat/completions"])
        self.assertEqual(info["provider"], "demo")
        self.assertEqual([f["provider"] for f in info["fallbacks"]], ["meta", "fireworks", "baseten"])
        self.assertIn("HTTP 500", info["fallbacks"][0]["reason"])
        self.assertIn("provider=demo", logs.output[-1])
        for key in ("meta-test-key", "fw-test-key", "bt-test-key"):
            self.assertNotIn(key, "\n".join(logs.output) + json.dumps(info))

    def test_second_provider_serves_when_first_fails(self):
        with patch.dict(os.environ, ALL_LIVE, clear=True), patch("urllib.request.build_opener") as build:
            build.return_value.open.side_effect = [urllib.error.URLError("down"), reply({"ok": True})]
            data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": False})
            request = build.return_value.open.call_args[0][0]
        self.assertEqual(data, {"ok": True})
        self.assertEqual((info["provider"], info["model"]), ("fireworks", "llama-test"))
        self.assertEqual(request.get_header("Authorization"), "Bearer fw-test-key")
        payload = json.loads(request.data)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertIn("max_tokens", payload)

    def test_meta_uses_its_own_message_role_and_token_field(self):
        with patch.dict(os.environ, {"META_API_KEY": "k", "META_MODEL": "muse-test"}, clear=True):
            with patch("urllib.request.build_opener") as build:
                build.return_value.open.return_value = reply({"ok": True})
                data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": False})
                payload = json.loads(build.return_value.open.call_args[0][0].data)
        self.assertEqual((info["provider"], info["model"]), ("meta", "muse-test"))
        self.assertEqual(payload["messages"][0]["role"], "developer")
        self.assertIn("max_completion_tokens", payload)

    def test_schema_valid_but_semantically_bad_output_falls_through(self):
        with patch.dict(os.environ, {"META_API_KEY": "k"}, clear=True), patch("urllib.request.build_opener") as build:
            build.return_value.open.return_value = reply(dict(PLAN, question="     x      "))
            result = create_plan(GOAL)
        self.assertEqual(result["provider"], "demo")
        self.assertEqual(result["fallbacks"][0]["provider"], "meta")

    def test_partial_configuration_is_skipped_not_called(self):
        with patch.dict(os.environ, {"FIREWORKS_API_KEY": "k"}, clear=True), patch("urllib.request.build_opener") as opener:
            data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": True})
        opener.assert_not_called()
        self.assertIn("fireworks", info["skipped"])

    def test_non_https_url_counts_as_a_failure_before_network(self):
        env = {"FURTHER_PROVIDERS": "baseten", "BASETEN_API_KEY": "k", "BASETEN_URL": "http://plain.test", "BASETEN_MODEL": "m"}
        with patch.dict(os.environ, env, clear=True), patch("urllib.request.build_opener") as opener:
            data, info = complete_with_fallback("s", "u", TINY, demo=lambda: {"ok": True})
        opener.assert_not_called()
        self.assertIn("HTTPS", info["fallbacks"][0]["reason"])


class ProfileTaskTests(unittest.TestCase):
    def test_profile_from_model_adds_static_identity_and_provider_label(self):
        with patch.dict(os.environ, {"META_API_KEY": "k"}, clear=True), patch("urllib.request.build_opener") as build:
            build.return_value.open.return_value = reply(PROFILE)
            result = create_profile("gpus??")
            sent = json.loads(build.return_value.open.call_args[0][0].data)
        self.assertEqual(result["provider"], "meta")
        self.assertEqual(result["profile"]["concept"], "GPU parallelism")
        self.assertEqual(result["profile"]["name"], "Siri")
        self.assertIn("expertise_areas", result["profile"])
        self.assertEqual(json.loads(sent["messages"][1]["content"]), {"intent": "gpus??"})

    def test_demo_profile_and_bad_intent(self):
        with patch.dict(os.environ, {}, clear=True):
            result = create_profile("Studying for AWS Solutions Architect, 20 min")
            self.assertEqual(result["provider"], "demo")
            self.assertEqual(result["profile"]["focus_area"], "AWS certification")
            self.assertEqual(result["profile"]["availability_minutes"], 20)
            for bad in (None, "", "x" * 241, 42):
                with self.subTest(intent=bad), self.assertRaises(ValueError):
                    create_profile(bad)


if __name__ == "__main__":
    unittest.main()


class CheckProvidersTests(unittest.TestCase):
    def test_reports_pass_fail_and_skip_without_printing_keys(self):
        import io
        from contextlib import redirect_stdout
        from further import check_providers
        env = {"META_API_KEY": "meta-secret-value", "FIREWORKS_API_KEY": "fw-secret-value",
               "FIREWORKS_URL": "https://fireworks.test/v1", "FIREWORKS_MODEL": "llama-test"}
        out = io.StringIO()
        with patch.dict(os.environ, env, clear=True), patch("further.check_providers.load_local_env"), \
                patch("urllib.request.build_opener") as build, redirect_stdout(out):
            build.return_value.open.side_effect = [reply({"ok": True}),
                                                   urllib.error.HTTPError("u", 401, "no", {}, None)]
            code = check_providers.main([])
        text = out.getvalue()
        self.assertEqual(code, 1)
        self.assertRegex(text, r"meta\s+PASS\s+muse-spark-1.3")
        self.assertRegex(text, r"fireworks\s+FAIL")
        self.assertRegex(text, r"baseten\s+SKIP")
        self.assertRegex(text, r"demo\s+PASS")
        self.assertIn("Live Meta-model providers working: meta", text)
        self.assertNotIn("secret-value", text)
