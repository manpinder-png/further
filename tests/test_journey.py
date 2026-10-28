import unittest

from further.domain import (CLUSTERS, SAMPLE_LEARNERS, SAMPLE_PEERS, Profile, cluster_summary,
                            demo_profile, nearest_cluster, online_count, pick_group, wrap_up)


def profile(**overrides):
    data = Profile.from_generated(demo_profile("Why do GPUs matter for ML?")).to_dict()
    data.update(overrides)
    return Profile.from_dict(data)


class SampleDataTests(unittest.TestCase):
    def test_about_eighty_labelled_learners_across_eight_topics(self):
        self.assertEqual(len(CLUSTERS), 8)
        self.assertEqual(len(SAMPLE_LEARNERS), 80)
        self.assertTrue(all(learner["sample"] for learner in SAMPLE_LEARNERS))
        self.assertEqual(len({learner["id"] for learner in SAMPLE_LEARNERS}), 80)
        self.assertEqual(sum(c["size"] for c in cluster_summary()), 80)
        self.assertEqual(online_count(), sum(c["online"] for c in cluster_summary()))
        self.assertTrue(0 < online_count() < 80)

    def test_includes_senior_engineers_asking_beginner_questions(self):
        seniors = [l for l in SAMPLE_LEARNERS if l["experience_years"] >= 10 and l["tier"] == 1]
        self.assertGreaterEqual(len(seniors), 4)

    def test_original_four_sample_peers_are_unchanged(self):
        self.assertEqual([p["id"] for p in SAMPLE_PEERS], ["sample-lena", "sample-dev", "sample-noor", "sample-meera"])


class ProfileTests(unittest.TestCase):
    def test_demo_profile_heuristics(self):
        data = demo_profile("Hindi please: I never understood gradients, I like diagrams, 25 minutes")
        self.assertEqual(data["focus_area"], "Calculus for ML")
        self.assertEqual((data["tier"], data["learning_style"], data["language"], data["availability_minutes"]),
                         (1, "visual", "Hindi", 25))
        other = demo_profile("Growing sourdough starters")
        self.assertEqual(other["focus_area"], "Other")
        Profile.from_generated(other)

    def test_profile_validation_and_goal(self):
        p = profile(tier=3)
        self.assertEqual(p.goal().level, "intermediate")
        self.assertEqual(p.goal().topic, p.sharpened_question)
        for overrides in ({"tier": 0}, {"tier": "3"}, {"language": "French"}, {"learning_style": "osmosis"},
                          {"availability_minutes": 5}, {"expertise_areas": "GPUs"}, {"name": ""},
                          {"experience_years": -1}, {"concept": "x" * 81}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                profile(**overrides)
        with self.assertRaises(ValueError):
            Profile.from_generated("not a dict")


class ClusterTests(unittest.TestCase):
    def test_focus_area_then_keywords_then_fallback(self):
        self.assertEqual(nearest_cluster(profile())[0]["id"], "gpu")
        by_words = profile(focus_area="Other", concept="React hooks",
                           sharpened_question="When does useEffect run again?")
        self.assertEqual(nearest_cluster(by_words)[0]["id"], "react")
        nothing = profile(focus_area="Other", concept="Sourdough", sharpened_question="Why does dough rise?")
        cluster, reason = nearest_cluster(nothing)
        self.assertIn(cluster["id"], {c["id"] for c in CLUSTERS})
        self.assertIn("most active", reason)


class GroupTests(unittest.TestCase):
    def test_group_is_online_same_language_and_mixed_tiers(self):
        p = profile(tier=2)
        group = pick_group(p)
        members = group["members"]
        self.assertEqual(len(members), 4)
        self.assertTrue(all(m["online"] and m["language"] == "English" and m["cluster"] == "gpu" for m in members))
        tiers = {m["tier"] for m in members}
        self.assertTrue(any(t > 2 for t in tiers) and any(t <= 2 for t in tiers))
        self.assertTrue(all(m["explain_back"] and m["role_hint"] for m in members))
        self.assertTrue(group["sample"])
        self.assertEqual(len(group["script"]), 4)

    def test_find_another_group_prefers_new_people_and_is_deterministic(self):
        p = profile()
        first = pick_group(p)
        ids = [m["id"] for m in first["members"]]
        second = pick_group(p, ids)
        self.assertNotEqual(ids, [m["id"] for m in second["members"]])
        self.assertTrue(set(m["id"] for m in second["members"]) - set(ids))
        self.assertEqual(pick_group(p)["members"], first["members"])

    def test_language_is_a_hard_filter(self):
        group = pick_group(profile(language="Punjabi"))
        self.assertTrue(all(m["language"] == "Punjabi" for m in group["members"]))
        self.assertEqual(group["members"], [])
        self.assertIn("No sample learners", group["rationale"])
        self.assertEqual(group["script"], [])

    def test_bad_exclude(self):
        with self.assertRaises(ValueError):
            pick_group(profile(), "sample-gpu-1")


class WrapUpTests(unittest.TestCase):
    def setUp(self):
        self.p = profile(tier=2)
        self.ids = [m["id"] for m in pick_group(self.p)["members"]]

    def test_clear_explanation_raises_tier_and_reputation_separately(self):
        result = wrap_up(self.p, "GPUs run the same small multiply on thousands of cores at once, which is what training needs.",
                         self.ids, self.ids[:2])
        self.assertEqual((result["tier_before"], result["tier_after"]), (2, 3))
        self.assertEqual(result["marks_received"], 4)
        self.assertTrue(result["marks_simulated"])
        self.assertEqual(result["reputation_gained"], 40 + 6 + 5)
        self.assertEqual(result["entry"]["tier_after"], 3)
        self.assertNotIn("rank", str(result).lower())

    def test_short_explanation_does_not_level_up(self):
        result = wrap_up(self.p, "GPUs are fast", self.ids, [])
        self.assertEqual(result["tier_after"], 2)
        self.assertEqual(result["reputation_gained"], 0)

    def test_tier_caps_at_five(self):
        top = profile(tier=5)
        result = wrap_up(top, "one two three four five six seven eight nine ten eleven twelve", self.ids, [])
        self.assertEqual(result["tier_after"], 5)

    def test_rejects_bad_input(self):
        for args in (("x" * 401, self.ids, []), (None, self.ids, []), ("ok", ["sample-nobody"], []),
                     ("ok", self.ids, ["sample-ux-1"]), ("ok", "ids", [])):
            with self.subTest(args=args), self.assertRaises(ValueError):
                wrap_up(self.p, *args)


if __name__ == "__main__":
    unittest.main()
