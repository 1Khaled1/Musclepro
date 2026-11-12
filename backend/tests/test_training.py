from datetime import datetime, timezone

from app.catalog import exercise_index, generate_workout, program_exercise_ids, programs
from app.routes.workouts import compute_stats

from .conftest import register


def test_catalog_integrity():
    index = exercise_index()
    assert len(index) >= 60
    for p in programs():
        for ex_id in program_exercise_ids(p):
            assert ex_id in index, (p["id"], ex_id)
    for e in index.values():
        assert e["name"]["en"] and e["name"]["fr"]
        assert len(e["steps"]["en"]) == len(e["steps"]["fr"])


def test_exercise_filters(api):
    r = api.get("/api/exercises?muscle=chest")
    items = r.json["exercises"]
    assert items and all("chest" in e["primary"] + e["secondary"] for e in items)
    # Direct hits are listed before assisting exercises.
    assert "chest" in items[0]["primary"]
    r = api.get("/api/exercises?q=squat bulgare")
    assert [e["id"] for e in r.json["exercises"]] == ["bulgarian-split-squat"]
    assert api.get("/api/exercises?muscle=wings").status_code == 400


def test_exercise_detail_and_404(api):
    r = api.get("/api/exercises/back-squat")
    assert r.status_code == 200
    assert any(p["id"] == "upper-lower-strength" for p in r.json["programs"])
    assert api.get("/api/exercises/nope").status_code == 404


def test_generator_respects_constraints():
    for seed in range(20):
        w = generate_workout(
            {"muscles": ["chest", "lats"], "equipment": [], "level": "beginner", "goal": "hypertrophy", "minutes": 40},
            seed=seed,
        )
        assert 3 <= len(w["exercises"]) <= 9
        ids = [x["id"] for x in w["exercises"]]
        assert len(ids) == len(set(ids))
        for x in w["exercises"]:
            e = exercise_index()[x["id"]]
            assert e["equipment"] == "bodyweight"
            assert e["difficulty"] == "beginner"


def test_generator_power_puts_explosive_first():
    w = generate_workout(
        {"muscles": ["quads", "glutes"], "equipment": ["barbell", "kettlebell"], "level": "pro", "goal": "power", "minutes": 60},
        seed=3,
    )
    first = exercise_index()[w["exercises"][0]["id"]]
    assert first["type"] == "power"


def test_generator_never_uses_stretches_as_work_and_adds_a_warmup():
    index = exercise_index()
    for seed in range(30):
        for goal in ("general", "strength", "hypertrophy", "endurance", "power"):
            w = generate_workout(
                {"muscles": ["hamstrings", "glutes", "chest"], "equipment": ["band"], "level": "beginner",
                 "goal": goal, "minutes": 45},
                seed=seed,
            )
            assert all(index[x["id"]]["type"] != "mobility" for x in w["exercises"]), goal
            warm = w["warmup"]
            assert len(warm) == 2 and len({x["id"] for x in warm}) == 2
            for x in warm:
                e = index[x["id"]]
                assert e["type"] == "mobility" and e.get("warmup") and x["reps"] == e["dose"]
                assert e["equipment"] in ("bodyweight", "band")
    # The warm-up follows the session: a leg day warms up the legs.
    w = generate_workout({"muscles": ["quads", "glutes"], "equipment": [], "level": "beginner", "goal": "general"}, seed=1)
    for x in w["warmup"]:
        e = index[x["id"]]
        assert set(e["primary"] + e["secondary"]) & {"quads", "glutes", "hamstrings", "calves"}


def test_catalog_has_150_plus_exercises_with_doses_for_mobility():
    index = exercise_index()
    assert len(index) >= 150
    mobility = [e for e in index.values() if e["type"] == "mobility"]
    assert len(mobility) >= 30 and all(e.get("dose") for e in mobility)
    assert sum(1 for e in mobility if e.get("warmup")) >= 12


def test_related_exercises_prefer_the_same_type(api):
    rel = api.get("/api/exercises/standing-quad-stretch").json["related"]
    assert rel and index_type(rel[0]) == "mobility"
    rel = api.get("/api/exercises/back-squat").json["related"]
    assert rel and all(index_type(e) != "mobility" for e in rel)


