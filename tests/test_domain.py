import unittest

from further.domain import Goal, rank_peers


def goal(**overrides):
    data = {"topic": "Why are GPUs useful for machine learning?", "level": "beginner",
            "language": "English", "minutes": 15}
    data.update(overrides)
    return Goal.from_dict(data)


class GoalTests(unittest.TestCase):
    def test_whitespace_is_normalized(self):
        self.assertEqual(goal(topic="  GPU   parallel computing ").topic, "GPU parallel computing")

    def test_bad_request_types_are_rejected(self):
        for payload in (None, [], "GPU"):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                Goal.from_dict(payload)
        for invalid in (True, 15.5, "15", 0, 61):
            with self.subTest(minutes=invalid), self.assertRaises(ValueError):
                goal(minutes=invalid)
        for overrides in ({"topic": "GPU"}, {"topic": "x" * 241},
                          {"level": "expert"}, {"language": "Unknown"}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                goal(**overrides)


class MatchingTests(unittest.TestCase):
    def test_language_and_time_are_hard_requirements(self):
        matches = rank_peers(goal(language="Hindi", minutes=20))
        self.assertEqual([peer["id"] for peer in matches], ["sample-meera"])
        self.assertEqual(rank_peers(goal(minutes=30)), [])

    def test_unrelated_topics_do_not_match_just_on_level(self):
        self.assertEqual(rank_peers(goal(topic="Growing sourdough starters")), [])

    def test_aliases_and_explanation(self):
        matches = rank_peers(goal(topic="GPU computing"))
        self.assertTrue(matches)
        self.assertIn("gpu", matches[0]["shared_terms"])
        self.assertTrue(matches[0]["sample"])
        self.assertIn("enough time", matches[0]["reason"])

    def test_results_are_stable_and_fixture_data_is_not_mutated(self):
        first = rank_peers(goal())
        first[0]["name"] = "changed"
        second = rank_peers(goal())
        self.assertNotEqual(second[0]["name"], "changed")
        self.assertEqual([peer["id"] for peer in second],
                         [peer["id"] for peer in rank_peers(goal())])


if __name__ == "__main__":
    unittest.main()
