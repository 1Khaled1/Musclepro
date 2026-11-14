"""Signed-in user's own profile, password, favorites and program enrollments."""
from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from .. import coaching, custom_programs
from ..catalog import get_exercise
from ..security import (
    ApiError,
    clear_session_cookie,
    hash_password,
    issue_token,
    login_required,
    set_session_cookie,
    throttle,
    validate_password,
    verify_password,
)
from ..users import delete_user_data, now_iso, public_user, validate_profile

bp = Blueprint("me", __name__, url_prefix="/api/me")


def _store():
    return current_app.extensions["store"]


def _json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    return data


@bp.patch("")
@login_required
def update_profile():
    changes = validate_profile(_json())
    if changes:
        _store().update(f"users/{g.user['id']}", changes)
        g.user.update(changes)
    return {"user": public_user(g.user)}


@bp.post("/password")
@login_required
def change_password():
    data = _json()
    current = data.get("current") if isinstance(data.get("current"), str) else ""
    if not verify_password(g.user.get("password_hash"), current):
        raise ApiError("password_incorrect", 403)
    new = validate_password(data.get("new"))
    version = int(g.user.get("token_version", 0)) + 1
    _store().update(
        f"users/{g.user['id']}", {"password_hash": hash_password(new), "token_version": version}
    )
    g.user.update(token_version=version)
    # Every other session is now invalid; re-issue one for this browser.
    resp = jsonify({"ok": True})
    set_session_cookie(resp, issue_token(g.user))
    return resp


@bp.post("/logout-all")
@login_required
def logout_everywhere():
    version = int(g.user.get("token_version", 0)) + 1
    _store().update(f"users/{g.user['id']}", {"token_version": version})
    resp = jsonify({"ok": True})
    clear_session_cookie(resp)
    return resp


@bp.delete("")
@login_required
def delete_account():
    data = _json()
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not verify_password(g.user.get("password_hash"), password):
        raise ApiError("password_incorrect", 403)
    delete_user_data(_store(), g.user)
    resp = jsonify({"ok": True})
    clear_session_cookie(resp)
    return resp


# -- favorites ---------------------------------------------------------------
@bp.get("/favorites")
@login_required
def favorites():
    favs = _store().get(f"favorites/{g.user['id']}") or {}
    return {"favorites": sorted(favs.keys())}


@bp.put("/favorites/<exercise_id>")
@login_required
def add_favorite(exercise_id: str):
    if not get_exercise(exercise_id):
        raise ApiError("not_found", 404)
    _store().set(f"favorites/{g.user['id']}/{exercise_id}", True)
    return {"ok": True}


@bp.delete("/favorites/<exercise_id>")
@login_required
def remove_favorite(exercise_id: str):
    if not get_exercise(exercise_id):
        raise ApiError("not_found", 404)
    _store().delete(f"favorites/{g.user['id']}/{exercise_id}")
    return {"ok": True}


# -- programs ----------------------------------------------------------------
@bp.get("/programs")
@login_required
def my_programs():
    return {"enrollments": _store().get(f"enrollments/{g.user['id']}") or {}}


@bp.post("/programs/<program_id>")
@login_required
def enroll(program_id: str):
    if not custom_programs.resolve(_store(), program_id, g.user):
        raise ApiError("not_found", 404)
    path = f"enrollments/{g.user['id']}/{program_id}"
    existing = _store().get(path)
    if not existing:
        existing = {"started_at": now_iso(), "completed": {}}
        _store().set(path, {"started_at": existing["started_at"]})
    return {"enrollment": existing}, 201


@bp.delete("/programs/<program_id>")
@login_required
def unenroll(program_id: str):
    # Leaving also works for a custom program that was deleted or made private since.
    if not custom_programs.resolve(_store(), program_id, g.user) and not custom_programs.ID_RE.fullmatch(program_id):
        raise ApiError("not_found", 404)
    _store().delete(f"enrollments/{g.user['id']}/{program_id}")
    return {"ok": True}


