"""User management for administrators."""
from __future__ import annotations

from flask import Blueprint, current_app, g, request

from ..security import ApiError, admin_required
from ..users import ROLES, delete_user_data, public_user

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _store():
    return current_app.extensions["store"]


def _get_user(user_id: str) -> dict:
    if not user_id.isalnum() or len(user_id) > 40:
        raise ApiError("not_found", 404)
    user = _store().get(f"users/{user_id}")
    if not user:
        raise ApiError("not_found", 404)
    return user


def _admins(users: dict) -> list[dict]:
    return [u for u in users.values() if u.get("role") == "admin" and u.get("active", True)]


@bp.get("/users")
@admin_required
def list_users():
    q = (request.args.get("q") or "").strip().lower()
    users = _store().get("users") or {}
    workouts = _store().get("workouts") or {}
    items = []
    for u in users.values():
        if q and q not in u.get("email", "").lower() and q not in u.get("name", "").lower():
            continue
        pu = public_user(u)
        pu["workouts"] = len(workouts.get(u["id"]) or {})
        items.append(pu)
    items.sort(key=lambda u: u.get("created_at") or "", reverse=True)
    return {"users": items}


@bp.get("/stats")
@admin_required
def stats():
    users = _store().get("users") or {}
    workouts = _store().get("workouts") or {}
    levels: dict[str, int] = {}
    for u in users.values():
        levels[u.get("level", "beginner")] = levels.get(u.get("level", "beginner"), 0) + 1
    return {
        "users": len(users),
        "active": sum(1 for u in users.values() if u.get("active", True)),
        "admins": len(_admins(users)),
        "workouts": sum(len(v or {}) for v in workouts.values()),
        "levels": levels,
        "storage": _store().kind,
    }


@bp.patch("/users/<user_id>")
@admin_required
def update_user(user_id: str):
    user = _get_user(user_id)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    changes: dict = {}
    if "role" in data:
        if data["role"] not in ROLES:
            raise ApiError("role_invalid")
        changes["role"] = data["role"]
    if "active" in data:
        if not isinstance(data["active"], bool):
            raise ApiError("bad_request")
        changes["active"] = data["active"]
        if not data["active"]:
            # Kill existing sessions of a suspended account immediately.
            changes["token_version"] = int(user.get("token_version", 0)) + 1

    demoting = changes.get("role", "admin") != "admin" or changes.get("active") is False
    if user.get("role") == "admin" and demoting:
        if user_id == g.user["id"]:
            raise ApiError("cannot_modify_self", 400)
        if len(_admins(_store().get("users") or {})) <= 1:
            raise ApiError("last_admin", 400)

    if changes:
        _store().update(f"users/{user_id}", changes)
        user.update(changes)
    return {"user": public_user(user)}


@bp.delete("/users/<user_id>")
@admin_required
def delete_user(user_id: str):
    user = _get_user(user_id)
    if user_id == g.user["id"]:
        raise ApiError("cannot_modify_self", 400)
    delete_user_data(_store(), user)
    return {"ok": True}