def index_type(e):
    return exercise_index()[e["id"]]["type"]


def test_generator_api_validation(api):
    assert api.post("/api/generate", json={"goal": "fly"}).json["error"] == "goal_invalid"
    assert api.post("/api/generate", json={"minutes": 5}).json["error"] == "minutes_invalid"
    r = api.post("/api/generate", json={"level": "intermediate", "goal": "strength"})
    assert r.status_code == 200 and r.json["exercises"]


def _workout(**extra):
    return {
        "title": "Day A",
        "duration_min": 50,
        "entries": [
            {"exercise_id": "back-squat", "sets": [
                {"reps": 5, "weight": 100, "unit": "kg"},
                {"reps": 5, "weight": 225, "unit": "lbs"},
            ]},
            {"exercise_id": "plank", "sets": [{"reps": 1, "weight": 0, "unit": "kg"}]},
        ],
        **extra,
    }


def test_workout_requires_login(api):
    assert api.post("/api/workouts", json=_workout()).status_code == 401


def test_workout_crud_and_stats(api):
    register(api)
    api.post("/api/me/programs/foundation-full-body")
    r = api.post("/api/workouts", json=_workout(program_id="foundation-full-body", day_id="a", week=1))
    assert r.status_code == 201
    wid = r.json["workout"]["id"]

    hist = api.get("/api/workouts").json
    assert hist["total"] == 1 and hist["workouts"][0]["id"] == wid

    enrollments = api.get("/api/me/programs").json["enrollments"]
    assert enrollments["foundation-full-body"]["completed"]["w1-a"] == wid

    stats = api.get("/api/workouts/stats").json
    assert stats["sessions"] == 1
    # 100*5 + 225 lbs (102.06 kg)*5
    assert stats["total_volume_kg"] == 1010
    assert stats["muscle_sets_7d"]["quads"] == 2
    assert stats["personal_records"][0]["exercise_id"] == "back-squat"

    csv_text = api.get("/api/workouts/export.csv").get_data(as_text=True)
    assert "Barbell Back Squat" in csv_text and "lbs" in csv_text

    assert api.delete(f"/api/workouts/{wid}").status_code == 200
    assert api.get("/api/workouts").json["total"] == 0


def test_workout_validation(api):
    register(api)
    bad = _workout()
    bad["entries"][0]["sets"][0]["unit"] = "stone"
    assert api.post("/api/workouts", json=bad).json["error"] == "unit_invalid"
    bad = _workout()
    bad["entries"][0]["exercise_id"] = "made-up"
    assert api.post("/api/workouts", json=bad).json["error"] == "entries_invalid"
    assert api.post("/api/workouts", json=_workout(program_id="foundation-full-body", day_id="zz")).json["error"] == "program_invalid"


def test_csv_injection_guard(api):
    register(api)
    api.post("/api/workouts", json=_workout(title="=HYPERLINK(\"http://evil\")"))
    text = api.get("/api/workouts/export.csv").get_data(as_text=True)
    assert "'=HYPERLINK" in text


def test_favorites(api):
    register(api)
    assert api.put("/api/me/favorites/push-up").status_code == 200
    assert api.put("/api/me/favorites/unknown").status_code == 404
    assert api.get("/api/me/favorites").json["favorites"] == ["push-up"]
    api.delete("/api/me/favorites/push-up")
    assert api.get("/api/me/favorites").json["favorites"] == []


def test_stats_streak():
    now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)  # a Sunday
    items = [
        {"finished_at": "2026-11-03T10:00:00+00:00", "entries": []},
        {"finished_at": "2026-10-28T10:00:00+00:00", "entries": []},
        {"finished_at": "2026-10-14T10:00:00+00:00", "entries": []},
    ]
    s = compute_stats(items, now)
    assert s["streak_weeks"] == 2
    assert s["this_week"] == 1


