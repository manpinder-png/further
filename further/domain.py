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


# ---------------------------------------------------------------------------
# User journey: profile, ~80 sample learners in 8 topic clusters, groups, wrap-up.
# Everything below is sample data or deterministic logic. Nothing is persisted.
# ---------------------------------------------------------------------------

LEARNING_STYLES = ("visual", "hands-on", "discussion", "reading")
GENERATED_FIELDS = ("focus_area", "concept", "sharpened_question", "tier", "learning_style",
                    "language", "availability_minutes")
# The demo user's fixed identity. Editable on the profile card; never sent to a provider.
STATIC_PROFILE = {"name": "Siri", "experience_years": 6,
                  "expertise_areas": ["Product design", "Frontend", "User research"]}


def whole(value: Any, field: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(field + " must be a whole number from " + str(minimum) + " to " + str(maximum) + ".")
    return value


def tier_level(tier: int) -> str:
    return "beginner" if tier <= 2 else "intermediate" if tier == 3 else "advanced"


@dataclass(frozen=True)
class Profile:
    name: str
    experience_years: int
    expertise_areas: tuple
    focus_area: str
    concept: str
    sharpened_question: str
    tier: int
    learning_style: str
    language: str
    availability_minutes: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Profile":
        if not isinstance(data, dict):
            raise ValueError("Expected a profile object.")
        areas = data.get("expertise_areas")
        if not isinstance(areas, list) or len(areas) > 6:
            raise ValueError("Expertise areas must be a list of up to six items.")
        style = data.get("learning_style")
        language = data.get("language")
        if style not in LEARNING_STYLES:
            raise ValueError("Choose a valid learning style.")
        if language not in LANGUAGES:
            raise ValueError("Choose a supported language.")
        return cls(
            name=text(data.get("name"), "Name", 1, 40),
            experience_years=whole(data.get("experience_years"), "Experience", 0, 60),
            expertise_areas=tuple(text(item, "Expertise area", 1, 40) for item in areas),
            focus_area=text(data.get("focus_area"), "Focus area", 2, 60),
            concept=text(data.get("concept"), "Concept", 2, 80),
            sharpened_question=text(data.get("sharpened_question"), "Sharpened question", 5, 240),
            tier=whole(data.get("tier"), "Tier", 1, 5),
            learning_style=style,
            language=language,
            availability_minutes=whole(data.get("availability_minutes"), "Availability", 10, 60),
        )

    @classmethod
    def from_generated(cls, data: Any) -> "Profile":
        """Model or demo output plus the static identity fields."""
        if not isinstance(data, dict):
            raise ValueError("Expected a profile object.")
        merged = dict(STATIC_PROFILE)
        merged.update({key: data.get(key) for key in GENERATED_FIELDS})
        return cls.from_dict(merged)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["expertise_areas"] = list(self.expertise_areas)
        return data

    def goal(self) -> Goal:
        return Goal(self.sharpened_question, tier_level(self.tier), self.language, self.availability_minutes)


def _cluster(cid, label, concept, question, keywords, example, takeaways):
    return {"id": cid, "label": label, "concept": concept, "question": question,
            "keywords": tokens(keywords), "example": example, "takeaways": takeaways}


CLUSTERS = [
    _cluster("gpu", "GPUs & ML hardware", "GPU parallelism",
             "Why do GPUs train neural networks so much faster than CPUs?",
             "gpu tpu cuda hardware parallel parallelism chip accelerator kernel memory bandwidth fp16 precision",
             "Picture thousands of small workers each doing one multiply at the same time, instead of one fast worker doing them in a row.",
             ["Training is mostly huge matrix multiplies, and GPUs do thousands of those small multiplies in parallel.",
              "A CPU has a few fast cores; a GPU has thousands of simple ones, which suits identical maths on lots of data.",
              "The catch is memory: if data can't reach the cores fast enough, the extra parallelism sits idle.",
              "GPUs win when the work is the same operation repeated over big batches, which is exactly what neural nets do."]),
    _cluster("calculus", "Calculus for ML", "gradients and the chain rule",
             "How does the chain rule let backpropagation compute gradients layer by layer?",
             "calculus derivative derivatives gradient gradients backprop backpropagation chain rule jacobian integral descent partial loss math",
             "Think of a mountain in fog: the gradient is the slope under your feet, and you step downhill a little at a time.",
             ["A gradient tells you which direction makes the loss grow fastest, so training steps the opposite way.",
              "The chain rule multiplies each layer's local slope together, so backprop can reuse work from the layer after it.",
              "The learning rate is the step size; too big and you overshoot the valley, too small and you crawl.",
              "Vanishing gradients happen when many small slopes multiply into almost nothing for early layers."]),
    _cluster("aws", "AWS certification", "IAM roles and policies",
             "How do IAM roles, policies and trust relationships fit together?",
             "aws certification certified cloud exam architect associate practitioner iam s3 ec2 lambda vpc subnet subnets region regions az nacl",
             "A role is a hat anyone trusted can put on; the policy is the list of doors that hat opens.",
             ["Policies say what actions are allowed; roles bundle policies so a service or person can borrow them.",
              "The trust policy decides who may assume a role; the permissions policy decides what they can do once they have.",
              "Users are long-lived identities; roles hand out short-lived credentials, which is why the exam prefers roles.",
              "Least privilege means starting from nothing and adding only the actions the workload needs."]),
    _cluster("react", "React basics", "state and re-rendering",
             "When does a React component re-render, and why does state cause it?",
             "react component components hook hooks jsx state props frontend useeffect usestate render rendering memo",
             "A component is a recipe: change an ingredient (state or props) and React cooks the dish again.",
             ["A component re-renders when its state or its parent's render changes the props it receives.",
              "Props come from the parent and are read-only; state belongs to the component and changes over time.",
              "useEffect runs after render, and its dependency list says which values should trigger it again.",
              "Re-rendering is usually cheap; React only touches the parts of the page that actually changed."]),
    _cluster("design", "System design", "caching and load balancing",
             "Where should a cache sit in a read-heavy system, and what breaks when it's stale?",
             "system design scaling scale load balancer cache caching sharding shard distributed queue queues consistent hashing cap rate limiting latency throughput",
             "A cache is the sticky note on your monitor: fast to read, but only useful if someone updates it.",
             ["Put the cache in front of the slowest, most-read thing, and decide up front how stale is acceptable.",
              "A load balancer spreads requests so no single server becomes the bottleneck or the single point of failure.",
              "Write-through keeps cache and database in step on every write; write-back is faster but can lose data.",
              "Every layer you add for speed adds a way for data to disagree, so name the trade-off out loud."]),
    _cluster("dataviz", "Data visualization", "choosing the right chart",
             "How do you pick the chart type that makes one comparison obvious?",
             "visualization visualisation viz chart charts plot plots dashboard dashboards d3 pie bar line color colour storytelling",
             "Decide the one sentence the reader should say after looking, then pick the chart that makes that sentence obvious.",
             ["Pick the chart from the comparison: bars for amounts, lines for change over time, dots for relationships.",
              "Position is read more accurately than area or colour, which is why bar charts beat pie charts for most jobs.",
              "Colour should carry meaning, not decoration, and the chart should still work for colour-blind readers.",
              "A good dashboard answers a few named questions; everything else is noise someone has to ignore."]),
    _cluster("llm", "Open-weight LLMs", "quantization and running models locally",
             "What do you lose when you quantize an open-weight model to run it locally?",
             "llm llms llama open weight weights model models fine tuning finetuning lora quantization quantize quantized inference token tokens context hallucinate prompting transformer",
             "Quantizing is like saving a photo at lower quality: much smaller, mostly the same, but fine detail can blur.",
             ["Open-weight means you can download and run the trained model, even if the training data isn't public.",
              "Quantization stores weights with fewer bits, so the model fits in less memory at some cost in accuracy.",
              "LoRA fine-tuning trains a small add-on instead of every weight, which makes adapting a model cheap.",
              "Longer context costs more because attention compares every token with every other token."]),
    _cluster("ux", "Career switching into UX", "building a UX portfolio",
             "What makes a UX case study convincing when you're switching careers?",
             "ux career switch switching portfolio case study research usability wireframe wireframes prototype prototypes designer interview job role accessibility",
             "A case study is a story about a decision: what you saw, what you tried, and what changed because of it.",
             ["A strong case study shows your reasoning and the trade-offs, not just the final screens.",
              "Career switchers should reuse past work: any project where you found a user problem and tested a fix counts.",
              "Research doesn't need a big budget; five usability sessions find most of the obvious problems.",
              "Hiring managers look for how you decide, so explain why you rejected the options you didn't ship."]),
]
CLUSTER_BY_ID = {cluster["id"]: cluster for cluster in CLUSTERS}

# (first name, one-line intent, tier on this cluster's concept 1-5, experience years,
#  learning style, minutes available, language). All fictional sample learners.
_LEARNERS = {
    "gpu": [
        ("Lena", "Why do GPUs make matrix multiplication so fast?", 3, 4, "visual", 20, "English"),
        ("Dev", "GPU vs TPU: when would I pick one over the other?", 2, 1, "discussion", 15, "English"),
        ("Meera", "How GPU memory bandwidth limits model training", 3, 5, "reading", 20, "Hindi"),
        ("Tomas", "Principal engineer, 18 years in databases. What actually is a CUDA kernel?", 1, 18, "hands-on", 30, "English"),
        ("Aiko", "Why batch size changes GPU utilization", 4, 7, "hands-on", 25, "English"),
        ("Rafael", "What makes an ML accelerator different from a GPU?", 2, 3, "discussion", 15, "Spanish"),
        ("Priya", "Mixed-precision training: why does fp16 help?", 4, 6, "reading", 20, "English"),
        ("Sam", "Want to explain GPU parallelism to my team without hand-waving", 5, 11, "discussion", 30, "English"),
        ("Jonas", "Why do people say LLM inference is memory-bound?", 3, 5, "visual", 15, "English"),
        ("Harleen", "GPU basics for someone coming from web development", 1, 2, "visual", 20, "Punjabi"),
    ],
    "calculus": [
        ("Grace", "I never understood what a gradient actually points at", 1, 2, "visual", 20, "English"),
        ("Omar", "Chain rule intuition for backprop", 2, 3, "discussion", 15, "English"),
        ("Wei", "Staff SRE, 15 years. Never took calculus; want derivatives from zero", 1, 15, "hands-on", 30, "English"),
        ("Sofia", "Why gradient descent needs a learning rate", 3, 4, "visual", 20, "Spanish"),
        ("Ananya", "Partial derivatives for loss functions", 3, 3, "reading", 25, "English"),
        ("Marcus", "I can explain backprop; want to get better at teaching it", 5, 9, "discussion", 30, "English"),
        ("Kiran", "What's a Jacobian and why does it show up in ML?", 4, 6, "reading", 20, "Hindi"),
        ("Elena", "Vanishing gradients: what is actually vanishing?", 3, 5, "discussion", 15, "English"),
        ("Ben", "Derivatives refresher before an ML course", 2, 1, "hands-on", 20, "English"),
        ("Nadia", "Integrals vs derivatives: which one does ML use?", 1, 0, "visual", 15, "English"),
    ],
    "aws": [
        ("Carlos", "Studying for Solutions Architect Associate; VPC subnets confuse me", 2, 3, "visual", 30, "Spanish"),
        ("Hannah", "IAM roles vs users vs policies", 1, 1, "discussion", 20, "English"),
        ("Raj", "S3 storage classes for the exam", 3, 4, "reading", 15, "English"),
        ("Yuki", "When to pick Lambda over containers", 3, 5, "discussion", 25, "English"),
        ("Fatima", "Passed Cloud Practitioner, now aiming for Associate", 2, 2, "hands-on", 20, "English"),
        ("Peter", "Director of engineering, 20 years on-prem. What is a region vs an AZ?", 1, 20, "discussion", 15, "English"),
        ("Isha", "Practice explaining the well-architected pillars", 4, 6, "discussion", 30, "Hindi"),
        ("Mateo", "Exam scenario questions on high availability", 4, 7, "reading", 20, "Spanish"),
        ("Chloe", "I keep mixing up security groups and NACLs", 2, 2, "visual", 15, "English"),
        ("Gurpreet", "Cost-optimization questions on the exam", 3, 5, "hands-on", 20, "Punjabi"),
    ],
    "react": [
        ("Maya", "Why does my component render twice?", 2, 1, "hands-on", 20, "English"),
        ("Leo", "useEffect dependency arrays, finally explained", 2, 2, "discussion", 15, "English"),
        ("Zara", "Props vs state, in plain words", 1, 0, "visual", 15, "English"),
        ("Daniel", "Backend lead, 12 years of Java. What's a React hook, honestly?", 1, 12, "hands-on", 30, "English"),
        ("Ines", "Lifting state up vs using context", 3, 3, "discussion", 20, "Spanish"),
        ("Arjun", "Keys in lists, and why React complains about them", 3, 4, "reading", 15, "Hindi"),
        ("Nora", "I teach React bootcamps and want fresher explanations", 5, 8, "discussion", 30, "English"),
        ("Felix", "Controlled vs uncontrolled inputs", 3, 3, "hands-on", 20, "English"),
        ("Amara", "When to memoize, and when it's pointless", 4, 6, "reading", 25, "English"),
        ("Simran", "Building my first React component", 1, 1, "hands-on", 20, "Punjabi"),
    ],
    "design": [
        ("Ethan", "How would you design a URL shortener?", 2, 3, "discussion", 30, "English"),
        ("Ayesha", "Caching strategies: write-through vs write-back", 3, 5, "reading", 20, "English"),
        ("Victor", "Consistent hashing intuition", 4, 8, "visual", 25, "Spanish"),
        ("Mei", "Interview prep: design a chat system", 3, 4, "discussion", 30, "English"),
        ("Rohan", "What does a load balancer actually decide?", 2, 2, "visual", 15, "Hindi"),
        ("Olivia", "Message queues vs direct service calls", 3, 6, "discussion", 20, "English"),
        ("Kwame", "Sharding a database without breaking everything", 4, 9, "reading", 30, "English"),
        ("Lucia", "Design lead, 10 years. Want to follow the system design talks at work", 1, 10, "visual", 20, "English"),
        ("Hamid", "Rate-limiting designs that survive traffic spikes", 4, 7, "hands-on", 25, "English"),
        ("Tara", "CAP theorem without the buzzwords", 2, 3, "discussion", 15, "English"),
    ],
    "dataviz": [
        ("Iris", "Bar vs line: when does it matter?", 1, 1, "visual", 15, "English"),
        ("Mohan", "Colour scales that don't mislead", 3, 5, "visual", 20, "Hindi"),
        ("Clara", "Dashboards people actually read", 3, 6, "discussion", 25, "English"),
        ("Diego", "Making my first D3 chart", 2, 2, "hands-on", 30, "Spanish"),
        ("Ruth", "Data scientist, 13 years. Never learned chart design basics", 2, 13, "reading", 20, "English"),
        ("Kai", "Small multiples vs one busy chart", 4, 7, "visual", 20, "English"),
        ("Sana", "Showing uncertainty in a chart", 4, 6, "discussion", 15, "English"),
        ("Theo", "Why do pie charts get so much criticism?", 2, 1, "discussion", 15, "English"),
        ("Leila", "Accessible charts for colour-blind readers", 3, 4, "reading", 20, "English"),
        ("Jaspreet", "Telling a story with a single chart", 3, 3, "discussion", 25, "Punjabi"),
    ],
    "llm": [
        ("Adrian", "What does open-weight actually mean vs open source?", 1, 2, "discussion", 15, "English"),
        ("Fiona", "Running a Llama model on my laptop", 2, 3, "hands-on", 30, "English"),
        ("Ravi", "LoRA fine-tuning in plain terms", 3, 5, "reading", 25, "Hindi"),
        ("Elif", "Quantization: 4-bit vs 8-bit trade-offs", 4, 6, "hands-on", 20, "English"),
        ("Pablo", "Context windows, and why long prompts cost more", 3, 4, "discussion", 15, "Spanish"),
        ("Ingrid", "Engineering manager, 16 years. What is a token, really?", 1, 16, "discussion", 20, "English"),
        ("Noah", "Evaluating an open model for our use case", 4, 8, "reading", 30, "English"),
        ("Yara", "How inference servers batch requests", 4, 7, "visual", 25, "English"),
        ("Chen", "Why do models make up citations?", 2, 2, "discussion", 15, "English"),
        ("Divya", "Prompting vs fine-tuning: which do I need?", 3, 4, "discussion", 20, "English"),
    ],
    "ux": [
        ("Jordan", "Teacher moving into UX. Where do I start?", 1, 0, "discussion", 30, "English"),
        ("Sakura", "Turning engineering projects into UX case studies", 2, 6, "reading", 20, "English"),
        ("Andre", "UX research methods for beginners", 1, 1, "visual", 15, "Spanish"),
        ("Hiba", "Portfolio review practice", 3, 3, "discussion", 25, "English"),
        ("Liam", "Senior backend engineer, 14 years. Curious how UX research works", 1, 14, "discussion", 20, "English"),
        ("Pooja", "Usability testing on a budget", 3, 4, "hands-on", 20, "Hindi"),
        ("Mia", "Explaining design decisions to engineers", 4, 7, "discussion", 30, "English"),
        ("Oscar", "Wireframes vs prototypes", 2, 2, "visual", 15, "English"),
        ("Rana", "Interviewing for my first UX role", 3, 3, "discussion", 20, "English"),
        ("Harpreet", "Accessibility basics for new designers", 2, 1, "reading", 15, "Punjabi"),
    ],
}

# Which sample learners show as "away" (by position in each cluster), so cluster activity varies.
_AWAY = {"gpu": {4, 9}, "calculus": {1, 6, 9}, "aws": {8}, "react": {4, 9}, "design": {2, 4, 8, 9},
         "dataviz": {1, 4, 7}, "llm": {8}, "ux": {2, 9}}

SAMPLE_LEARNERS = [
    {"id": "sample-" + cluster["id"] + "-" + str(index + 1), "name": name, "cluster": cluster["id"],
     "concept": cluster["concept"], "intent": intent, "tier": tier, "experience_years": years,
     "learning_style": style, "language": language, "minutes": minutes,
     "online": index not in _AWAY[cluster["id"]], "sample": True}
    for cluster in CLUSTERS
    for index, (name, intent, tier, years, style, minutes, language) in enumerate(_LEARNERS[cluster["id"]])
]
LEARNER_BY_ID = {learner["id"]: learner for learner in SAMPLE_LEARNERS}

# Sample memory trail and reputation shown before the first real wrap-up. Labelled as sample.
SAMPLE_HISTORY = [
    {"concept": "Prompting basics", "focus_area": "Open-weight LLMs", "tier_before": 1, "tier_after": 2,
     "when": "5 days ago", "sample": True},
    {"concept": "Reading a usability report", "focus_area": "Career switching into UX", "tier_before": 2,
     "tier_after": 3, "when": "2 days ago", "sample": True},
]
SAMPLE_REPUTATION = 25


def online_count() -> int:
    return sum(1 for learner in SAMPLE_LEARNERS if learner["online"])


def cluster_summary() -> List[Dict[str, Any]]:
    return [{"id": c["id"], "label": c["label"], "concept": c["concept"],
             "size": sum(1 for l in SAMPLE_LEARNERS if l["cluster"] == c["id"]),
             "online": sum(1 for l in SAMPLE_LEARNERS if l["cluster"] == c["id"] and l["online"])}
            for c in CLUSTERS]


def best_cluster(words: Set[str]):
    """Cluster with the most keyword overlap, or None if nothing overlaps."""
    best, best_score = None, 0
    for cluster in CLUSTERS:
        score = len(words & cluster["keywords"])
        if score > best_score:
            best, best_score = cluster, score
    return best


def nearest_cluster(profile: Profile):
    """Return (cluster, reason). Exact focus-area match first, then shared keywords."""
    for cluster in CLUSTERS:
        if profile.focus_area.lower() == cluster["label"].lower():
            return cluster, "Your focus area matches this cluster."
    words = tokens(" ".join((profile.focus_area, profile.concept, profile.sharpened_question)))
    cluster = best_cluster(words)
    if cluster:
        shared = sorted(words & cluster["keywords"])
        return cluster, "Shared concepts: " + ", ".join(shared) + "."
    largest = max(cluster_summary(), key=lambda c: (c["online"], -CLUSTERS.index(CLUSTER_BY_ID[c["id"]])))
    return CLUSTER_BY_ID[largest["id"]], "No close cluster yet, so you were placed with the most active group."


def demo_profile(intent: str) -> Dict[str, Any]:
    """Deterministic stand-in for the model: keyword heuristics only."""
    words = tokens(intent)
    lowered = intent.lower()
    cluster = best_cluster(words)
    if any(w in words for w in ("never", "beginner", "new", "zero", "start", "first", "confused",
                                "confuse", "confusing", "confuses", "honestly", "finally", "eli5")):
        tier = 1
    elif any(w in words for w in ("advanced", "deep", "teach", "teaching", "internals", "optimize")):
        tier = 4
    elif any(w in words for w in ("refresher", "practice", "intermediate", "better")):
        tier = 3
    else:
        tier = 2
    if any(w in words for w in ("see", "visual", "visually", "diagram", "diagrams", "picture", "draw")):
        style = "visual"
    elif any(w in words for w in ("build", "code", "coding", "hands", "project", "try", "example", "examples")):
        style = "hands-on"
    elif any(w in words for w in ("read", "reading", "paper", "papers", "docs", "article")):
        style = "reading"
    else:
        style = "discussion"
    language = "English"
    for name in ("Hindi", "Punjabi", "Spanish"):
        if name.lower() in words:
            language = name
    if re.search(r"[ऀ-ॿ]", intent):
        language = "Hindi"
    elif re.search(r"[਀-੿]", intent):
        language = "Punjabi"
    minutes = 15
    found = re.search(r"\b(\d{1,2})\s*(?:min|mins|minute|minutes)\b", lowered)
    if found:
        minutes = min(60, max(10, int(found.group(1))))
    elif "half an hour" in lowered or "30m" in lowered:
        minutes = 30
    elif "an hour" in lowered:
        minutes = 60
    if cluster:
        focus, concept, question = cluster["label"], cluster["concept"], cluster["question"]
    else:
        short = " ".join(intent.split()[:6]).rstrip("?.!,")
        focus, concept = "Other", short[:80] if len(short) >= 2 else "a new concept"
        question = ("What is the core idea behind \"" + intent[:150].rstrip("?.!")
                    + "\", and where does it stop working?")
    return {"focus_area": focus, "concept": concept, "sharpened_question": question, "tier": tier,
            "learning_style": style, "language": language, "availability_minutes": minutes}


def _role_hint(tier: int, mine: int) -> str:
    if tier > mine:
        return "Further along on this concept"
    if tier < mine:
        return "Newer to this: a good test of your explanation"
    return "At your level on this concept"


def pick_group(profile: Profile, exclude=(), size: int = 4) -> Dict[str, Any]:
    """A small mixed-tier group from the nearest cluster: online, same language.

    Tiers are mixed on purpose (someone ahead, someone at your level, someone newer),
    so everyone has something to explain and something to ask.
    """
    if not isinstance(exclude, (list, tuple)) or len(exclude) > len(SAMPLE_LEARNERS):
        raise ValueError("Exclude must be a list of learner ids.")
    exclude = {item for item in exclude if isinstance(item, str)}
    cluster, placement = nearest_cluster(profile)
    pool = [l for l in SAMPLE_LEARNERS
            if l["cluster"] == cluster["id"] and l["online"] and l["language"] == profile.language]
    pool.sort(key=lambda l: (l["minutes"] < profile.availability_minutes, l["id"]))
    fresh = [l for l in pool if l["id"] not in exclude]
    recycled = len(fresh) < min(size, len(pool))
    if recycled:
        fresh += [l for l in pool if l["id"] in exclude]
    buckets = [[l for l in fresh if l["tier"] > profile.tier],
               [l for l in fresh if l["tier"] == profile.tier],
               [l for l in fresh if l["tier"] < profile.tier]]
    members = []
    while len(members) < size and any(buckets):
        for bucket in buckets:
            if bucket and len(members) < size:
                members.append(bucket.pop(0))
    members.sort(key=lambda l: (-l["tier"], l["id"]))
    ahead = sum(1 for l in members if l["tier"] > profile.tier)
    same = sum(1 for l in members if l["tier"] == profile.tier)
    newer = len(members) - ahead - same
    parts = [str(n) + " " + label for n, label in ((ahead, "ahead of you"), (same, "at your level"),
                                                   (newer, "newer to it")) if n]
    rationale = ("Mixed tiers on purpose: " + ", ".join(parts) + ". " if parts else "") + (
        "All online now, all in " + profile.language + ".")
    result = [dict(l, role_hint=_role_hint(l["tier"], profile.tier),
                   explain_back=cluster["takeaways"][i % len(cluster["takeaways"])])
              for i, l in enumerate(members)]
    return {"cluster": next(c for c in cluster_summary() if c["id"] == cluster["id"]),
            "placement_reason": placement, "members": result, "rationale": rationale,
            "recycled": recycled, "script": session_script(cluster, result), "sample": True}


def session_script(cluster: Dict[str, Any], members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """A few scripted sample messages so the room feels alive. Clearly sample."""
    if not members:
        return []
    ahead, newest = members[0], members[-1]
    middle = members[1] if len(members) > 2 else ahead
    concept = cluster["concept"]
    if newest["experience_years"] >= 10:
        opener = ("I've been an engineer for " + str(newest["experience_years"])
                  + " years and still can't explain " + concept + ", so I'll ask the basic questions.")
    else:
        opener = "Honest question first: what problem does " + concept + " actually solve?"
    lines = [
        (ahead, "I'll take a first pass at " + concept + ". Stop me the moment it gets fuzzy."),
        (newest, opener),
        (middle, cluster["example"]),
        (ahead, "Let's each try a one-sentence version before the timer runs out."),
    ]
    return [{"id": m["id"], "name": m["name"], "tier": m["tier"], "text": t, "sample": True} for m, t in lines]


def wrap_up(profile: Profile, explanation: Any, member_ids: Any, marked_ids: Any) -> Dict[str, Any]:
    """Transparent rules: tier and reputation are separate, and nothing is ranked globally.

    Sample peers' "explained clearly" marks are simulated from explanation length only.
    """
    if not isinstance(explanation, str) or len(explanation) > 400:
        raise ValueError("Your explanation must be text of up to 400 characters.")
    explanation = " ".join(explanation.split())
    for ids, label in ((member_ids, "Members"), (marked_ids, "Marked")):
        if not isinstance(ids, list) or len(ids) > 8 or not all(isinstance(i, str) for i in ids):
            raise ValueError(label + " must be a short list of learner ids.")
    members = [LEARNER_BY_ID[i] for i in member_ids if i in LEARNER_BY_ID]
    if len(members) != len(member_ids):
        raise ValueError("Unknown sample learner.")
    if not set(marked_ids) <= set(member_ids):
        raise ValueError("You can only mark people from your session.")
    words = len(explanation.split())
    if words >= 12:
        received = len(members)
    elif words >= 6:
        received = (len(members) + 1) // 2
    else:
        received = 0
    levelled = words >= 6 and received >= 1 and profile.tier < 5
    tier_after = profile.tier + 1 if levelled else profile.tier
    if levelled:
        tier_reason = ("You explained it back and " + str(received)
                       + (" peer" if received == 1 else " peers") + " marked it clear.")
    elif profile.tier == 5:
        tier_reason = "You're already at tier 5 on this concept."
    elif words < 6:
        tier_reason = "Write at least six words of explanation to move up a tier."
    else:
        tier_reason = "No peer marked it clear yet. Try a more concrete example."
    breakdown = [{"label": "Explanations marked clear (x10)", "points": received * 10},
                 {"label": "Feedback you gave (x3)", "points": len(set(marked_ids)) * 3},
                 {"label": "Finished with an explain-back", "points": 5 if words >= 6 else 0}]
    return {
        "concept": profile.concept, "focus_area": profile.focus_area,
        "tier_before": profile.tier, "tier_after": tier_after, "tier_reason": tier_reason,
        "marks_received": received, "marks_simulated": True,
        "reputation_gained": sum(item["points"] for item in breakdown),
        "reputation_breakdown": breakdown,
        "entry": {"concept": profile.concept, "focus_area": profile.focus_area,
                  "tier_before": profile.tier, "tier_after": tier_after, "when": "Just now", "sample": False},
        "sample_history": SAMPLE_HISTORY, "sample_reputation": SAMPLE_REPUTATION,
    }
