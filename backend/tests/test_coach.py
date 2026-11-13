"""Coach mode: consent-based links, what a coach can see and do, and what they cannot."""
from .conftest import Api, register

SETS = [{"reps": 5, "weight": 100, "unit": "kg"}] * 3
WORKOUT = {"title": "Legs", "entries": [{"exercise_id": "back-squat", "sets": SETS}]}


def user(app, email, name, role=None):
    """A signed-in API client for a fresh account (optionally promoted to a role)."""
    api = Api(app.test_client())
    uid = api.post("/api/auth/register", json={"email": email, "password": "Strong1234", "name": name}).json["user"]["id"]
    if role:
        app.extensions["store"].update(f"users/{uid}", {"role": role})
    return api, uid


def test_only_coaches_reach_coach_endpoints(app):
    anon = Api(app.test_client())
    assert anon.get("/api/coach").status_code == 401
    athlete, _ = user(app, "ana@example.com", "Ana")
    assert athlete.get("/api/coach").status_code == 403
    assert athlete.post("/api/coach/code").status_code == 403


def test_join_with_code_then_coach_sees_training_but_no_email(app):
    coach, coach_id = user(app, "khalil@example.com", "Khalil", role="coach")
    athlete, athlete_id = user(app, "ana@example.com", "Ana")
    athlete.post("/api/workouts", json=WORKOUT)

    code = coach.get("/api/coach").json["code"]
    assert len(code) == 9 and code[4] == "-"
    assert coach.get("/api/coach").json["athletes"] == []
    # Before the athlete joins, the coach cannot open them.
    assert coach.get(f"/api/coach/athletes/{athlete_id}").status_code == 404

    assert athlete.get("/api/me/coach").json == {"coach": None, "assignment": None}
    assert athlete.post("/api/me/coach", json={"code": "WRONG-CODE"}).status_code == 404
    r = athlete.post("/api/me/coach", json={"code": code.lower().replace("-", " ")})  # typed loosely
    assert r.status_code == 201 and r.json["coach"]["name"] == "Khalil"

    listed = coach.get("/api/coach").json["athletes"]
    assert [a["name"] for a in listed] == ["Ana"] and listed[0]["sessions"] == 1 and listed[0]["last_workout_at"]
    detail = coach.get(f"/api/coach/athletes/{athlete_id}").json
    assert detail["athlete"]["name"] == "Ana" and "email" not in detail["athlete"]
    assert "ana@example.com" not in str(coach.get("/api/coach").json) + str(detail)
    assert detail["stats"]["sessions"] == 1 and detail["recovery"]["quads"]["status"] != "fresh"
    assert detail["workouts"][0]["title"] == "Legs"


def test_assign_program_and_comment_reach_the_athlete(app):
    coach, _ = user(app, "khalil@example.com", "Khalil", role="coach")
    athlete, athlete_id = user(app, "ana@example.com", "Ana")
    wid = athlete.post("/api/workouts", json=WORKOUT).json["workout"]["id"]
    athlete.post("/api/me/coach", json={"code": coach.get("/api/coach").json["code"]})

    r = coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": "upper-lower-strength", "note": "  Start Monday.  "})
    assert r.status_code == 200 and r.json["assignment"]["total"] > 0 and r.json["assignment"]["done"] == 0
    mine = athlete.get("/api/me/coach").json
    assert mine["assignment"]["program_id"] == "upper-lower-strength" and mine["assignment"]["note"] == "Start Monday."
    assert "upper-lower-strength" in athlete.get("/api/me/programs").json["enrollments"]  # started for them
    assert coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": "nope"}).status_code == 400
    assert coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": "push-pull-legs", "note": "x" * 501}).status_code == 400

    c = coach.put(f"/api/coach/athletes/{athlete_id}/workouts/{wid}/comment", json={"text": "Good depth. Add 5 kg."})
    assert c.status_code == 200
    assert athlete.get("/api/workouts").json["workouts"][0]["coach_comment"]["text"] == "Good depth. Add 5 kg."
    assert coach.get(f"/api/coach/athletes/{athlete_id}").json["workouts"][0]["coach_comment"]["text"] == "Good depth. Add 5 kg."
    assert coach.put(f"/api/coach/athletes/{athlete_id}/workouts/{'0' * 19}/comment", json={"text": "x"}).status_code == 404
    # An empty text removes the comment.
    coach.put(f"/api/coach/athletes/{athlete_id}/workouts/{wid}/comment", json={"text": " "})
    assert "coach_comment" not in athlete.get("/api/workouts").json["workouts"][0]

    assert coach.delete(f"/api/coach/athletes/{athlete_id}/program").status_code == 200
    assert athlete.get("/api/me/coach").json["assignment"] is None


