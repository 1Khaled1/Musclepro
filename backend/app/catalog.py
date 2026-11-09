"""Static training catalog (exercises, programs) and the workout generator.

The catalog ships with the code as JSON so it is versioned, reviewable and
costs no database reads. User data (logs, favorites, enrollments) lives in
the store instead.
"""
from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path
from typing import Any

from .security import ApiError

DATA_DIR = Path(__file__).resolve().parent / "data"

MUSCLES: dict[str, dict[str, str]] = {
    "chest": {"en": "Chest", "fr": "Pectoraux", "region": "front"},
    "shoulders": {"en": "Shoulders", "fr": "Épaules", "region": "both"},
    "biceps": {"en": "Biceps", "fr": "Biceps", "region": "front"},
    "triceps": {"en": "Triceps", "fr": "Triceps", "region": "back"},
    "forearms": {"en": "Forearms", "fr": "Avant-bras", "region": "both"},
    "abs": {"en": "Abs", "fr": "Abdominaux", "region": "front"},
    "obliques": {"en": "Obliques", "fr": "Obliques", "region": "front"},
    "traps": {"en": "Traps", "fr": "Trapèzes", "region": "back"},
    "lats": {"en": "Lats", "fr": "Dorsaux", "region": "back"},
    "lower_back": {"en": "Lower back", "fr": "Lombaires", "region": "back"},
    "glutes": {"en": "Glutes", "fr": "Fessiers", "region": "back"},
    "quads": {"en": "Quads", "fr": "Quadriceps", "region": "front"},
    "hamstrings": {"en": "Hamstrings", "fr": "Ischio-jambiers", "region": "back"},
    "calves": {"en": "Calves", "fr": "Mollets", "region": "back"},
}

EQUIPMENT: dict[str, dict[str, str]] = {
    "bodyweight": {"en": "Bodyweight", "fr": "Poids du corps"},
    "dumbbell": {"en": "Dumbbells", "fr": "Haltères"},
    "barbell": {"en": "Barbell", "fr": "Barre"},
    "kettlebell": {"en": "Kettlebell", "fr": "Kettlebell"},
    "cable": {"en": "Cable", "fr": "Poulie"},
    "machine": {"en": "Machine", "fr": "Machine"},
    "band": {"en": "Band", "fr": "Élastique"},
}

DIFFICULTY_ORDER = {"beginner": 0, "intermediate": 1, "advanced": 2}
LEVEL_MAX_DIFFICULTY = {"beginner": 0, "intermediate": 1, "advanced": 2, "pro": 2}

# Goal → prescription. Rest is in seconds.
SCHEMES: dict[str, dict[str, Any]] = {
    "strength": {"sets": 5, "reps": "4-6", "rest": 165, "work": 30},
    "hypertrophy": {"sets": 4, "reps": "8-12", "rest": 90, "work": 40},
    "endurance": {"sets": 3, "reps": "15-20", "rest": 45, "work": 50},
    "power": {"sets": 5, "reps": "3-5", "rest": 120, "work": 20},
    "general": {"sets": 3, "reps": "10-12", "rest": 75, "work": 40},
}

FULL_BODY = ["quads", "chest", "lats", "glutes", "shoulders", "hamstrings", "abs"]


@lru_cache(maxsize=1)
def exercises() -> list[dict]:
    return json.loads((DATA_DIR / "exercises.json").read_text("utf-8"))


@lru_cache(maxsize=1)
def exercise_index() -> dict[str, dict]:
    return {e["id"]: e for e in exercises()}


@lru_cache(maxsize=1)
def programs() -> list[dict]:
    return json.loads((DATA_DIR / "programs.json").read_text("utf-8"))


def get_exercise(exercise_id: str) -> dict | None:
    return exercise_index().get(exercise_id)


def get_program(program_id: str) -> dict | None:
    return next((p for p in programs() if p["id"] == program_id), None)


def program_summary(program: dict) -> dict:
    """A program without its week-by-week plan (for lists)."""
    return {k: v for k, v in program.items() if k != "plan"}


def program_exercise_ids(program: dict) -> set[str]:
    return {x["id"] for week in program["plan"] for d in week["days"] for x in d["exercises"]}


def program_day(program: dict, week: int, day_id: str) -> dict | None:
    """The session `day_id` of `week` (1-based), if the plan has it."""
    if not 1 <= week <= len(program["plan"]):
        return None
    return next((d for d in program["plan"][week - 1]["days"] if d["id"] == day_id), None)


def filter_exercises(
    muscle: str | None = None,
    equipment: str | None = None,
    difficulty: str | None = None,
    query: str | None = None,
) -> list[dict]:
    q = (query or "").strip().lower()
    out = []
    for e in exercises():
        if muscle and muscle not in e["primary"] and muscle not in e["secondary"]:
            continue
        if equipment and e["equipment"] != equipment:
            continue
        if difficulty and e["difficulty"] != difficulty:
            continue
        if q and q not in e["name"]["en"].lower() and q not in e["name"]["fr"].lower():
            continue
        out.append(e)
    # Exercises that hit the muscle directly come before those that assist.
    if muscle:
        out.sort(key=lambda e: (muscle not in e["primary"], DIFFICULTY_ORDER[e["difficulty"]]))
    return out


