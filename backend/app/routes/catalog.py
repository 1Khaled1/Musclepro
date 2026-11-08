"""Public catalog: muscles, equipment, exercises, programs, generator."""
from __future__ import annotations

from flask import Blueprint, request

from ..catalog import (
    EQUIPMENT,
    MUSCLES,
    exercises,
    filter_exercises,
    generate_workout,
    get_exercise,
    get_program,
    program_exercise_ids,
    program_summary,
    programs,
)
from ..security import ApiError

bp = Blueprint("catalog", __name__, url_prefix="/api")


@bp.get("/meta")
def meta():
    return {"muscles": MUSCLES, "equipment": EQUIPMENT}


@bp.get("/exercises")
def list_exercises():
    args = request.args
    muscle = args.get("muscle") or None
    equipment = args.get("equipment") or None
    difficulty = args.get("difficulty") or None
    if muscle and muscle not in MUSCLES:
        raise ApiError("muscles_invalid")
    if equipment and equipment not in EQUIPMENT:
        raise ApiError("equipment_invalid")
    items = filter_exercises(muscle, equipment, difficulty, args.get("q"))
    return {"exercises": items, "total": len(exercises())}


@bp.get("/exercises/<exercise_id>")
def exercise_detail(exercise_id: str):
    ex = get_exercise(exercise_id)
    if not ex:
        raise ApiError("not_found", 404)
    related = [
        e for e in filter_exercises(muscle=ex["primary"][0]) if e["id"] != ex["id"]
    ][:4]
    used_in = [
        {"id": p["id"], "name": p["name"], "level": p["level"]}
        for p in programs()
        if exercise_id in program_exercise_ids(p)
    ]
    return {"exercise": ex, "related": related, "programs": used_in}


@bp.get("/programs")
def list_programs():
    level = request.args.get("level")
    items = [program_summary(p) for p in programs() if not level or p["level"] == level]
    return {"programs": items}


@bp.get("/programs/<program_id>")
def program_detail(program_id: str):
    program = get_program(program_id)
    if not program:
        raise ApiError("not_found", 404)
    return {"program": program}


@bp.post("/generate")
def generate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("bad_request")
    return generate_workout(data)
