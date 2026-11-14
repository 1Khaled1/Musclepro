"""Custom programs: building, access rules, and working with the rest of the app."""
from .conftest import Api
from .test_coach import user

TEMPLATE = {
    "name": "  My  Upper/Lower ",
    "description": "Two days, simple.",
    "level": "intermediate",
    "goal": "strength",
    "weeks": 8,
    "deload_every": 4,
    "days": [
        {"name": "Upper", "exercises": [{"id": "barbell-bench-press", "sets": 5, "reps": "5", "rest": 150, "rpe": 8}, {"id": "pull-up", "sets": 3, "reps": "6–8", "rest": 120}]},
        {"name": "", "exercises": [{"id": "back-squat", "sets": 4, "reps": "8-10", "rest": 150}, {"id": "plank", "sets": 3, "reps": "45s", "rest": 60}]},
    ],
}


def test_create_expands_to_a_full_program_with_deload_weeks(app):
    api, _ = user(app, "ana@example.com", "Ana")
    r = api.post("/api/me/custom-programs", json=TEMPLATE)
    assert r.status_code == 201
    p = r.json["program"]
    assert p["id"].startswith("u") and p["custom"] and p["mine"] and p["visibility"] == "private"
    assert p["name"]["en"] == "My Upper/Lower" and p["days_per_week"] == 2 and p["weeks"] == 8
    assert p["owner_name"] == "Ana" and set(p["equipment"]) == {"barbell", "bodyweight"}
    assert [w["deload"] for w in p["plan"]] == [False, False, False, True, False, False, False, True]
    normal, deload = p["plan"][0]["days"][0]["exercises"][0], p["plan"][3]["days"][0]["exercises"][0]
    assert (normal["sets"], normal["rpe"]) == (5, 8) and (deload["sets"], deload["rpe"]) == (3, 6)
    assert p["plan"][0]["days"][0]["exercises"][1]["reps"] == "6-8"  # dash normalised
    assert p["plan"][0]["days"][1]["name"]["fr"] == "Day 2" and p["plan"][0]["days"][1]["id"] == "d2"

    listed = api.get("/api/me/custom-programs").json["programs"]
    assert [x["id"] for x in listed] == [p["id"]] and "plan" not in listed[0]
    tpl = api.get(f"/api/me/custom-programs/{p['id']}").json["template"]
    assert tpl["days"][0]["name"] == "Upper" and tpl["deload_every"] == 4


def test_validation_rejects_bad_templates(app):
    api, _ = user(app, "ana@example.com", "Ana")
    ex = {"id": "back-squat", "sets": 3, "reps": "5", "rest": 90}
    def bad(**change):
        return api.post("/api/me/custom-programs", json={**TEMPLATE, **change}).status_code
    assert bad(name=" ") == 400 and bad(name="x" * 81) == 400
    assert bad(weeks=0) == 400 and bad(weeks=25) == 400 and bad(deload_every=2) == 400
    assert bad(level="hero") == 400 and bad(visibility="public") == 400
    assert bad(days=[]) == 400 and bad(days=[{"name": "A", "exercises": []}]) == 400
    assert bad(days=[{"name": "A", "exercises": [ex]}] * 8) == 400
    for change in ({"id": "nope"}, {"sets": 0}, {"sets": 11}, {"reps": "lots"}, {"reps": "<b>5</b>"}, {"rest": 601}, {"rpe": 11}, {"rpe": 7.3}):
        assert bad(days=[{"name": "A", "exercises": [{**ex, **change}]}]) == 400, change
    assert Api(app.test_client()).post("/api/me/custom-programs", json=TEMPLATE).status_code == 401


def test_private_by_default_then_shared_by_link(app):
    owner, _ = user(app, "ana@example.com", "Ana")
    other, _ = user(app, "bo@example.com", "Bo")
    anon = Api(app.test_client())
    pid = owner.post("/api/me/custom-programs", json=TEMPLATE).json["program"]["id"]
    assert owner.get(f"/api/programs/{pid}").status_code == 200
    for stranger in (other, anon):
        assert stranger.get(f"/api/programs/{pid}").status_code == 404
    assert other.post(f"/api/me/programs/{pid}").status_code == 404
    assert other.get(f"/api/me/custom-programs/{pid}").status_code == 404
    assert other.put(f"/api/me/custom-programs/{pid}", json=TEMPLATE).status_code == 404
    assert other.delete(f"/api/me/custom-programs/{pid}").status_code == 404

    assert owner.put(f"/api/me/custom-programs/{pid}", json={**TEMPLATE, "visibility": "link"}).json["program"]["visibility"] == "link"
    seen = other.get(f"/api/programs/{pid}").json["program"]
    assert seen["owner_name"] == "Ana" and seen["mine"] is False and "visibility" not in seen
    assert anon.get(f"/api/programs/{pid}").status_code == 200
    assert other.post(f"/api/me/programs/{pid}").status_code == 201
    # Still only the owner edits or deletes.
    assert other.put(f"/api/me/custom-programs/{pid}", json=TEMPLATE).status_code == 404
    # Built-in program pages are untouched, and unknown ids stay unknown.
    assert anon.get("/api/programs/push-pull-legs").status_code == 200
    assert anon.get("/api/programs/u0000000000000000").status_code == 404


