"""Coach mode: a coach's athletes, their training, program assignments and feedback."""
from __future__ import annotations

import re
from functools import wraps

from flask import Blueprint, current_app, g, request

from .. import coaching
from ..catalog import get_program
from ..recovery import compute_recovery
from ..security import ApiError
from ..users import now_iso
from .workouts import _workouts_for, compute_stats

bp = Blueprint("coach", __name__, url_prefix="/api/coach")

WORKOUT_ID_RE = re.compile(r"[0-9a-f]{19}")


def _store():
    return current_app.extensions["store"]


def coach_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = g.get("user")
        if not user:
            raise ApiError("auth_required", 401)
        if user.get("role") not in coaching.COACH_ROLES:
            raise ApiError("forbidden", 403)
        return fn(*args, **kwargs)

    return wrapper


def _athlete(athlete_id: str) -> dict:
    """The athlete's record, only if they are linked to the signed-in coach."""
    if not athlete_id.isalnum() or len(athlete_id) > 40 or not coaching.is_athlete_of(_store(), g.user["id"], athlete_id):
        raise ApiError("not_found", 404)
    user = _store().get(f"users/{athlete_id}")
    if not user:
        raise ApiError("not_found", 404)
    return user


def _card(user: dict) -> dict:
    """What a coach may know about an athlete: no e-mail address."""
    return {k: user.get(k) for k in ("id", "name", "level", "goal", "unit", "body")}


def _assignment(athlete_id: str) -> dict | None:
    a = _store().get(f"coach_assignments/{athlete_id}")
    program = get_program(a.get("program_id", "")) if isinstance(a, dict) else None
    if not program:
        return None
    done = _store().get(f"enrollments/{athlete_id}/{program['id']}/completed") or {}
    return {
        "program_id": program["id"],
        "note": a.get("note", ""),
        "at": a.get("at"),
        "done": len(done),
        "total": sum(len(week["days"]) for week in program["plan"]),
    }


@bp.get("")
@coach_required
def overview():
    store = _store()
    links = store.get(f"coach_athletes/{g.user['id']}") or {}
    athletes = []
    for athlete_id, link in links.items():
        user = store.get(f"users/{athlete_id}")
        if not user or not coaching.is_athlete_of(store, g.user["id"], athlete_id):
            continue
        workouts = _workouts_for(athlete_id)
        stats = compute_stats(workouts)
        athletes.append(
            {
                **_card(user),
                "since": (link or {}).get("since"),
                "last_workout_at": workouts[0].get("finished_at") if workouts else None,
                "sessions": stats["sessions"],
                "this_week": stats["this_week"],
                "streak_weeks": stats["streak_weeks"],
                "assignment": _assignment(athlete_id),
            }
        )
    athletes.sort(key=lambda a: a["last_workout_at"] or "", reverse=True)
    return {"code": coaching.show_code(coaching.code_for(store, g.user["id"])), "athletes": athletes}


@bp.post("/code")
@coach_required
def renew_code():
    """New invite code; the old one stops working. Athletes already linked stay."""
    return {"code": coaching.show_code(coaching.code_for(_store(), g.user["id"], renew=True))}


@bp.get("/athletes/<athlete_id>")
@coach_required
def athlete(athlete_id: str):
    user = _athlete(athlete_id)
    workouts = _workouts_for(athlete_id)
    comments = _store().get(f"coach_comments/{athlete_id}") or {}
    recent = []
    for w in workouts[:20]:
        c = comments.get(w.get("id"))
        recent.append({**w, "coach_comment": c and {"text": c.get("text", ""), "at": c.get("at")}})
    return {
        "athlete": _card(user),
        "since": (_store().get(f"coach_of/{athlete_id}") or {}).get("since"),
        "stats": compute_stats(workouts),
        "recovery": compute_recovery(workouts),
        "workouts": recent,
        "assignment": _assignment(athlete_id),
    }


@bp.delete("/athletes/<athlete_id>")
@coach_required
def remove_athlete(athlete_id: str):
    _athlete(athlete_id)
    coaching.unlink(_store(), g.user["id"], athlete_id)
    return {"ok": True}


def _text(value, limit: int, code: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ApiError(code)
    return value.strip()


@bp.put("/athletes/<athlete_id>/program")
@coach_required
def assign_program(athlete_id: str):
    _athlete(athlete_id)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    program = get_program(data.get("program_id")) if isinstance(data.get("program_id"), str) else None
    if not program:
        raise ApiError("program_invalid")
    note = _text(data.get("note"), 500, "note_invalid")
    store = _store()
    updates = {f"coach_assignments/{athlete_id}": {"program_id": program["id"], "note": note, "by": g.user["id"], "at": now_iso()}}
    # Assigning starts the program for the athlete if they have not started it.
    if not store.get(f"enrollments/{athlete_id}/{program['id']}"):
        updates[f"enrollments/{athlete_id}/{program['id']}"] = {"started_at": now_iso()}
    store.update("/", updates)
    return {"assignment": _assignment(athlete_id)}


@bp.delete("/athletes/<athlete_id>/program")
@coach_required
def unassign_program(athlete_id: str):
    _athlete(athlete_id)
    _store().delete(f"coach_assignments/{athlete_id}")
    return {"ok": True}


@bp.put("/athletes/<athlete_id>/workouts/<workout_id>/comment")
@coach_required
def comment(athlete_id: str, workout_id: str):
    """Feedback on one workout; an empty text removes it."""
    _athlete(athlete_id)
    if not WORKOUT_ID_RE.fullmatch(workout_id) or not _store().get(f"workouts/{athlete_id}/{workout_id}"):
        raise ApiError("not_found", 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    text = _text(data.get("text"), 600, "comment_invalid")
    path = f"coach_comments/{athlete_id}/{workout_id}"
    if not text:
        _store().delete(path)
        return {"comment": None}
    entry = {"text": text, "by": g.user["id"], "at": now_iso()}
    _store().set(path, entry)
    return {"comment": {"text": text, "at": entry["at"]}}
