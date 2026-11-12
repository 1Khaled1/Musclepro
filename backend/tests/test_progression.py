"""Smart progression rules."""
from datetime import datetime, timedelta, timezone

from app.catalog import get_exercise
from app.progression import parse_reps, suggest

from .conftest import register

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)


def session(ex_id, sets, days_ago=3, unit="kg"):
    return {
        "finished_at": (NOW - timedelta(days=days_ago)).isoformat(),
        "entries": [{"exercise_id": ex_id, "sets": [{"weight": w, "reps": r, "unit": unit, "done": True} for w, r in sets]}],
    }


def s(ex_id, history, **kw):
    kw.setdefault("sets", 3)
    return suggest(get_exercise(ex_id), history, now=NOW, **kw)


def test_parse_reps():
    assert parse_reps("8-10/leg") == (8, 10)
    assert parse_reps("5") == (5, 5)
    assert parse_reps("10/side") == (10, 10)
    assert parse_reps("30s") is None and parse_reps("30m") is None and parse_reps(None) is None


def test_no_history_no_suggestion():
    assert s("bench-press" if get_exercise("bench-press") else "barbell-bench-press", [], reps="5") is None


def test_top_of_range_adds_weight_and_restarts_at_the_bottom():
    h = [session("barbell-bench-press", [(60, 10), (60, 10), (60, 10)])]
    out = s("barbell-bench-press", h, reps="8-10")
    assert out["reason"] == "progress" and out["weight"] == 62.5 and out["reps"] == 8
    assert out["last"]["reps"] == [10, 10, 10]


def test_big_leg_lifts_move_faster_and_dumbbells_by_2kg():
    assert s("back-squat", [session("back-squat", [(100, 5)] * 3)], reps="5")["weight"] == 105
    assert s("dumbbell-curl", [session("dumbbell-curl", [(12, 12)] * 3)], reps="10-12")["weight"] == 14


def test_inside_the_range_keeps_the_weight_and_asks_one_more_rep():
    out = s("barbell-bench-press", [session("barbell-bench-press", [(60, 9), (60, 8), (60, 8)])], reps="8-10")
    assert out["reason"] == "reps" and out["weight"] == 60 and out["reps"] == 9


def test_missed_reps_repeat_then_reset():
    miss = [(80, 4), (80, 3), (80, 3)]
    once = s("barbell-bench-press", [session("barbell-bench-press", miss)], reps="5")
    assert once["reason"] == "repeat" and once["weight"] == 80
    twice = s("barbell-bench-press", [session("barbell-bench-press", miss, 3), session("barbell-bench-press", miss, 6)], reps="5")
    assert twice["reason"] == "reset" and twice["weight"] == 72.5


def test_percent_of_1rm_uses_the_best_recent_estimate():
    h = [session("back-squat", [(100, 5)] * 3)]  # e1RM 116.7 kg
    out = s("back-squat", h, reps="3", pct=80)
    assert out["reason"] == "pct" and out["weight"] == 92.5


def test_deload_and_return_from_a_break_lighten_the_load():
    h = [session("barbell-bench-press", [(60, 8)] * 3)]
    assert s("barbell-bench-press", h, reps="8", deload=True)["weight"] == 55
    old = [session("barbell-bench-press", [(60, 8)] * 3, days_ago=30)]
    out = s("barbell-bench-press", old, reps="8")
    assert out["reason"] == "return" and out["weight"] == 55 and out["days"] == 30
    # Kettlebells come in 4 kg steps: 10 % lighter still means one bell down.
    assert s("goblet-squat", [session("goblet-squat", [(16, 10)] * 3)], reps="10", deload=True)["weight"] == 12


def test_changed_rep_target_is_re_estimated():
    h = [session("barbell-bench-press", [(80, 5)] * 3)]  # e1RM ≈ 93 kg
    out = s("barbell-bench-press", h, reps="10-12")
    assert out["reason"] == "adjust" and out["weight"] == 65 and out["reps"] == 12


def test_bodyweight_progresses_in_reps_and_mobility_is_skipped():
    out = s("push-up", [session("push-up", [(0, 12), (0, 12), (0, 12)])], reps="10-12")
    assert out["reason"] == "progress" and out["weight"] is None and out["reps"] == 13
    assert s("cobra-stretch", [session("cobra-stretch", [(0, 1)])], reps="30s") is None


def test_lbs_and_kettlebell_steps():
    out = s("barbell-bench-press", [session("barbell-bench-press", [(135, 8)] * 3, unit="lbs")], reps="8", unit="lbs")
    assert out["weight"] == 140 and out["unit"] == "lbs"
    assert s("goblet-squat", [session("goblet-squat", [(16, 10)] * 3)], reps="10")["weight"] == 20


def test_suggest_endpoint(api):
    assert api.post("/api/workouts/suggest", json={"items": [{"id": "back-squat", "reps": "5"}]}).status_code == 401
    register(api)
    w = {"title": "Legs", "entries": [{"exercise_id": "back-squat", "sets": [{"reps": 5, "weight": 100, "unit": "kg"}] * 3}]}
    assert api.post("/api/workouts", json=w).status_code == 201
    r = api.post("/api/workouts/suggest", json={"unit": "kg", "items": [{"id": "back-squat", "reps": "5", "sets": 3}, {"id": "push-up", "reps": "10"}]})
    assert r.status_code == 200
    assert r.json["suggestions"]["back-squat"]["weight"] == 105
    assert r.json["suggestions"]["push-up"] is None
    # A deload week of a program lightens the load.
    deload_week = next(i + 1 for p in [api.get("/api/programs/upper-lower-strength").json["program"]] for i, wk in enumerate(p["plan"]) if wk["deload"])
    r = api.post("/api/workouts/suggest", json={"program_id": "upper-lower-strength", "week": deload_week, "items": [{"id": "back-squat", "reps": "5"}]})
    assert r.json["suggestions"]["back-squat"]["reason"] == "deload"
    for bad in ({"items": []}, {"items": [{"id": "nope"}]}, {"unit": "stone", "items": [{"id": "back-squat"}]}, {"program_id": "x", "items": [{"id": "back-squat"}]}, {"items": [{"id": "back-squat", "pct": "80"}]}):
        assert api.post("/api/workouts/suggest", json=bad).status_code == 400, bad
