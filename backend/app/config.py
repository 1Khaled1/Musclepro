"""Runtime configuration, read once from environment variables.

Every value has a safe development default so `flask run` works out of the box.
In production (APP_ENV=production) the missing-secret defaults are refused.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
REPO_DIR = BASE_DIR.parent                                 # repository root


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    APP_ENV = os.environ.get("APP_ENV", "development").lower()
    IS_PRODUCTION = APP_ENV == "production"
    TESTING = False

    # Signing key for session tokens. Render generates one (see render.yaml).
    SECRET_KEY = os.environ.get("SECRET_KEY") or ""

    # Session cookie
    SESSION_COOKIE_NAME = "mp_session"
    SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "7"))
    COOKIE_SECURE = _bool("COOKIE_SECURE", IS_PRODUCTION)

    # Firebase Realtime Database. Leave empty to use the local JSON store.
    FIREBASE_DATABASE_URL = os.environ.get("FIREBASE_DATABASE_URL", "")
    # One of: raw JSON, base64 JSON, or a path to a service-account file.
    FIREBASE_SERVICE_ACCOUNT = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    FIREBASE_CREDENTIALS_FILE = os.environ.get(
        "FIREBASE_CREDENTIALS_FILE", "/etc/secrets/firebase-service-account.json"
    )

    # Local store used when Firebase is not configured (dev / tests).
    LOCAL_DB_FILE = os.environ.get("LOCAL_DB_FILE", str(BASE_DIR / "instance" / "dev-db.json"))

    # Optional bootstrap admin, created at start-up if it does not exist yet.
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

    # Built front-end served by Flask (single Render service, same origin).
    STATIC_DIR = os.environ.get("STATIC_DIR", str(REPO_DIR / "frontend" / "dist"))

    # Login / register throttling (per client IP).
    AUTH_RATE_LIMIT = int(os.environ.get("AUTH_RATE_LIMIT", "10"))
    AUTH_RATE_WINDOW = int(os.environ.get("AUTH_RATE_WINDOW", "300"))

    @classmethod
    def resolve_secret(cls) -> str:
        if cls.SECRET_KEY:
            return cls.SECRET_KEY
        if cls.IS_PRODUCTION:
            raise RuntimeError("SECRET_KEY must be set when APP_ENV=production")
        # Development only: a per-process key (sessions reset on restart).
        return secrets.token_urlsafe(48)
