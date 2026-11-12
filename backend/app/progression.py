"""Smart progression: the load and reps to aim for next, from what was logged.

The rules are the ones a coach applies with double progression:

* every set reached the top of the rep target  → add the smallest sensible step
* inside the target                            → same weight, one more rep
* reps missed                                  → same weight; twice in a row → 10 % lighter
* the rep target changed a lot (5 → 10 reps)   → re-estimate from the last effort (Epley)
* % of 1RM prescribed                          → from the best recent estimated max
* deload week                                  → 10 % lighter
* first session after 3+ weeks off             → 10 % lighter (20 % after 2 months)

Only completed sets are stored, so "what was achieved" is read from them: the
working weight is the heaviest weight lifted in the last session, and the reps
achieved are the fewest reps done with it.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone

LBS_TO_KG = 0.45359237
LEGS = {"quads", "glutes", "hamstrings"}

# (increment, rounding grid) per equipment, in kg and in lbs.
STEPS = {
    "barbell": {"kg": (2.5, 2.5), "lbs": (5, 5)},
    "machine": {"kg": (2.5, 2.5), "lbs": (5, 5)},
    "cable": {"kg": (2.5, 2.5), "lbs": (5, 5)},
    "dumbbell": {"kg": (2, 2), "lbs": (5, 5)},
    "kettlebell": {"kg": (4, 4), "lbs": (9, 1)},
    "bodyweight": {"kg": (2.5, 2.5), "lbs": (5, 5)},  # added weight (belt, vest)
    "band": {"kg": (2.5, 2.5), "lbs": (5, 5)},
}

RANGE_RE = re.compile(r"^\s*(\d{1,3})\s*(?:[-–]\s*(\d{1,3}))?\s*(?:/\s*(?:side|leg|arm))?\s*$", re.IGNORECASE)


def parse_reps(text: str | None) -> tuple[int, int] | None:
    """'8-10/leg' → (8, 10), '5' → (5, 5); timed or distance targets ('30s', '30m') → None."""
    if not text:
        return None
    m = RANGE_RE.match(text)
    if not m:
        return None
    lo = int(m.group(1))
    hi = int(m.group(2) or lo)
    return (min(lo, hi), max(lo, hi)) if lo > 0 else None


def _to_kg(weight: float, unit: str) -> float:
    return weight * LBS_TO_KG if unit == "lbs" else weight


def _from_kg(kg: float, unit: str) -> float:
    return kg / LBS_TO_KG if unit == "lbs" else kg


def _round(value: float, grid: float, mode: str = "nearest") -> float:
    f = {"nearest": round, "down": math.floor, "up": math.ceil}[mode]
    out = f(value / grid + (1e-9 if mode != "down" else -1e-9)) * grid
    return round(max(out, 0.0), 2)


def epley(kg: float, reps: int) -> float:
    return kg * (1 + reps / 30)


def _parse_dt(value: str | None) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value) if value else None
    except ValueError:
        return None
    if dt and not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def sessions_for(workouts: list[dict], exercise_id: str) -> list[dict]:
    """Completed sets of one exercise, one entry per workout, newest first."""
    out = []
    for w in workouts:
        sets = [
            s
            for e in w.get("entries", [])
            if e.get("exercise_id") == exercise_id
            for s in e.get("sets", [])
            if s.get("done", True) and int(s.get("reps") or 0) > 0
        ]
        if sets:
            out.append({"when": _parse_dt(w.get("finished_at")), "sets": sets})
    out.sort(key=lambda s: s["when"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return out


def _work(session: dict) -> tuple[float, int, int, str]:
    """(working weight in kg, fewest reps done with it, sets done with it, unit used)."""
    sets = session["sets"]
    top = max(_to_kg(float(s.get("weight") or 0), s.get("unit", "kg")) for s in sets)
    at_top = [s for s in sets if abs(_to_kg(float(s.get("weight") or 0), s.get("unit", "kg")) - top) < 0.05]
    reps = min(int(s.get("reps") or 0) for s in at_top)
    return top, reps, len(at_top), at_top[0].get("unit", "kg")


def suggest(
    exercise: dict,
    workouts: list[dict],
    *,
    reps: str | None,
    sets: int,
    unit: str = "kg",
    pct: float | list | None = None,
    deload: bool = False,
    now: datetime | None = None,
) -> dict | None:
    """Next target for one exercise, or None when there is nothing useful to say."""
    if exercise.get("type") == "mobility":
        return None
    now = now or datetime.now(timezone.utc)
    history = sessions_for(workouts, exercise["id"])
    target = parse_reps(reps)
    steps = STEPS.get(exercise.get("equipment", "barbell"), STEPS["barbell"])
    inc, grid = steps[unit]
    if exercise.get("mechanic") == "compound" and LEGS & set(exercise.get("primary", [])) and exercise.get("equipment") in ("barbell", "machine"):
        inc *= 2  # big lower-body lifts move up faster

    def weight_out(kg: float, mode: str = "nearest", below: float | None = None) -> float:
        out = _round(_from_kg(kg, unit), grid, mode)
        # A lighter session must really be lighter, even with big steps (kettlebells).
        if below is not None and out >= _from_kg(below, unit) - 1e-6:
            out = _round(_from_kg(below, unit) - grid, grid, "nearest")
        return out

    # ---- % of 1RM: from the best estimated max of the last 90 days
    if pct is not None:
        lo_pct = float(pct[0] if isinstance(pct, (list, tuple)) else pct)
        recent = [s for s in history if s["when"] and now - s["when"] <= timedelta(days=90)]
        e1rm = max(
            (
                epley(_to_kg(float(x.get("weight") or 0), x.get("unit", "kg")), int(x.get("reps") or 0))
                for s in recent
                for x in s["sets"]
                if float(x.get("weight") or 0) > 0 and int(x.get("reps") or 0) <= 10
            ),
            default=0.0,
        )
        if e1rm > 0:
            return {
                "reason": "pct",
                "weight": weight_out(e1rm * lo_pct / 100),
                "unit": unit,
                "reps": target[1] if target else None,
                "e1rm": weight_out(e1rm),
                "last": _last(history[0], unit) if history else None,
            }

    if not history:
        return None

    last = history[0]
    W, R, n, _ = _work(last)
    loaded = W > 0
    if not loaded and (exercise.get("type") == "power" or target is None):
        return None  # jumps and timed holds: nothing to add from the logs
    lo, hi = target if target else (R, R)
    out: dict = {"unit": unit, "last": _last(last, unit)}

    def done(reason: str, kg: float | None, aim: int | None, mode: str = "nearest", lighter: bool = False) -> dict:
        weight = weight_out(kg, mode, W if lighter else None) if (kg is not None and loaded) else None
        out.update(reason=reason, weight=weight, reps=aim)
        return out

    # ---- deload weeks and returns from a break
    gap = (now - last["when"]).days if last["when"] else 0
    if deload:
        return done("deload", W * 0.9, lo, lighter=True)
    if gap >= 21 and loaded:
        out["days"] = gap
        return done("return", W * (0.8 if gap >= 60 else 0.9), lo, lighter=True)

    # ---- unloaded strength work (push-ups, pull-ups…): progress in reps
    if not loaded:
        if R >= hi:
            return done("progress", None, R + 1)
        return done("reps", None, min(R + 1, hi))

    # ---- timed or distance targets with a load (carries): add load when every set was done
    if target is None:
        if n >= sets:
            return done("progress", W + _to_kg_step(inc, unit), None)
        return done("repeat", W, None)

    # ---- the rep target moved far from what was done: re-estimate
    if R >= hi + 3 or R <= lo - 3:
        est = epley(W, R) / (1 + hi / 30)
        if R >= hi + 3:
            est = max(est, W + _to_kg_step(inc, unit))
        return done("adjust", est, hi, "down")

    # ---- double progression
    if R >= hi and n >= min(sets, len(last["sets"])):
        new = W + _to_kg_step(inc, unit)
        sug = done("progress", new, lo if lo < hi else hi)
        if sug["weight"] is not None and sug["weight"] <= _from_kg(W, unit) + 1e-6:
            sug["weight"] = round(_from_kg(W, unit) + inc, 2)
        return sug
    if R >= lo:
        return done("reps", W, min(R + 1, hi))
    # Missed: repeat, or step back after two misses in a row with the same weight.
    if len(history) > 1:
        W2, R2, _, _ = _work(history[1])
        if abs(W2 - W) < 0.05 and R2 < lo:
            return done("reset", W * 0.9, lo, lighter=True)
    return done("repeat", W, lo)


def _to_kg_step(inc: float, unit: str) -> float:
    return _to_kg(inc, unit)


def _last(session: dict, unit: str) -> dict:
    W, _, _, used = _work(session)
    return {
        "date": session["when"].isoformat(timespec="seconds") if session["when"] else None,
        "weight": round(_from_kg(W, unit), 1),
        "unit": unit,
        "reps": [int(s.get("reps") or 0) for s in session["sets"]][:10],
    }
