from datetime import datetime, timezone

from app.catalog import exercise_index, generate_workout, programs
from app.routes.workouts import compute_stats

from .conftest import register


def test_catalog_integrity():
    index = exercise_index()
    assert len(index) >= 60
    for p in programs():
        for day in p["days"]:
            for item in day["exercises"]:
                assert item["id"] in index, (p["id"], item["id"])
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
