"""User records: creation, validation and the public (password-free) view."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from .security import ApiError, email_key, hash_password

LEVELS = ("beginner", "intermediate", "advanced", "pro")
LANGS = ("en", "fr")
UNITS = ("kg", "lbs")
GOALS = ("general", "strength", "hypertrophy", "endurance", "power", "fat_loss")
BODY_TYPES = ("male", "female")
ROLES = ("user", "coach", "admin")

PUBLIC_FIELDS = (
    "id", "email", "name", "role", "level", "lang", "unit", "goal", "body",
    "created_at", "active",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return secrets.token_hex(10)


def public_user(user: dict) -> dict:
    return {k: user.get(k) for k in PUBLIC_FIELDS}


def clean_name(name: Any) -> str:
    if not isinstance(name, str):
        raise ApiError("name_invalid")
    name = " ".join(name.split())
    if not 1 <= len(name) <= 60:
        raise ApiError("name_invalid")
    return name


def _choice(value: Any, allowed: tuple[str, ...], code: str) -> str:
    if value not in allowed:
        raise ApiError(code)
    return value


def validate_profile(data: dict, partial: bool = True) -> dict:
    """Validate the user-editable profile fields. Unknown keys are ignored."""
    out: dict[str, Any] = {}
    if "name" in data or not partial:
        out["name"] = clean_name(data.get("name"))
    if "level" in data:
        out["level"] = _choice(data["level"], LEVELS, "level_invalid")
    if "lang" in data:
        out["lang"] = _choice(data["lang"], LANGS, "lang_invalid")
    if "unit" in data:
        out["unit"] = _choice(data["unit"], UNITS, "unit_invalid")
    if "goal" in data:
        out["goal"] = _choice(data["goal"], GOALS, "goal_invalid")
    if "body" in data:
        out["body"] = _choice(data["body"], BODY_TYPES, "body_invalid")
    return out


def create_user(store, email: str, password: str, profile: dict, role: str = "user") -> dict:
    """Create a user atomically; raises email_taken if the address is used."""
    uid = new_id()
    key = email_key(email)

    def claim(current):
        # Abort (return the existing value unchanged) if someone owns it.
        return current if current else uid

    owner = store.transaction(f"user_emails/{key}", claim)
    if owner != uid:
        raise ApiError("email_taken", 409)

    user = {
        "id": uid,
        "email": email,
        "name": profile.get("name") or email.split("@")[0],
        "password_hash": hash_password(password),
        "role": role,
        "level": profile.get("level", "beginner"),
        "lang": profile.get("lang", "en"),
        "unit": profile.get("unit", "kg"),
        "goal": profile.get("goal", "general"),
        "body": profile.get("body", "male"),
        "active": True,
        "token_version": 0,
        "created_at": now_iso(),
    }
    store.set(f"users/{uid}", user)
    return user


def find_user_by_email(store, email: str) -> dict | None:
    uid = store.get(f"user_emails/{email_key(email)}")
    if not uid:
        return None
    return store.get(f"users/{uid}")


def delete_user_data(store, user: dict) -> None:
    uid = user["id"]
    store.update(
        "/",
        {
            f"users/{uid}": None,
            f"user_emails/{email_key(user['email'])}": None,
            f"workouts/{uid}": None,
            f"favorites/{uid}": None,
            f"enrollments/{uid}": None,
        },
    )


def ensure_admin(store, email: str, password: str) -> None:
    """Bootstrap the first admin from ADMIN_EMAIL / ADMIN_PASSWORD."""
    if not email or not password:
        return
    existing = find_user_by_email(store, email)
    if existing:
        if existing.get("role") != "admin":
            store.update(f"users/{existing['id']}", {"role": "admin"})
        return
    try:
        create_user(store, email, password, {"name": "Admin", "level": "pro"}, role="admin")
    except ApiError:
        pass
