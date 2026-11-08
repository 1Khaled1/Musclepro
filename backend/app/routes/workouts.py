"""Workout logs: save sessions, history, statistics and CSV export."""
from __future__ import annotations

import csv
import io
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, current_app, g, request

from ..catalog import get_exercise, get_program
from ..security import ApiError, login_required
from ..store import as_list
from ..users import now_iso

bp = Blueprint("workouts", __name__, url_prefix="/api/workouts")

LBS_TO_KG = 0.45359237
DAY_ID_RE = re.compile(r"^[a-z0-9-]{1,32}$")
# Random 128-bit key the app attaches to each workout so retries are idempotent.
CLIENT_ID_RE = re.compile(r"[0-9a-f]{32}")


def _store():
    return current_app.extensions["store"]


def _new_workout_id() -> str:
    # Millisecond prefix keeps ids in chronological order when sorted.
    return f"{int(time.time() * 1000):013d}{secrets.token_hex(3)}"


def _num(value, lo: float, hi: float, code: str, integer: bool = False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(code)
    if not lo <= value <= hi:
        raise ApiError(code)
    return int(value) if integer else round(float(value), 2)


def _text(value, max_len: int, code: str, required: bool = False) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str) or len(value) > max_len:
        raise ApiError(code)
    value = value.strip()
    if required and not value:
        raise ApiError(code)
    return value


def validate_workout(data: dict) -> dict:
    out: dict = {
        "title": _text(data.get("title"), 120, "title_invalid", required=True),
        "notes": _text(data.get("notes"), 1000, "notes_invalid"),
        "duration_min": _num(data.get("duration_min", 0), 0, 600, "duration_invalid", True),
    }
    # Workouts logged offline sync later: keep when they were really finished
    # (bounded so a client cannot back- or future-date arbitrarily).
    finished = data.get("finished_at")
    if finished is not None:
        when = _parse_dt(finished) if isinstance(finished, str) else None
        now = datetime.now(timezone.utc)
        if not when or when > now + timedelta(minutes=5) or when < now - timedelta(days=30):
            raise ApiError("finished_invalid")
        out["finished_at"] = when.astimezone(timezone.utc).isoformat(timespec="seconds")
    program_id = data.get("program_id")
    if program_id:
        program = get_program(program_id) if isinstance(program_id, str) else None
        day_id = data.get("day_id")
        if not program or not isinstance(day_id, str) or not DAY_ID_RE.match(day_id):
            raise ApiError("program_invalid")
        if not any(d["id"] == day_id for d in program["days"]):
            raise ApiError("program_invalid")
        out["program_id"] = program_id
        out["day_id"] = day_id
        out["week"] = _num(data.get("week", 1), 1, 52, "program_invalid", True)

    entries = data.get("entries")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 30:
        raise ApiError("entries_invalid")
    clean_entries = []
    for entry in entries:
        if not isinstance(entry, dict) or not get_exercise(entry.get("exercise_id", "")):
            raise ApiError("entries_invalid")
        sets = entry.get("sets")
        if not isinstance(sets, list) or not 1 <= len(sets) <= 20:
            raise ApiError("entries_invalid")
        clean_sets = []
        for s in sets:
            if not isinstance(s, dict):
                raise ApiError("entries_invalid")
            unit = s.get("unit", "kg")
            if unit not in ("kg", "lbs"):
                raise ApiError("unit_invalid")
            clean_sets.append(
                {
                    "reps": _num(s.get("reps", 0), 0, 1000, "set_invalid", True),
                    "weight": _num(s.get("weight", 0), 0, 2000, "set_invalid"),
                    "unit": unit,
                    "done": bool(s.get("done", True)),
                }
            )
        clean_entries.append({"exercise_id": entry["exercise_id"], "sets": clean_sets})
    out["entries"] = clean_entries
    return out


def _kg(s: dict) -> float:
    w = float(s.get("weight") or 0)
    return w * LBS_TO_KG if s.get("unit") == "lbs" else w


def _workouts_for(uid: str) -> list[dict]:
    raw = _store().get(f"workouts/{uid}") or {}
    items = [w for w in raw.values() if isinstance(w, dict)]
    for w in items:
        w["entries"] = as_list(w.get("entries"))
        for e in w["entries"]:
            e["sets"] = as_list(e.get("sets"))
    items.sort(key=lambda w: (w.get("finished_at") or "", w.get("id", "")), reverse=True)
    return items


@bp.post("")
@login_required
def create():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    client_id = data.get("client_id")
    if client_id is not None and not (isinstance(client_id, str) and CLIENT_ID_RE.fullmatch(client_id)):
        raise ApiError("client_id_invalid")
    workout = validate_workout(data)
    uid = g.user["id"]
    workout["id"] = _new_workout_id()
    status = 201
    if client_id:
        # A workout synced from the offline queue can be sent again when the
        # first response was lost: claim the key once, so a replay maps back
        # to the same workout instead of creating a duplicate.
        claimed = _store().transaction(f"workout_keys/{uid}/{client_id}", lambda cur: cur or workout["id"])
        if claimed != workout["id"]:
            existing = _store().get(f"workouts/{uid}/{claimed}")
            if existing:
                existing["entries"] = as_list(existing.get("entries"))
                for e in existing["entries"]:
                    e["sets"] = as_list(e.get("sets"))
                return {"workout": existing}, 200
            # The first attempt claimed the key but never stored the workout.
            workout["id"], status = claimed, 200
    workout["finished_at"] = workout.get("finished_at") or now_iso()
    _store().set(f"workouts/{uid}/{workout['id']}", workout)

    if workout.get("program_id"):
        enrollment = f"enrollments/{uid}/{workout['program_id']}"
        if _store().get(enrollment):
            key = f"w{workout['week']}-{workout['day_id']}"
            _store().set(f"{enrollment}/completed/{key}", workout["id"])
    return {"workout": workout}, status


