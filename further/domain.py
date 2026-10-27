"""Input contracts and an explainable matching baseline."""

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Set

LEVELS = ("beginner", "intermediate", "advanced")
LANGUAGES = ("English", "Hindi", "Punjabi", "Spanish")
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "can", "do", "does", "for",
    "how", "i", "in", "is", "it", "learn", "me", "of", "on", "the", "to",
    "understand", "use", "useful", "want", "what", "why", "with",
}
ALIASES = {"gpus": "gpu", "tpus": "tpu", "joins": "join", "databases": "database"}


def text(value: Any, field: str, minimum: int, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(field + " must be text.")
    value = " ".join(value.split())
    if not minimum <= len(value) <= maximum:
        raise ValueError(field + " must be between " + str(minimum) + " and " + str(maximum) + " characters.")
    return value


@dataclass(frozen=True)
class Goal:
    topic: str
    level: str
    language: str
    minutes: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Goal":
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object.")
        topic = text(data.get("topic"), "Topic", 5, 240)
        level = data.get("level")
        language = data.get("language")
        minutes = data.get("minutes")
        if level not in LEVELS:
            raise ValueError("Choose a valid learning level.")
        if language not in LANGUAGES:
            raise ValueError("Choose a supported language.")
        if type(minutes) is not int or not 10 <= minutes <= 60:
            raise ValueError("Available time must be a whole number from 10 to 60 minutes.")
        return cls(topic, level, language, minutes)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


SAMPLE_PEERS = [
    {"id": "sample-lena", "name": "Lena", "topic": "Why GPUs make machine learning faster",
     "level": "intermediate", "language": "English", "minutes": 20, "sample": True},
    {"id": "sample-dev", "name": "Dev", "topic": "GPU and TPU basics for machine learning",
     "level": "beginner", "language": "English", "minutes": 15, "sample": True},
    {"id": "sample-noor", "name": "Noor", "topic": "Understanding SQL joins and database tables",
     "level": "advanced", "language": "English", "minutes": 25, "sample": True},
    {"id": "sample-meera", "name": "Meera", "topic": "GPU parallel computing and machine learning",
     "level": "intermediate", "language": "Hindi", "minutes": 20, "sample": True},
]


def tokens(value: str) -> Set[str]:
    return {
        ALIASES.get(word, word)
        for word in re.findall(r"[a-z0-9]+", value.lower())
        if word not in STOP_WORDS
    }


def rank_peers(goal: Goal, peers=None) -> List[Dict[str, Any]]:
    """Hard-filter language/time, then rank shared topic tokens and useful levels."""
    candidates = SAMPLE_PEERS if peers is None else peers
    topic_tokens = tokens(goal.topic)
    ranked = []
    for peer in candidates:
        if peer["language"] != goal.language or peer["minutes"] < goal.minutes:
            continue
        overlap = sorted(topic_tokens & tokens(peer["topic"]))
        if not overlap:
            continue
        distance = abs(LEVELS.index(goal.level) - LEVELS.index(peer["level"]))
        score = len(overlap) * 10 + (3 - distance)
        ranked.append(dict(peer, score=score, shared_terms=overlap,
                           reason="Shared concepts: " + ", ".join(overlap) + ". Same language; enough time."))
    return sorted(ranked, key=lambda peer: (-peer["score"], peer["id"]))


def sample_plan(goal: Goal) -> Dict[str, Any]:
    return {
        "question": goal.topic,
        "prompts": [
            "Each person: explain what you already understand and one point that is unclear.",
            "Compare one concrete example or analogy. Ask your partner to challenge it.",
            "Swap roles: explain the idea back without notes, then identify what is still uncertain.",
        ],
        "check": "In your own words, answer: " + goal.topic + " Give one example and one limitation.",
        "mode": "demo",
        "model": None,
    }