def test_enroll_log_and_progress_on_a_custom_program(app):
    api, _ = user(app, "ana@example.com", "Ana")
    pid = api.post("/api/me/custom-programs", json=TEMPLATE).json["program"]["id"]
    assert api.post(f"/api/me/programs/{pid}").status_code == 201
    w = {"title": "Upper", "program_id": pid, "day_id": "d1", "week": 1, "entries": [{"exercise_id": "barbell-bench-press", "sets": [{"reps": 5, "weight": 60, "unit": "kg"}] * 5}]}
    assert api.post("/api/workouts", json=w).status_code == 201
    assert "w1-d1" in api.get("/api/me/programs").json["enrollments"][pid]["completed"]
    assert api.post("/api/workouts", json={**w, "day_id": "d9"}).status_code == 400
    # Week 4 is a deload week of this program: the suggestion is lighter.
    body = {"program_id": pid, "week": 4, "items": [{"id": "barbell-bench-press", "reps": "5", "sets": 3}]}
    assert api.post("/api/workouts/suggest", json=body).json["suggestions"]["barbell-bench-press"]["reason"] == "deload"


def test_copy_a_builtin_program_as_a_starting_point(app):
    api, _ = user(app, "ana@example.com", "Ana")
    r = api.post("/api/me/custom-programs", json={"from": "push-pull-legs"})
    assert r.status_code == 201
    p = r.json["program"]
    assert p["name"]["en"].endswith("(copy)") and p["mine"] and p["days_per_week"] == 6
    assert api.post("/api/me/custom-programs", json={"from": "nope"}).status_code == 404


def test_coach_assigns_own_program_and_athlete_can_open_it(app):
    coach, _ = user(app, "khalil@example.com", "Khalil", role="coach")
    athlete, athlete_id = user(app, "ana@example.com", "Ana")
    stranger, _ = user(app, "bo@example.com", "Bo")
    athlete.post("/api/me/coach", json={"code": coach.get("/api/coach").json["code"]})
    pid = coach.post("/api/me/custom-programs", json=TEMPLATE).json["program"]["id"]
    assert athlete.get(f"/api/programs/{pid}").status_code == 404  # private, not assigned yet
    r = coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": pid, "note": "Yours."})
    assert r.status_code == 200 and r.json["assignment"]["total"] == 16
    assert athlete.get(f"/api/programs/{pid}").json["program"]["owner_name"] == "Khalil"
    assert athlete.get("/api/me/coach").json["assignment"]["program_id"] == pid
    assert stranger.get(f"/api/programs/{pid}").status_code == 404
    # A coach cannot assign somebody else's shared program.
    theirs = stranger.post("/api/me/custom-programs", json={**TEMPLATE, "visibility": "link"}).json["program"]["id"]
    assert coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": theirs}).status_code == 400
    # Leaving the coach ends access to the coach's private program.
    athlete.delete("/api/me/coach")
    assert athlete.get(f"/api/programs/{pid}").status_code == 404
    assert athlete.delete(f"/api/me/programs/{pid}").status_code == 200  # can still tidy the enrollment


def test_limit_delete_and_account_cleanup(app):
    store = app.extensions["store"]
    api, uid = user(app, "ana@example.com", "Ana")
    ids = [api.post("/api/me/custom-programs", json=TEMPLATE).json["program"]["id"] for _ in range(20)]
    assert api.post("/api/me/custom-programs", json=TEMPLATE).status_code == 409
    assert api.delete(f"/api/me/custom-programs/{ids[0]}").status_code == 200
    assert api.get(f"/api/programs/{ids[0]}").status_code == 404 and len(api.get("/api/me/custom-programs").json["programs"]) == 19
    assert api.delete("/api/me", json={"password": "Strong1234"}).status_code == 200
    assert store.get("custom_programs") in (None, {}) and store.get(f"custom_program_ids/{uid}") is None
