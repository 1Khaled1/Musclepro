"""Recovery map and recovery-aware generator."""
from datetime import datetime, timedelta, timezone

from app.catalog import exercise_index, generate_workout
from app.recovery import compute_recovery

from .conftest import register

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)


def workout(hours_ago, entries):
    return {
        "finished_at": (NOW - timedelta(hours=hours_ago)).isoformat(),
        "entries": [{"exercise_id": ex, "sets": [{"reps": 8, "weight": 50, "unit": "kg", "done": True}] * n} for ex, n in entries],
    }


def test_no_training_means_everything_is_fresh():
    rec = compute_recovery([], NOW)
    assert len(rec) == 14
    assert all(r == {"readiness": 100, "status": "fresh", "ready_in_h": 0} for r in rec.values())


def test_a_heavy_leg_day_tires_the_legs_then_fades():
    legs = [("back-squat", 5), ("leg-press", 4), ("leg-extension", 3)]  # 12 quad sets
    just_after = compute_recovery([workout(1, legs)], NOW)
    assert just_after["quads"]["status"] == "tired" and just_after["quads"]["readiness"] < 10
    assert just_after["chest"]["status"] == "fresh"
    assert 50 <= just_after["quads"]["ready_in_h"] <= 60  # fresh again after two to three days
    next_day = compute_recovery([workout(30, legs)], NOW)
    assert next_day["quads"]["status"] == "tired" and next_day["quads"]["readiness"] > just_after["quads"]["readiness"]
    assert compute_recovery([workout(48, legs)], NOW)["quads"]["status"] == "recovering"
    assert compute_recovery([workout(80, legs)], NOW)["quads"]["status"] == "fresh"


def test_a_few_sets_recover_by_the_next_day_and_secondary_muscles_count_half():
    light = [workout(2, [("barbell-bench-press", 3)])]
    rec = compute_recovery(light, NOW)
    assert rec["chest"]["status"] == "recovering" and rec["chest"]["ready_in_h"] <= 14
    assert rec["triceps"]["readiness"] > rec["chest"]["readiness"]  # secondary: half the fatigue
    assert compute_recovery([workout(20, [("barbell-bench-press", 3)])], NOW)["chest"]["status"] == "fresh"


def test_sessions_add_up_and_stretching_does_not_count():
    two = [workout(4, [("barbell-bench-press", 4)]), workout(28, [("push-up", 4)])]
    one = [workout(4, [("barbell-bench-press", 4)])]
    assert compute_recovery(two, NOW)["chest"]["readiness"] < compute_recovery(one, NOW)["chest"]["readiness"]
    assert compute_recovery([workout(1, [("cobra-stretch", 5)])], NOW)["abs"]["status"] == "fresh"


def test_full_body_generator_leaves_tired_muscles_out():
    rec = compute_recovery([workout(1, [("back-squat", 6), ("leg-press", 6), ("hip-thrust", 6), ("romanian-deadlift", 6)])], NOW)
    params = {"equipment": ["barbell", "dumbbell", "machine"], "level": "intermediate", "goal": "hypertrophy", "minutes": 50}
    for seed in range(15):
        w = generate_workout(params, seed=seed, recovery=rec)
        assert {"quads", "glutes"} <= set(w["skipped"]) and w["tired"] == []
        for x in w["exercises"]:
            assert not {"quads", "glutes", "hamstrings"} & set(exercise_index()[x["id"]]["primary"]), x["id"]
    # Muscles asked for by name are kept, and flagged.
    w = generate_workout({**params, "muscles": ["quads", "chest"]}, seed=1, recovery=rec)
    assert w["tired"] == ["quads"] and w["skipped"] == []
    assert any("quads" in exercise_index()[x["id"]]["primary"] for x in w["exercises"])
    # Without a recovery map nothing changes.
    plain = generate_workout(params, seed=1)
    assert plain["skipped"] == [] and plain["tired"] == []


def test_recovery_endpoints(api):
    assert api.get("/api/workouts/recovery").status_code == 401
    register(api)
    assert api.get("/api/workouts/recovery").json["recovery"]["quads"]["status"] == "fresh"
    sets = [{"reps": 8, "weight": 80, "unit": "kg"}] * 6
    w = {"title": "Legs", "entries": [{"exercise_id": ex, "sets": sets} for ex in ("back-squat", "leg-press")]}
    assert api.post("/api/workouts", json=w).status_code == 201
    rec = api.get("/api/workouts/recovery").json["recovery"]
    assert rec["quads"]["status"] == "tired" and rec["chest"]["status"] == "fresh"
    body = {"equipment": ["barbell", "dumbbell"], "level": "intermediate", "goal": "hypertrophy", "minutes": 45}
    assert "quads" in api.post("/api/generate", json=body).json["skipped"]
    assert api.post("/api/generate", json={**body, "recovery": False}).json["skipped"] == []