def test_leaving_cuts_access_at_once(app):
    coach, _ = user(app, "khalil@example.com", "Khalil", role="coach")
    athlete, athlete_id = user(app, "ana@example.com", "Ana")
    athlete.post("/api/me/coach", json={"code": coach.get("/api/coach").json["code"]})
    coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": "push-pull-legs"})
    assert athlete.delete("/api/me/coach").status_code == 200
    assert athlete.get("/api/me/coach").json == {"coach": None, "assignment": None}
    assert coach.get("/api/coach").json["athletes"] == []
    for call in (
        lambda: coach.get(f"/api/coach/athletes/{athlete_id}"),
        lambda: coach.put(f"/api/coach/athletes/{athlete_id}/program", json={"program_id": "push-pull-legs"}),
        lambda: coach.delete(f"/api/coach/athletes/{athlete_id}"),
    ):
        assert call().status_code == 404


def test_one_coach_at_a_time_no_self_coaching_and_other_coaches_see_nothing(app):
    coach, _ = user(app, "khalil@example.com", "Khalil", role="coach")
    other, _ = user(app, "sam@example.com", "Sam", role="coach")
    athlete, athlete_id = user(app, "ana@example.com", "Ana")
    code, other_code = coach.get("/api/coach").json["code"], other.get("/api/coach").json["code"]
    assert coach.post("/api/me/coach", json={"code": code}).json["error"] == "coach_self"
    athlete.post("/api/me/coach", json={"code": code})
    assert athlete.post("/api/me/coach", json={"code": other_code}).status_code == 409
    assert other.get(f"/api/coach/athletes/{athlete_id}").status_code == 404
    assert other.get("/api/coach").json["athletes"] == []


def test_renewed_code_kills_the_old_one_and_keeps_athletes(app):
    coach, _ = user(app, "khalil@example.com", "Khalil", role="coach")
    first, _ = user(app, "ana@example.com", "Ana")
    late, _ = user(app, "bo@example.com", "Bo")
    old = coach.get("/api/coach").json["code"]
    first.post("/api/me/coach", json={"code": old})
    new = coach.post("/api/coach/code").json["code"]
    assert new != old and coach.get("/api/coach").json["code"] == new
    assert late.post("/api/me/coach", json={"code": old}).status_code == 404
    assert late.post("/api/me/coach", json={"code": new}).status_code == 201
    assert len(coach.get("/api/coach").json["athletes"]) == 2


def test_coach_removes_athlete_and_demoted_or_deleted_coach_loses_everything(app):
    store = app.extensions["store"]
    coach, coach_id = user(app, "khalil@example.com", "Khalil", role="coach")
    a1, a1_id = user(app, "ana@example.com", "Ana")
    a2, a2_id = user(app, "bo@example.com", "Bo")
    code = coach.get("/api/coach").json["code"]
    a1.post("/api/me/coach", json={"code": code})
    a2.post("/api/me/coach", json={"code": code})
    assert coach.delete(f"/api/coach/athletes/{a1_id}").status_code == 200
    assert a1.get("/api/me/coach").json["coach"] is None
    # Demoted: no access, and the athlete's link is cleaned up when they look.
    store.update(f"users/{coach_id}", {"role": "user"})
    assert coach.get("/api/coach").status_code == 403
    assert a2.get("/api/me/coach").json["coach"] is None and store.get(f"coach_athletes/{coach_id}/{a2_id}") is None
    # Deleting an account removes its coaching data, as coach and as athlete.
    store.update(f"users/{coach_id}", {"role": "coach"})
    a2.post("/api/me/coach", json={"code": code})
    assert coach.delete("/api/me", json={"password": "Strong1234"}).status_code == 200
    assert store.get(f"coach_of/{a2_id}") is None and store.get("coach_codes") in (None, {})
    assert a2.get("/api/me/coach").json["coach"] is None
