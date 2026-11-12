"""Recovery map: how fresh each muscle is, estimated from the training log.

A simple, explainable model (an estimate, not a measurement):

* every completed set tires the exercise's primary muscles (1 set) and its
  secondary muscles (half a set); stretches and mobility drills do not count;
* about 10 hard sets for a muscle in one session means fully tired;
* a session's fatigue fades in a straight line over 24 h (a few sets) to
  72 h (a full session); small muscles recover a quarter faster;
* fatigue from several sessions adds up.

Readiness is 100 % minus the fatigue left: fresh from 80 %, recovering from
50 %, tired below.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .catalog import MUSCLES, get_exercise

FULL_SESSION_SETS = 10
SMALL = {"abs", "obliques", "calves", "forearms"}
FRESH, RECOVERING = 80, 50
WINDOW = timedelta(hours=96)


def _parse_dt(value: str | None) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value) if value else None
    except ValueError:
        return None
    if dt and not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _doses(workouts: list[dict], now: datetime) -> dict[str, list[tuple[float, float, float]]]:
    """Per muscle: (hours since the session, starting fatigue 0–1, hours to recover from it)."""
    out: dict[str, list[tuple[float, float, float]]] = {m: [] for m in MUSCLES}
    for w in workouts:
        when = _parse_dt(w.get("finished_at"))
        if not when or when > now or now - when > WINDOW:
            continue
        sets: dict[str, float] = {}
        for e in w.get("entries", []):
            ex = get_exercise(e.get("exercise_id", ""))
            if not ex or ex.get("type") == "mobility":
                continue
            done = sum(1 for s in e.get("sets", []) if s.get("done", True) and int(s.get("reps") or 0) > 0)
            for m in ex["primary"]:
                sets[m] = sets.get(m, 0) + done
            for m in ex["secondary"]:
                sets[m] = sets.get(m, 0) + done * 0.5
        elapsed = (now - when).total_seconds() / 3600
        for m, n in sets.items():
            if m not in out or n <= 0:
                continue
            start = min(1.0, n / FULL_SESSION_SETS)
            hours = (24 + 48 * start) * (0.75 if m in SMALL else 1.0)
            out[m].append((elapsed, start, hours))
    return out


def _fatigue(doses: list[tuple[float, float, float]], later: float = 0.0) -> float:
    return min(1.0, sum(start * max(0.0, 1 - (elapsed + later) / hours) for elapsed, start, hours in doses))


def compute_recovery(workouts: list[dict], now: datetime | None = None) -> dict[str, dict]:
    now = now or datetime.now(timezone.utc)
    out: dict[str, dict] = {}
    for muscle, doses in _doses(workouts, now).items():
        readiness = round(100 * (1 - _fatigue(doses)))
        ready_in = 0
        while ready_in < 96 and round(100 * (1 - _fatigue(doses, ready_in))) < FRESH:
            ready_in += 1
        out[muscle] = {
            "readiness": readiness,
            "status": "fresh" if readiness >= FRESH else "recovering" if readiness >= RECOVERING else "tired",
            "ready_in_h": ready_in,
        }
    return out
