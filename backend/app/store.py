"""Persistence layer.

Two interchangeable back-ends behind one small path-based API that mirrors the
Firebase Realtime Database model (a JSON tree addressed by slash paths):

* FirebaseStore — production, via the firebase-admin SDK (server-side only;
  the database rules deny all client access, see database.rules.json).
* MemoryStore  — development and tests; optionally persisted to a JSON file.

Render's free plan has no persistent disk, so production must use Firebase.
"""
from __future__ import annotations

import base64
import copy
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Callable, Protocol

log = logging.getLogger(__name__)


def _parts(path: str) -> list[str]:
    return [p for p in path.strip("/").split("/") if p]


class Store(Protocol):
    kind: str

    def get(self, path: str) -> Any: ...
    def set(self, path: str, value: Any) -> None: ...
    def update(self, path: str, values: dict) -> None: ...
    def delete(self, path: str) -> None: ...
    def transaction(self, path: str, fn: Callable[[Any], Any]) -> Any: ...


class MemoryStore:
    """Thread-safe nested-dict store with Firebase-like semantics.

    Values are deep-copied in and out so callers can never mutate stored state
    by accident, exactly like a network round trip.
    """

    kind = "memory"

    def __init__(self, file: str | None = None) -> None:
        self._lock = threading.RLock()
        self._file = Path(file) if file else None
        # Without a file, everything is lost when the process restarts.
        self.persistent = self._file is not None
        self._root: dict = {}
        if self._file and self._file.exists():
            try:
                self._root = json.loads(self._file.read_text("utf-8")) or {}
            except (OSError, ValueError):
                log.warning("Could not read %s, starting with an empty store", self._file)

    # -- helpers -----------------------------------------------------------
    def _persist(self) -> None:
        if not self._file:
            return
        self._file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._root, ensure_ascii=False), "utf-8")
        os.replace(tmp, self._file)

    def _node(self, parts: list[str], create: bool = False) -> Any:
        node: Any = self._root
        for p in parts:
            if not isinstance(node, dict):
                return None
            if p not in node:
                if not create:
                    return None
                node[p] = {}
            node = node[p]
        return node

    @staticmethod
    def _clean(value: Any) -> Any:
        # Firebase drops null leaves and empty containers; mirror that.
        if isinstance(value, dict):
            out = {k: MemoryStore._clean(v) for k, v in value.items()}
            out = {k: v for k, v in out.items() if v is not None and v != {} and v != []}
            return out or None
        if isinstance(value, list):
            out = [MemoryStore._clean(v) for v in value]
            return out or None
        return value

    def _set_locked(self, parts: list[str], value: Any) -> None:
        value = self._clean(copy.deepcopy(value))
        if not parts:
            self._root = value if isinstance(value, dict) else {}
            return
        parent = self._node(parts[:-1], create=value is not None)
        if not isinstance(parent, dict):
            return
        if value is None:
            parent.pop(parts[-1], None)
        else:
            parent[parts[-1]] = value

    # -- API ---------------------------------------------------------------
    def get(self, path: str) -> Any:
        with self._lock:
            return copy.deepcopy(self._node(_parts(path)))

    def set(self, path: str, value: Any) -> None:
        with self._lock:
            self._set_locked(_parts(path), value)
            self._persist()

    def update(self, path: str, values: dict) -> None:
        with self._lock:
            base = _parts(path)
            for key, val in values.items():
                self._set_locked(base + _parts(key), val)
            self._persist()

    def delete(self, path: str) -> None:
        self.set(path, None)

    def transaction(self, path: str, fn: Callable[[Any], Any]) -> Any:
        with self._lock:
            parts = _parts(path)
            current = copy.deepcopy(self._node(parts))
            new = fn(current)
            self._set_locked(parts, new)
            self._persist()
            return copy.deepcopy(new)


class FirebaseStore:
    kind = "firebase"
    persistent = True

    def __init__(self, credentials: dict, database_url: str) -> None:
        import firebase_admin
        from firebase_admin import credentials as fb_credentials, db

        self._db = db
        name = "musclepro"
        try:
            self._app = firebase_admin.get_app(name)
        except ValueError:
            self._app = firebase_admin.initialize_app(
                fb_credentials.Certificate(credentials),
                {"databaseURL": database_url},
                name=name,
            )

    def _ref(self, path: str):
        return self._db.reference("/" + "/".join(_parts(path)), app=self._app)

    def get(self, path: str) -> Any:
        return self._ref(path).get()

    def set(self, path: str, value: Any) -> None:
        if value is None:
            self._ref(path).delete()
        else:
            self._ref(path).set(value)

    def update(self, path: str, values: dict) -> None:
        if values:
            self._ref(path).update(values)

    def delete(self, path: str) -> None:
        self._ref(path).delete()

    def transaction(self, path: str, fn: Callable[[Any], Any]) -> Any:
        return self._ref(path).transaction(fn)


def load_service_account(raw: str, file_path: str) -> dict | None:
    """Accept raw JSON, base64-encoded JSON, or a file path."""
    raw = (raw or "").strip()
    if raw:
        if raw.startswith("{"):
            return json.loads(raw)
        if os.path.isfile(raw):
            return json.loads(Path(raw).read_text("utf-8"))
        try:
            return json.loads(base64.b64decode(raw).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64 JSON") from exc
    if file_path and os.path.isfile(file_path):
        return json.loads(Path(file_path).read_text("utf-8"))
    return None


def create_store(config) -> Store:
    if getattr(config, "TESTING", False):
        return MemoryStore()
    url = config.FIREBASE_DATABASE_URL
    creds = load_service_account(config.FIREBASE_SERVICE_ACCOUNT, config.FIREBASE_CREDENTIALS_FILE)
    if url and creds:
        log.info("Using Firebase Realtime Database at %s", url)
        return FirebaseStore(creds, url)
    if config.IS_PRODUCTION:
        log.warning(
            "Firebase is not configured: data lives in memory and is lost on every "
            "restart. Set FIREBASE_DATABASE_URL and FIREBASE_SERVICE_ACCOUNT."
        )
        return MemoryStore()
    log.info("Firebase not configured, using local JSON store %s", config.LOCAL_DB_FILE)
    return MemoryStore(config.LOCAL_DB_FILE)


def as_list(value: Any) -> list:
    """Firebase returns arrays as lists, or as dicts when indices are sparse."""
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v is not None]
    if isinstance(value, dict):
        try:
            return [value[k] for k in sorted(value, key=lambda k: int(k))]
        except (TypeError, ValueError):
            return list(value.values())
    return []