@bp.get("")
@login_required
def history():
    try:
        limit = max(1, min(100, int(request.args.get("limit", 30))))
    except ValueError:
        limit = 30
    items = _workouts_for(g.user["id"])
    return {"workouts": items[:limit], "total": len(items)}


@bp.get("/<workout_id>")
@login_required
def detail(workout_id: str):
    if not re.fullmatch(r"[0-9a-f]{19}", workout_id):
        raise ApiError("not_found", 404)
    w = _store().get(f"workouts/{g.user['id']}/{workout_id}")
    if not w:
        raise ApiError("not_found", 404)
    w["entries"] = as_list(w.get("entries"))
    for e in w["entries"]:
        e["sets"] = as_list(e.get("sets"))
    return {"workout": w}


@bp.delete("/<workout_id>")
@login_required
def delete(workout_id: str):
    if not re.fullmatch(r"[0-9a-f]{19}", workout_id):
        raise ApiError("not_found", 404)
    path = f"workouts/{g.user['id']}/{workout_id}"
    if not _store().get(path):
        raise ApiError("not_found", 404)
    _store().delete(path)
    return {"ok": True}


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def compute_stats(items: list[dict], now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    weeks = [week_start - timedelta(weeks=i) for i in range(7, -1, -1)]
    weekly = {w: {"volume": 0.0, "sessions": 0} for w in weeks}
    best: dict[str, dict] = {}
    muscle_sets: dict[str, float] = defaultdict(float)
    total_volume = 0.0
    total_sets = 0

    for w in items:
        when = _parse_dt(w.get("finished_at"))
        volume = 0.0
        recent = bool(when and now - when <= timedelta(days=7))
        for e in w.get("entries", []):
            ex = get_exercise(e.get("exercise_id", ""))
            for s in e.get("sets", []):
                if not s.get("done", True):
                    continue
                kg, reps = _kg(s), int(s.get("reps") or 0)
                volume += kg * reps
                total_sets += 1
                if ex and recent:
                    for m in ex["primary"]:
                        muscle_sets[m] += 1
                    for m in ex["secondary"]:
                        muscle_sets[m] += 0.5
                if ex and kg > 0 and 0 < reps <= 12:
                    e1rm = kg * (1 + reps / 30)  # Epley
                    cur = best.get(ex["id"])
                    if not cur or e1rm > cur["e1rm_kg"]:
                        best[ex["id"]] = {
                            "exercise_id": ex["id"],
                            "e1rm_kg": round(e1rm, 1),
                            "weight": s.get("weight"),
                            "unit": s.get("unit", "kg"),
                            "reps": reps,
                            "date": w.get("finished_at"),
                        }
        total_volume += volume
        if when:
            bucket = (when - timedelta(days=when.weekday())).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if bucket in weekly:
                weekly[bucket]["volume"] += volume
                weekly[bucket]["sessions"] += 1

    # Consecutive weeks (ending this week or last) with at least one session.
    streak = 0
    for w in reversed(weeks):
        if weekly[w]["sessions"]:
            streak += 1
        elif w != week_start:
            break

    prs = sorted(best.values(), key=lambda p: p["e1rm_kg"], reverse=True)[:8]
    return {
        "sessions": len(items),
        "total_volume_kg": round(total_volume),
        "total_sets": total_sets,
        "streak_weeks": streak,
        "this_week": weekly[week_start]["sessions"],
        "weekly": [
            {"week": w.date().isoformat(), "volume_kg": round(v["volume"]), "sessions": v["sessions"]}
            for w, v in weekly.items()
        ],
        "personal_records": prs,
        "muscle_sets_7d": {k: round(v, 1) for k, v in sorted(muscle_sets.items())},
    }


@bp.get("/stats")
@login_required
def stats():
    return compute_stats(_workouts_for(g.user["id"]))


def _csv_safe(value) -> str:
    """Neutralise spreadsheet formula injection in user-controlled cells."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


@bp.get("/export.csv")
@login_required
def export_csv():
    lang = request.args.get("lang", g.user.get("lang", "en"))
    lang = lang if lang in ("en", "fr") else "en"
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "workout", "exercise", "set", "reps", "weight", "unit", "done"])
    for w in _workouts_for(g.user["id"]):
        for e in w.get("entries", []):
            ex = get_exercise(e.get("exercise_id", ""))
            name = ex["name"][lang] if ex else e.get("exercise_id")
            for i, s in enumerate(e.get("sets", []), 1):
                writer.writerow(
                    [
                        _csv_safe(w.get("finished_at")),
                        _csv_safe(w.get("title")),
                        _csv_safe(name),
                        i,
                        s.get("reps"),
                        s.get("weight"),
                        s.get("unit"),
                        "yes" if s.get("done", True) else "no",
                    ]
                )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(
        "﻿" + buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="musclepro-workouts-{stamp}.csv"'},
    )
