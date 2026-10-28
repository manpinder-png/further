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

    def test_journey_routes_end_to_end_in_demo_mode(self):
        status, _, body = self.request("/api/learners")
        learners = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(len(learners["learners"]), 80)
        self.assertTrue(learners["sample"])
        self.assertEqual(len(learners["clusters"]), 8)

        status, _, body = self.request("/api/profile", json.dumps({"intent": "why do GPUs matter for ML"}))
        made = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(made["provider"], "demo")
        profile = dict(made["profile"], tier=2)

        status, _, body = self.request("/api/placement", json.dumps({"profile": profile}))
        self.assertEqual((status, json.loads(body)["cluster"]), (200, "gpu"))

        status, _, body = self.request("/api/group", json.dumps({"profile": profile, "exclude": []}))
        group = json.loads(body)
        self.assertEqual(status, 200)
        ids = [m["id"] for m in group["members"]]
        self.assertEqual(len(ids), 4)

        status, _, body = self.request("/api/wrapup", json.dumps({
            "profile": profile, "members": ids, "marked": ids[:1],
            "explanation": "Thousands of simple cores run the same multiply in parallel for training."}))
        result = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(result["tier_after"], 3)

    def test_journey_routes_reject_bad_bodies(self):
        for path, body in (("/api/profile", {"intent": 7}), ("/api/profile", []),
                           ("/api/group", {"profile": {"name": "x"}}), ("/api/placement", {}),
                           ("/api/wrapup", {"profile": None})):
            with self.subTest(path=path):
                self.assertEqual(self.request(path, json.dumps(body))[0], 400)

    def test_health_lists_providers_without_secrets(self):
        status, _, body = self.request("/api/health")
        health = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(health["ai_mode"], "demo")
        self.assertEqual(health["providers"]["order"], ["demo"])

    def test_mcp_stub_lists_and_calls_tools(self):
        def rpc(method, params=None, request_id=1):
            body = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
            status, _, raw = self.request("/mcp", json.dumps(body))
            self.assertEqual(status, 200)
            return json.loads(raw)
        self.assertIn("protocolVersion", rpc("initialize")["result"])
        names = [tool["name"] for tool in rpc("tools/list")["result"]["tools"]]
        self.assertEqual(names, ["share_my_intent", "find_my_group"])
        shared = rpc("tools/call", {"name": "share_my_intent", "arguments": {"intent": "React hooks basics"}})
        profile = json.loads(shared["result"]["content"][0]["text"])["profile"]
        self.assertEqual(profile["focus_area"], "React basics")
        group = rpc("tools/call", {"name": "find_my_group", "arguments": {"profile": profile}})
        self.assertTrue(json.loads(group["result"]["content"][0]["text"])["sample"])
        bad = rpc("tools/call", {"name": "share_my_intent", "arguments": {"intent": 3}})
        self.assertTrue(bad["result"]["isError"])
        self.assertEqual(rpc("nope")["error"]["code"], -32601)
        self.assertEqual(rpc("tools/call", {"name": "delete_everything"})["error"]["code"], -32602)
        self.assertEqual(self.request("/mcp", json.dumps({"id": 1}))[0], 200)
        self.assertEqual(self.request("/mcp", json.dumps({}), {"Origin": "https://attacker.example"})[0], 403)

    def test_map_script_is_served(self):
        status, headers, _ = self.request("/map.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])

    def test_home_page_security_headers_and_mode_label(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"sample peers", body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