# -- coach -------------------------------------------------------------------
def _my_coach() -> dict:
    found = coaching.coach_of(_store(), g.user["id"])
    if not found:
        return {"coach": None, "assignment": None}
    assignment = _store().get(f"coach_assignments/{g.user['id']}")
    if assignment and not custom_programs.resolve(_store(), assignment.get("program_id", ""), g.user):
        assignment = None
    return {
        "coach": {"name": found["coach"].get("name"), "since": found["since"]},
        "assignment": assignment and {k: assignment.get(k) for k in ("program_id", "note", "at")},
    }


@bp.get("/coach")
@login_required
def my_coach():
    return _my_coach()


@bp.post("/coach")
@login_required
def join_coach():
    """Join a coach with their invite code: from now on they can see this athlete's training."""
    throttle("coach-join")
    code = coaching.normalize_code(_json().get("code"))
    coach_id = _store().get(f"coach_codes/{code}") if len(code) == coaching.CODE_LEN else None
    coach = _store().get(f"users/{coach_id}") if coach_id else None
    if not coach or coach.get("role") not in coaching.COACH_ROLES or not coach.get("active", True):
        raise ApiError("coach_code_invalid", 404)
    if coach_id == g.user["id"]:
        raise ApiError("coach_self")
    current = coaching.coach_of(_store(), g.user["id"])
    if current and current["coach"]["id"] != coach_id:
        raise ApiError("coach_already", 409)
    if not current:
        if len(_store().get(f"coach_athletes/{coach_id}") or {}) >= coaching.MAX_ATHLETES:
            raise ApiError("coach_full", 409)
        coaching.link(_store(), coach_id, g.user["id"], now_iso())
    return _my_coach(), 201


@bp.delete("/coach")
@login_required
def leave_coach():
    link = _store().get(f"coach_of/{g.user['id']}")
    if isinstance(link, dict) and link.get("coach_id"):
        coaching.unlink(_store(), link["coach_id"], g.user["id"])
    return {"ok": True}


# -- custom programs ---------------------------------------------------------
@bp.get("/custom-programs")
@login_required
def my_custom_programs():
    return {"programs": custom_programs.list_for(_store(), g.user["id"])}


@bp.post("/custom-programs")
@login_required
def create_custom_program():
    """Create from the editor's template, or copy any program the user can open ({"from": id})."""
    data = _json()
    if "from" in data:
        source = custom_programs.resolve(_store(), data.get("from"), g.user)
        if not source:
            raise ApiError("not_found", 404)
        lang = g.user.get("lang", "en")
        template = custom_programs.template_from(source, lang, " (copie)" if lang == "fr" else " (copy)")
    else:
        template = custom_programs.validate_template(data)
    doc = custom_programs.create(_store(), g.user, template)
    return {"program": custom_programs.resolve(_store(), doc["id"], g.user)}, 201


def _template(doc: dict) -> dict:
    keys = ("id", "name", "description", "level", "goal", "weeks", "deload_every", "visibility", "days")
    return {k: doc.get(k) for k in keys}


@bp.get("/custom-programs/<program_id>")
@login_required
def custom_program_template(program_id: str):
    """The editable template (owner only)."""
    return {"template": _template(custom_programs.owned(_store(), program_id, g.user["id"]))}


@bp.put("/custom-programs/<program_id>")
@login_required
def update_custom_program(program_id: str):
    doc = custom_programs.owned(_store(), program_id, g.user["id"])
    template = custom_programs.validate_template(_json())
    doc.update(template, updated_at=now_iso())
    _store().set(f"custom_programs/{program_id}", doc)
    return {"program": custom_programs.resolve(_store(), program_id, g.user)}


@bp.delete("/custom-programs/<program_id>")
@login_required
def delete_custom_program(program_id: str):
    custom_programs.delete(_store(), custom_programs.owned(_store(), program_id, g.user["id"]))
    return {"ok": True}