# -- generator ---------------------------------------------------------------
def _str_list(value: Any, allowed, code: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 20:
        raise ApiError(code)
    for v in value:
        if v not in allowed:
            raise ApiError(code)
    return list(dict.fromkeys(value))


def _warmup(available: list[dict], chosen: list[dict], muscles: list[str], rng: random.Random) -> list[dict]:
    """Two dynamic mobility drills that prepare what the session trains."""
    target = set(muscles) | {m for e in chosen for m in e["primary"]}
    drills = [e for e in available if e["type"] == "mobility" and e.get("warmup")]
    picked: list[dict] = []
    for _ in range(2):
        def fit(e: dict) -> float:
            hits = len(target & set(e["primary"])) * 2 + len(target & set(e["secondary"]))
            # A second drill for different muscles beats two drills for the same.
            overlap = any(set(p["primary"]) & set(e["primary"]) for p in picked)
            return hits - (1.5 if overlap else 0) + rng.random() * 0.8
        options = [e for e in drills if e not in picked]
        if not options:
            break
        picked.append(max(options, key=fit))
    return [{"id": e["id"], "sets": 1, "reps": e["dose"], "rest": 15} for e in picked]


def generate_workout(params: dict, seed: int | None = None) -> dict:
    """Build a session from the catalog.

    Picks, for each requested muscle in turn, the best-matching exercise that
    fits the equipment and level, then orders the session the way a coach
    would: explosive work first, big compounds next, isolation, then core.
    """
    muscles = _str_list(params.get("muscles"), MUSCLES, "muscles_invalid") or FULL_BODY
    equipment = set(_str_list(params.get("equipment"), EQUIPMENT, "equipment_invalid"))
    equipment.add("bodyweight")
    level = params.get("level", "beginner")
    if level not in LEVEL_MAX_DIFFICULTY:
        raise ApiError("level_invalid")
    goal = params.get("goal", "general")
    if goal not in SCHEMES:
        raise ApiError("goal_invalid")
    try:
        minutes = int(params.get("minutes", 45))
    except (TypeError, ValueError):
        raise ApiError("minutes_invalid") from None
    if not 15 <= minutes <= 120:
        raise ApiError("minutes_invalid")

    rng = random.Random(seed)
    scheme = dict(SCHEMES[goal])
    if level == "beginner":
        scheme["sets"] = max(2, scheme["sets"] - 1)
    max_diff = LEVEL_MAX_DIFFICULTY[level]

    available = [
        e
        for e in exercises()
        if e["equipment"] in equipment and DIFFICULTY_ORDER[e["difficulty"]] <= max_diff
    ]
    # Stretches and mobility drills never count as working sets; the best
    # dynamic ones open the session as a warm-up instead (see below).
    pool = [e for e in available if e["type"] != "mobility"]

    per_exercise = scheme["sets"] * (scheme["work"] + scheme["rest"]) / 60
    target = max(3, min(9, round((minutes - 5) / per_exercise)))

    def score(e: dict, muscle: str) -> float:
        s = 0.0
        if e["type"] == "power":
            # Jumps and throws lead a power or conditioning day, but should
            # not crowd out the main lifts in a strength or muscle session.
            if goal == "power":
                s += 3
            elif goal == "endurance" and e["equipment"] == "bodyweight":
                s += 0.8
            else:
                s -= 1.5
        if e["mechanic"] == "compound":
            s += 1.5 if goal in ("strength", "power") else 1
        # Loadable movements progress better for strength and size.
        if goal in ("strength", "hypertrophy") and e["equipment"] != "bodyweight":
            s += 0.6
        # Prefer exercises at the athlete's level rather than far below it.
        s += 0.4 * DIFFICULTY_ORDER[e["difficulty"]]
        if len(e["primary"]) == 1 and e["primary"][0] == muscle:
            s += 0.5
        # Vary the movement pattern: avoid a second near-identical lift.
        if any(c["primary"][0] == e["primary"][0] and c["force"] == e["force"] for c in chosen):
            s -= 1.2
        return s + rng.random() * 1.2

    chosen: list[dict] = []
    used: set[str] = set()
    covered: set[str] = set()
    rounds = 0
    while len(chosen) < target and rounds < 4:
        progressed = False
        for muscle in muscles:
            if len(chosen) >= target:
                break
            if rounds == 0 and muscle in covered:
                continue
            candidates = [e for e in pool if muscle in e["primary"] and e["id"] not in used]
            if not candidates:
                continue
            best = max(candidates, key=lambda e: score(e, muscle))
            chosen.append(best)
            used.add(best["id"])
            covered.update(best["primary"])
            progressed = True
        rounds += 1
        if not progressed:
            break

    def order(e: dict) -> tuple:
        core = all(m in ("abs", "obliques") for m in e["primary"])
        return (e["type"] != "power", core, e["mechanic"] != "compound")

    chosen.sort(key=order)

    items = []
    for e in chosen:
        sets, reps, rest = scheme["sets"], scheme["reps"], scheme["rest"]
        if e["mechanic"] == "isolation" and goal in ("strength", "power"):
            sets, reps, rest = 3, "10-12", 60
        if e["force"] == "static":
            # Holds and carries are prescribed by time or distance, not reps.
            reps = "30m" if e["id"] == "farmers-carry" else "30-45s"
        if e["type"] == "power" and goal != "power":
            sets, reps, rest = 3, "5", 90
        items.append({"id": e["id"], "sets": sets, "reps": reps, "rest": rest})

    warmup = _warmup(available, chosen, muscles, rng)

    total = 5 + sum(i["sets"] * (scheme["work"] + i["rest"]) for i in items) / 60
    return {
        "goal": goal,
        "level": level,
        "muscles": muscles,
        "warmup": warmup,
        "exercises": items,
        "estimated_minutes": round(total),
    }
