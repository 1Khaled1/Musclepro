from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from ..security import (
    ApiError,
    clear_session_cookie,
    issue_token,
    normalize_email,
    set_session_cookie,
    throttle,
    validate_password,
    verify_password,
)
from ..users import create_user, find_user_by_email, public_user, validate_profile

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    return data


def _store():
    return current_app.extensions["store"]


@bp.post("/register")
def register():
    throttle("register")
    data = _json()
    email = normalize_email(data.get("email"))
    password = validate_password(data.get("password"))
    profile = validate_profile(
        {k: data[k] for k in ("name", "level", "lang", "goal", "unit", "body") if k in data},
        partial=False,
    )
    user = create_user(_store(), email, password, profile)
    resp = jsonify({"user": public_user(user)})
    set_session_cookie(resp, issue_token(user))
    return resp, 201


@bp.post("/login")
def login():
    throttle("login")
    data = _json()
    try:
        email = normalize_email(data.get("email"))
    except ApiError:
        raise ApiError("invalid_credentials", 401) from None
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    user = find_user_by_email(_store(), email)
    # verify_password runs a real hash even for unknown users (timing parity).
    ok = verify_password(user.get("password_hash") if user else None, password)
    if not user or not ok:
        raise ApiError("invalid_credentials", 401)
    if not user.get("active", True):
        raise ApiError("account_disabled", 403)
    resp = jsonify({"user": public_user(user)})
    set_session_cookie(resp, issue_token(user))
    return resp


@bp.post("/logout")
def logout():
    resp = jsonify({"ok": True})
    clear_session_cookie(resp)
    return resp


@bp.get("/me")
def me():
    user = g.get("user")
    return {"user": public_user(user) if user else None}
