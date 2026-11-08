"""Authentication helpers: password hashing, session tokens, guards, throttling."""
from __future__ import annotations

import hashlib
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable

import jwt
from flask import current_app, g, request
from werkzeug.security import check_password_hash, generate_password_hash

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "MusclePro"

# A real hash of a random string: used to keep login timing constant when the
# account does not exist, so response time does not reveal registered emails.
_DUMMY_HASH = generate_password_hash("musclepro-timing-equaliser")


class ApiError(Exception):
    """Raised anywhere in a request; rendered as {"error": code} JSON.

    `code` is a stable machine-readable key the front-end translates (EN/FR).
    """

    def __init__(self, code: str, status: int = 400, **extra: Any) -> None:
        super().__init__(code)
        self.code = code
        self.status = status
        self.extra = extra


# -- passwords ---------------------------------------------------------------
def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(stored_hash: str | None, password: str) -> bool:
    if not stored_hash:
        check_password_hash(_DUMMY_HASH, password)
        return False
    return check_password_hash(stored_hash, password)


def validate_password(password: Any) -> str:
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ApiError("password_length")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ApiError("password_weak")
    return password


def normalize_email(email: Any) -> str:
    if not isinstance(email, str):
        raise ApiError("email_invalid")
    email = email.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise ApiError("email_invalid")
    return email


def email_key(email: str) -> str:
    """Firebase keys cannot contain . # $ [ ] / — index emails by digest."""
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


# -- session tokens ----------------------------------------------------------
def issue_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "ver": int(user.get("token_version", 0)),
        "iat": now,
        "exp": now + timedelta(days=current_app.config["SESSION_DAYS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            current_app.config["SECRET_KEY"],
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError:
        return None


def set_session_cookie(response, token: str) -> None:
    cfg = current_app.config
    response.set_cookie(
        cfg["SESSION_COOKIE_NAME"],
        token,
        max_age=cfg["SESSION_DAYS"] * 86400,
        httponly=True,
        secure=cfg["COOKIE_SECURE"],
        samesite="Lax",
        path="/",
    )


def clear_session_cookie(response) -> None:
    cfg = current_app.config
    response.delete_cookie(
        cfg["SESSION_COOKIE_NAME"], path="/", secure=cfg["COOKIE_SECURE"], samesite="Lax"
    )


def load_current_user() -> None:
    """before_request hook: resolve the cookie to an active user, or None."""
    g.user = None
    token = request.cookies.get(current_app.config["SESSION_COOKIE_NAME"])
    if not token:
        return
    claims = decode_token(token)
    if not claims:
        return
    store = current_app.extensions["store"]
    user = store.get(f"users/{claims['sub']}")
    if not user or not user.get("active", True):
        return
    # Changing the password or signing out everywhere bumps token_version,
    # which invalidates every previously issued token.
    if int(user.get("token_version", 0)) != int(claims.get("ver", -1)):
        return
    g.user = user


def login_required(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not g.get("user"):
            raise ApiError("auth_required", 401)
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = g.get("user")
        if not user:
            raise ApiError("auth_required", 401)
        if user.get("role") != "admin":
            raise ApiError("forbidden", 403)
        return fn(*args, **kwargs)

    return wrapper


def csrf_protect() -> None:
    """Reject state-changing API calls that lack our custom header.

    Browsers cannot attach a custom header to a cross-site request without a
    CORS preflight, and this app grants no CORS, so a forged form post or
    cross-site fetch is refused. Combined with SameSite=Lax cookies.
    """
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if not request.path.startswith("/api/"):
        return
    if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise ApiError("csrf_failed", 403)


# -- throttling --------------------------------------------------------------
class RateLimiter:
    """Sliding-window limiter kept in process memory.

    Good enough for a single Render instance; swap for Redis if you scale out.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def throttle(bucket: str) -> None:
    cfg = current_app.config
    key = f"{bucket}:{request.remote_addr or 'unknown'}"
    if not limiter.hit(key, cfg["AUTH_RATE_LIMIT"], cfg["AUTH_RATE_WINDOW"]):
        raise ApiError("rate_limited", 429)
