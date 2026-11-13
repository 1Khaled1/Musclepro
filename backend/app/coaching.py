"""Coach ↔ athlete links, built on the athlete's consent.

An athlete joins a coach by typing the coach's invite code, and can leave at
any time. While the link exists the coach can read that athlete's training
(workouts, records, recovery), assign a program and comment on workouts.
Nothing else: no e-mail address, no other athlete.

Stored as:
  coach_codes/{CODE}                       → coach id
  coach_code_of/{coach id}                 → CODE
  coach_athletes/{coach id}/{athlete id}   → {"since": iso}
  coach_of/{athlete id}                    → {"coach_id": id, "since": iso}
  coach_assignments/{athlete id}           → {"program_id", "note", "by", "at"}
  coach_comments/{athlete id}/{workout id} → {"text", "by", "at"}
"""
from __future__ import annotations

import secrets

# No 0/O, 1/I/L: codes are read aloud and typed on phones.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LEN = 8
MAX_ATHLETES = 100
COACH_ROLES = ("coach", "admin")


def normalize_code(raw) -> str:
    if not isinstance(raw, str):
        return ""
    return "".join(c for c in raw.upper() if c.isalnum())[:32]


def show_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}" if len(code) == CODE_LEN else code


def code_for(store, coach_id: str, renew: bool = False) -> str:
    """The coach's invite code; `renew` replaces it (the old one stops working)."""
    current = store.get(f"coach_code_of/{coach_id}")
    if current and not renew:
        return current
    for _ in range(20):
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
        if store.transaction(f"coach_codes/{code}", lambda cur: cur or coach_id) == coach_id:
            break
    else:  # pragma: no cover - 31^8 codes
        raise RuntimeError("could not allocate a coach code")
    updates = {f"coach_code_of/{coach_id}": code}
    if current:
        updates[f"coach_codes/{current}"] = None
    store.update("/", updates)
    return code


def coach_of(store, athlete_id: str) -> dict | None:
    """The athlete's coach (user record) and link, or None. Cleans up links to accounts that no longer coach."""
    link = store.get(f"coach_of/{athlete_id}")
    if not isinstance(link, dict) or not link.get("coach_id"):
        return None
    coach = store.get(f"users/{link['coach_id']}")
    if not coach or coach.get("role") not in COACH_ROLES or not coach.get("active", True):
        unlink(store, link["coach_id"], athlete_id)
        return None
    return {"coach": coach, "since": link.get("since")}


def is_athlete_of(store, coach_id: str, athlete_id: str) -> bool:
    link = store.get(f"coach_of/{athlete_id}")
    return bool(isinstance(link, dict) and link.get("coach_id") == coach_id and store.get(f"coach_athletes/{coach_id}/{athlete_id}"))


def link(store, coach_id: str, athlete_id: str, since: str) -> None:
    store.update(
        "/",
        {
            f"coach_athletes/{coach_id}/{athlete_id}": {"since": since},
            f"coach_of/{athlete_id}": {"coach_id": coach_id, "since": since},
        },
    )


def unlink(store, coach_id: str, athlete_id: str) -> None:
    """End the link. The coach loses access at once; the program assignment goes with it."""
    store.update(
        "/",
        {
            f"coach_athletes/{coach_id}/{athlete_id}": None,
            f"coach_of/{athlete_id}": None,
            f"coach_assignments/{athlete_id}": None,
        },
    )


def cleanup_paths(store, uid: str) -> dict:
    """Paths to clear when an account is deleted, as athlete and as coach."""
    paths: dict = {
        f"coach_of/{uid}": None,
        f"coach_assignments/{uid}": None,
        f"coach_comments/{uid}": None,
        f"coach_athletes/{uid}": None,
        f"coach_code_of/{uid}": None,
    }
    mine = store.get(f"coach_of/{uid}")
    if isinstance(mine, dict) and mine.get("coach_id"):
        paths[f"coach_athletes/{mine['coach_id']}/{uid}"] = None
    code = store.get(f"coach_code_of/{uid}")
    if code:
        paths[f"coach_codes/{code}"] = None
    for athlete_id in (store.get(f"coach_athletes/{uid}") or {}):
        paths[f"coach_of/{athlete_id}"] = None
        paths[f"coach_assignments/{athlete_id}"] = None
    return paths
