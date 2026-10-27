import json
import os
import unittest
import urllib.error
from unittest.mock import patch

from further.ai import ProviderError, create_plan, validate_plan
from further.domain import Goal

GOAL = Goal("Why do GPUs help machine learning?", "beginner", "English", 15)
VALID = {"question": "Why do GPUs help machine learning?",
         "prompts": ["Explain your starting point.", "Compare a practical example.", "Explain it back without notes."],
         "check": "Give one example and one limitation."}


class Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, size):
        return json.dumps(self.payload).encode("utf-8")


class AITests(unittest.TestCase):
    def test_demo_mode_never_opens_a_network_connection(self):
        with patch.dict(os.environ, {}, clear=True), patch("urllib.request.build_opener") as opener:
            result = create_plan(GOAL)
        opener.assert_not_called()
        self.assertEqual(result["mode"], "demo")
        self.assertIsNone(result["model"])

    def test_output_schema_rejects_bad_values(self):
        for bad in ([], {}, dict(VALID, prompts=["one"]), dict(VALID, check=42),
                    dict(VALID, prompts=["okay prompt", {}, "third prompt"])):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                validate_plan(bad)

    def test_meta_request_keeps_key_server_side_and_parses_plan(self):
        envelope = {"choices": [{"message": {"content": json.dumps(VALID)}}]}
        with patch.dict(os.environ, {"FURTHER_AI_MODE": "meta", "MODEL_API_KEY": "test-only-value"}, clear=True):
            with patch("urllib.request.build_opener") as build:
                build.return_value.open.return_value = Response(envelope)
                result = create_plan(GOAL)
                request = build.return_value.open.call_args[0][0]
                self.assertEqual(request.full_url, "https://api.meta.ai/v1/chat/completions")
                self.assertEqual(request.get_header("Authorization"), "Bearer test-only-value")
                self.assertNotIn("test-only-value", json.dumps(result))
                self.assertEqual(json.loads(request.data)["max_completion_tokens"], 1500)
        self.assertEqual(result["mode"], "meta")
        self.assertEqual(result["prompts"], VALID["prompts"])

    def test_live_failures_do_not_silently_become_demo_output(self):
        with patch.dict(os.environ, {"FURTHER_AI_MODE": "meta", "MODEL_API_KEY": "test-only-value"}, clear=True):
            with patch("urllib.request.build_opener") as build:
                build.return_value.open.side_effect = urllib.error.HTTPError(
                    "https://api.meta.ai", 429, "rate limited", {}, None)
                with self.assertRaisesRegex(ProviderError, "HTTP 429"):
                    create_plan(GOAL)

    def test_missing_key_bad_endpoint_and_bad_mode_fail_before_network(self):
        cases = [
            {"FURTHER_AI_MODE": "meta"},
            {"FURTHER_AI_MODE": "unexpected"},
            {"FURTHER_AI_MODE": "meta", "MODEL_API_KEY": "test", "MODEL_API_BASE_URL": "http://example.com"},
            {"FURTHER_AI_MODE": "meta", "MODEL_API_KEY": "test", "MODEL_API_TIMEOUT_SECONDS": "0"},
        ]
        for env in cases:
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True):
                with patch("urllib.request.build_opener") as opener, self.assertRaises(ProviderError):
                    create_plan(GOAL)
                opener.assert_not_called()

    def test_malformed_live_content_is_an_error(self):
        with patch.dict(os.environ, {"FURTHER_AI_MODE": "meta", "MODEL_API_KEY": "test"}, clear=True):
            with patch("urllib.request.build_opener") as build:
                build.return_value.open.return_value = Response({"choices": [{"message": {"content": "not JSON"}}]})
                with self.assertRaisesRegex(ProviderError, "invalid session plan"):
                    create_plan(GOAL)


if __name__ == "__main__":
    unittest.main()
