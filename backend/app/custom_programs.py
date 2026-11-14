"""Programs written by users and coaches.

A custom program is a weekly template (days → exercises with sets, reps and
rest) repeated for a number of weeks, with optional deload weeks. It is stored
compactly and expanded to the same shape as the built-in programs, so the
program page, enrollment, the workout logger, smart progression and coach
assignment all work with it unchanged.

Who can open one: its owner; anyone holding the link when the owner switched
sharing on (ids are random, 64 bits); an athlete it was assigned to by their
coach.

Stored as:
  custom_programs/{id}            → the template (with "owner")
  custom_program_ids/{owner}/{id} → true
"""
from __future__ import annotations

import re
import secrets

from .catalog import get_exercise, get_program
from .security import ApiError
from .store import as_list
from .users import GOALS, LEVELS, now_iso

ID_RE = re.compile(r"u[0-9a-f]{16}")
REPS_RE = re.compile(r"\d{1,3}(?:-\d{1,3})?(?:/(?:side|leg))?|\d{1,3}[sm](?:/(?:side|leg))?")
MAX_PROGRAMS = 20
MAX_DAYS = 7
MAX_EXERCISES = 15
VISIBILITY = ("private", "link")


def _text(value, limit: int, code: str, required: bool = False) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise ApiError(code)
    value = " ".join(value.split())
    if len(value) > limit or (required and not value):
        raise ApiError(code)
    return value