def test_offline_workout_keeps_finish_time(api):
    from datetime import datetime, timedelta, timezone

    register(api)
    earlier = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(timespec="seconds")
    r = api.post("/api/workouts", json=_workout(title="Offline", finished_at=earlier))
    assert r.status_code == 201
    assert r.json["workout"]["finished_at"] == earlier
    api.post("/api/workouts", json=_workout(title="Online"))
    # History is ordered by finish time, not by when the server received it.
    titles = [w["title"] for w in api.get("/api/workouts").json["workouts"]]
    assert titles == ["Online", "Offline"]

    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert api.post("/api/workouts", json=_workout(finished_at=future)).json["error"] == "finished_invalid"
    too_old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    assert api.post("/api/workouts", json=_workout(finished_at=too_old)).json["error"] == "finished_invalid"
    assert api.post("/api/workouts", json=_workout(finished_at="yesterday")).json["error"] == "finished_invalid"


def test_replayed_workout_is_saved_once(api):
    """A workout synced again after a lost response must not be duplicated."""
    register(api)
    key = "0f" * 16
    first = api.post("/api/workouts", json=_workout(title="Once", client_id=key))
    assert first.status_code == 201
    again = api.post("/api/workouts", json=_workout(title="Once", client_id=key))
    assert again.status_code == 200
    assert again.json["workout"]["id"] == first.json["workout"]["id"]
    assert api.get("/api/workouts").json["total"] == 1
    # A different key is a different workout.
    assert api.post("/api/workouts", json=_workout(client_id="1a" * 16)).status_code == 201
    assert api.get("/api/workouts").json["total"] == 2
    for bad in ("short", "Z" * 32, 42, "../" + "a" * 29):
        assert api.post("/api/workouts", json=_workout(client_id=bad)).json["error"] == "client_id_invalid"


def test_programs_are_periodized():
    """Every week is its own session plan: no two consecutive weeks are the
    same, phases change exercises, and each week has every training day."""
    index = exercise_index()
    for p in programs():
        plan = p["plan"]
        assert len(plan) == p["weeks"], p["id"]
        day_ids = [d["id"] for d in plan[0]["days"]]
        assert len(day_ids) == p["days_per_week"], p["id"]
        for week in plan:
            assert [d["id"] for d in week["days"]] == day_ids
            assert week["note"]["en"] and week["note"]["fr"]
            for day in week["days"]:
                for x in day["exercises"]:
                    assert index[x["id"]]["equipment"] in p["equipment"], (p["id"], x["id"])
                    assert x["sets"] >= 1 and x["reps"] and x["rest"] > 0
        for a, b in zip(plan, plan[1:]):
            assert a["days"] != b["days"], (p["id"], a["week"])
        # More than one phase, and the exercise selection changes at least once.
        selections = {tuple(x["id"] for d in w["days"] for x in d["exercises"]) for w in plan}
        assert len(p["phases"]) >= 2 and len(selections) >= 2, p["id"]


def test_program_list_is_light_and_detail_has_plan(api):
    listed = api.get("/api/programs").json["programs"]
    assert listed and all("plan" not in p and p["phases"] for p in listed)
    detail = api.get("/api/programs/peak-strength-block").json["program"]
    loads = [w["days"][0]["exercises"][0]["pct"] for w in detail["plan"]]
    assert loads == [82, 86, 90, [90, 102]]


def test_workout_day_must_exist_in_that_week(api):
    register(api)
    ok = api.post("/api/workouts", json=_workout(program_id="push-pull-legs", day_id="legs-b", week=5))
    assert ok.status_code == 201
    bad_week = api.post("/api/workouts", json=_workout(program_id="peak-strength-block", day_id="squat", week=9))
    assert bad_week.json["error"] == "program_invalid"


def test_every_exercise_has_an_animated_demonstration():
    """The demonstration player looks movements up by exercise id (frontend/src/motion/demos.ts)."""
    import re
    from pathlib import Path

    source = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "motion" / "demos.ts").read_text(encoding="utf-8")
    table = source[source.index("export const DEMOS") :]
    table = table[: table.index("\n};")]
    demos = set(re.findall(r"^  '?([a-z0-9-]+)'?: ", table, flags=re.MULTILINE))
    ids = set(exercise_index())
    assert ids - demos == set(), "exercises without a demonstration"
    assert demos - ids == set(), "demonstrations for unknown exercises"
