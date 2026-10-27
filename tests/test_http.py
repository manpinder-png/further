import http.client
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from further.server import Handler

GOAL = {"topic": "GPU basics for machine learning", "level": "beginner", "language": "English", "minutes": 15}


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {"FURTHER_AI_MODE": "demo"})
        cls.env.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.env.stop()

    def request(self, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        request_headers = {"Content-Type": "application/json"}
        request_headers.update(headers or {})
        connection.request("POST" if body is not None else "GET", path, body=body, headers=request_headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_goal_to_matches_to_session_contract(self):
        status, _, body = self.request("/api/matches", json.dumps(GOAL))
        self.assertEqual(status, 200)
        matches = json.loads(body)
        self.assertTrue(matches["sample"])
        self.assertGreater(len(matches["matches"]), 0)
        status, _, body = self.request("/api/plan", json.dumps(GOAL))
        plan = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(plan["mode"], "demo")
        self.assertEqual(len(plan["prompts"]), 3)

    def test_static_allowlist_blocks_configuration_and_traversal(self):
        for path in ("/.env", "/README.md", "/../.env", "/%2e%2e/.env", "/further/ai.py"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)

    def test_rebinding_and_cross_origin_requests_are_rejected(self):
        self.assertEqual(self.request("/api/health", headers={"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.request("/api/plan", json.dumps(GOAL),
                                      {"Origin": "https://attacker.example"})[0], 403)

    def test_invalid_inputs_and_large_bodies(self):
        self.assertEqual(self.request("/api/matches", "{bad json")[0], 400)
        self.assertEqual(self.request("/api/matches", json.dumps(dict(GOAL, minutes=True)))[0], 400)
        self.assertEqual(self.request("/api/matches", "x" * 8193)[0], 413)
        self.assertEqual(self.request("/api/matches", "{}", {"Content-Type": "text/plain"})[0], 415)

    def test_home_page_security_headers_and_mode_label(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"sample peers", body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
