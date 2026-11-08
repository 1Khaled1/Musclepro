"""Signed-in user's own profile, password, favorites and program enrollments."""
from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from ..catalog import get_exercise, get_program
from ..security import (
    ApiError,
    clear_session_cookie,
    hash_password,
    issue_token,
    login_required,
    set_session_cookie,
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
    if not get_program(program_id):
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
    if not get_program(program_id):
        raise ApiError("not_found", 404)
    _store().delete(f"enrollments/{g.user['id']}/{program_id}")
    return {"ok": True}