def _int(value, lo: int, hi: int, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not lo <= value <= hi:
        raise ApiError(code)
    return value


def validate_template(data: dict) -> dict:
    """Clean a template sent by the editor; raises ApiError on anything off."""
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    out = {
        "name": _text(data.get("name"), 80, "program_name_invalid", required=True),
        "description": _text(data.get("description"), 400, "program_description_invalid"),
        "level": data.get("level", "beginner"),
        "goal": data.get("goal", "general"),
        "weeks": _int(data.get("weeks", 4), 1, 24, "program_weeks_invalid"),
        "deload_every": _int(data.get("deload_every", 0), 0, 8, "program_weeks_invalid"),
        "visibility": data.get("visibility", "private"),
    }
    if out["level"] not in LEVELS or out["goal"] not in GOALS or out["visibility"] not in VISIBILITY:
        raise ApiError("program_invalid")
    if out["deload_every"] in (1, 2):
        raise ApiError("program_weeks_invalid")  # a deload every week or two is not a plan
    days = data.get("days")
    if not isinstance(days, list) or not 1 <= len(days) <= MAX_DAYS:
        raise ApiError("program_days_invalid")
    clean_days = []
    for i, day in enumerate(days):
        if not isinstance(day, dict):
            raise ApiError("program_days_invalid")
        items = day.get("exercises")
        if not isinstance(items, list) or not 1 <= len(items) <= MAX_EXERCISES:
            raise ApiError("program_exercises_invalid")
        clean_items = []
        for x in items:
            if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not get_exercise(x["id"]):
                raise ApiError("program_exercises_invalid")
            reps = x.get("reps")
            if not isinstance(reps, str) or not REPS_RE.fullmatch(reps.strip().lower().replace(" ", "").replace("–", "-")):
                raise ApiError("program_reps_invalid")
            item = {
                "id": x["id"],
                "sets": _int(x.get("sets", 3), 1, 10, "program_sets_invalid"),
                "reps": reps.strip().lower().replace(" ", "").replace("–", "-"),
                "rest": _int(x.get("rest", 90), 0, 600, "program_rest_invalid"),
            }
            rpe = x.get("rpe")
            if rpe is not None:
                if isinstance(rpe, bool) or not isinstance(rpe, (int, float)) or not 5 <= rpe <= 10 or (rpe * 2) % 1:
                    raise ApiError("program_rpe_invalid")
                item["rpe"] = float(rpe) if rpe % 1 else int(rpe)
            clean_items.append(item)
        clean_days.append({"name": _text(day.get("name"), 60, "program_days_invalid") or f"Day {i + 1}", "exercises": clean_items})
    out["days"] = clean_days
    return out


def _load(store, program_id: str) -> dict | None:
    if not isinstance(program_id, str) or not ID_RE.fullmatch(program_id):
        return None
    doc = store.get(f"custom_programs/{program_id}")
    if not isinstance(doc, dict):
        return None
    doc["days"] = as_list(doc.get("days"))
    for d in doc["days"]:
        d["exercises"] = as_list(d.get("exercises"))
    return doc


def can_view(store, doc: dict, viewer: dict | None) -> bool:
    if doc.get("visibility") == "link":
        return True
    if not viewer:
        return False
    if doc.get("owner") == viewer["id"]:
        return True
    assignment = store.get(f"coach_assignments/{viewer['id']}")
    return bool(isinstance(assignment, dict) and assignment.get("program_id") == doc["id"])


def _both(text: str) -> dict:
    return {"en": text, "fr": text}


def expand(doc: dict, owner_name: str = "") -> dict:
    """The template as a full program: same shape as the built-in ones."""
    deload_every = int(doc.get("deload_every") or 0)
    weeks = int(doc.get("weeks") or 1)
    plan = []
    for w in range(1, weeks + 1):
        deload = bool(deload_every and w % deload_every == 0)
        days = []
        for i, day in enumerate(doc["days"]):
            items = []
            for x in day["exercises"]:
                item = {"id": x["id"], "sets": x["sets"], "reps": x["reps"], "rest": x["rest"]}
                if "rpe" in x:
                    item["rpe"] = x["rpe"]
                if deload:  # fewer sets, easier effort
                    item["sets"] = max(1, round(x["sets"] * 0.6))
                    if "rpe" in item:
                        item["rpe"] = min(item["rpe"], 6)
                items.append(item)
            days.append({"id": f"d{i + 1}", "name": _both(day["name"]), "exercises": items})
        note = (
            {"en": "Deload: fewer sets and lighter loads. Keep the technique sharp.", "fr": "Décharge : moins de séries et des charges plus légères. Gardez une technique nette."}
            if deload
            else {"en": "Follow the plan. Add a little load or a rep when every set reached its target.", "fr": "Suivez le plan. Ajoutez un peu de charge ou une répétition quand chaque série a atteint son objectif."}
        )
        plan.append({"week": w, "phase": 0, "deload": deload, "note": note, "days": days})

    used = [get_exercise(x["id"]) for d in doc["days"] for x in d["exercises"]]
    used = [e for e in used if e]
    equipment = sorted({e["equipment"] for e in used}, key=lambda q: (q == "bodyweight", q))
    minutes = max((5 + sum(x["sets"] * (40 + x["rest"]) for x in d["exercises"]) / 60 for d in doc["days"]), default=20)
    progression = [
        {"en": "When every set reaches the top of its rep target, add the smallest step of load next time.", "fr": "Quand chaque série atteint le haut de l’objectif de répétitions, ajoutez le plus petit palier de charge la fois suivante."},
        {"en": "If reps are missed, repeat the same load until you own it.", "fr": "Si des répétitions manquent, répétez la même charge jusqu’à la maîtriser."},
    ]
    if deload_every:
        progression.append({"en": f"Every {deload_every} weeks, a lighter week lets you recover and come back stronger.", "fr": f"Toutes les {deload_every} semaines, une semaine plus légère permet de récupérer et de revenir plus fort."})
    return {
        "id": doc["id"],
        "custom": True,
        "owner_name": owner_name,
        "level": doc.get("level", "beginner"),
        "goal": doc.get("goal", "general"),
        "days_per_week": len(doc["days"]),
        "weeks": weeks,
        "minutes": int(round(minutes / 5) * 5) or 5,
        "equipment": equipment,
        "name": _both(doc["name"]),
        "summary": _both(doc.get("description") or ""),
        "progression": progression,
        "phases": [
            {
                "weeks": list(range(1, weeks + 1)),
                "name": {"en": "Weekly plan", "fr": "Plan hebdomadaire"},
                "focus": {"en": "The same week, repeated. Progress by adding load or reps.", "fr": "La même semaine, répétée. Progressez en ajoutant de la charge ou des répétitions."},
            }
        ],
        "plan": plan,
    }


def resolve(store, program_id, viewer: dict | None) -> dict | None:
    """A built-in program, or a custom one this viewer may open."""
    if not isinstance(program_id, str):
        return None
    builtin = get_program(program_id)
    if builtin:
        return builtin
    doc = _load(store, program_id)
    if not doc or not can_view(store, doc, viewer):
        return None
    owner = store.get(f"users/{doc.get('owner')}") or {}
    program = expand(doc, owner.get("name", ""))
    program["mine"] = bool(viewer and viewer["id"] == doc.get("owner"))
    if program["mine"]:
        program["visibility"] = doc.get("visibility", "private")
    return program


def owned(store, program_id: str, owner_id: str) -> dict:
    doc = _load(store, program_id)
    if not doc or doc.get("owner") != owner_id:
        raise ApiError("not_found", 404)
    return doc


def list_for(store, owner_id: str) -> list[dict]:
    ids = store.get(f"custom_program_ids/{owner_id}") or {}
    out = []
    for pid in ids:
        doc = _load(store, pid)
        if doc and doc.get("owner") == owner_id:
            program = expand(doc)
            program.pop("plan")
            program.update(mine=True, visibility=doc.get("visibility", "private"), updated_at=doc.get("updated_at"))
            out.append(program)
    out.sort(key=lambda p: p.get("updated_at") or "", reverse=True)
    return out


def create(store, owner: dict, template: dict) -> dict:
    if len(store.get(f"custom_program_ids/{owner['id']}") or {}) >= MAX_PROGRAMS:
        raise ApiError("program_limit", 409)
    pid = "u" + secrets.token_hex(8)
    now = now_iso()
    doc = {**template, "id": pid, "owner": owner["id"], "created_at": now, "updated_at": now}
    store.update("/", {f"custom_programs/{pid}": doc, f"custom_program_ids/{owner['id']}/{pid}": True})
    return doc


def template_from(program: dict, lang: str, suffix: str) -> dict:
    """A template copied from any program: its first normal week becomes the weekly plan."""
    week = next((w for w in program["plan"] if not w.get("deload")), program["plan"][0])
    days = []
    for d in week["days"][:MAX_DAYS]:
        items = []
        for x in d["exercises"][:MAX_EXERCISES]:
            item = {"id": x["id"], "sets": x["sets"], "reps": x["reps"], "rest": x["rest"]}
            if isinstance(x.get("rpe"), (int, float)) and (x["rpe"] * 2) % 1 == 0 and 5 <= x["rpe"] <= 10:
                item["rpe"] = x["rpe"]
            items.append(item)
        days.append({"name": (d["name"].get(lang) or d["name"]["en"])[:60], "exercises": items})
    return {
        "name": f"{(program['name'].get(lang) or program['name']['en'])[: 80 - len(suffix)]}{suffix}",
        "description": (program["summary"].get(lang) or program["summary"].get("en") or "")[:400],
        "level": program["level"],
        "goal": program["goal"],
        "weeks": min(24, program["weeks"]),
        "deload_every": 0,
        "visibility": "private",
        "days": days,
    }


def delete(store, doc: dict) -> None:
    store.update("/", {f"custom_programs/{doc['id']}": None, f"custom_program_ids/{doc['owner']}/{doc['id']}": None})


def cleanup_paths(store, uid: str) -> dict:
    """Paths to clear when an account is deleted."""
    paths: dict = {f"custom_program_ids/{uid}": None}
    for pid in store.get(f"custom_program_ids/{uid}") or {}:
        paths[f"custom_programs/{pid}"] = None
    return paths


