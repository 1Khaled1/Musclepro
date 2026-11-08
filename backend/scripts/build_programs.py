#!/usr/bin/env python3
"""Build backend/app/data/programs.json: the MusclePro training programs.

Every program is periodized like a coach would write it:
  - phases (blocks) change the exercise variations,
  - every week has its own sets, reps, rest and effort (RPE or % of 1RM),
  - deload / taper weeks let the body adapt.

Edit the definitions below, then run:

    python backend/scripts/build_programs.py

The script validates everything (exercise ids, equipment, day ids, no two
identical weeks in a row) and writes the JSON the API serves.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
OUT = DATA / "programs.json"


def T(en: str, fr: str) -> dict:
    return {"en": en, "fr": fr}


def P(sets, reps=None, rest=60, rpe=None, pct=None, hold=None, dist=None) -> dict:
    """One prescription: sets × reps (or hold seconds / carry metres)."""
    return {"sets": sets, "reps": reps, "rest": rest, "rpe": rpe, "pct": pct, "hold": hold, "dist": dist}


def S(exercise_id: str, role: str, kind: str = "") -> tuple[str, str, str]:
    """A slot in a day. kind: '' reps, '/side', '/leg', 's' hold, 's/side', 'm' carry."""
    return (exercise_id, role, kind)


def Day(day_id: str, name: dict, *slots) -> dict:
    return {"id": day_id, "name": name, "slots": list(slots)}


def Phase(weeks: list[int], name: dict, focus: dict, days: list[dict]) -> dict:
    return {"weeks": weeks, "name": name, "focus": focus, "days": days}


def core(sets, reps, hold, rest=45) -> dict:
    return P(sets, reps=str(reps), rest=rest, hold=hold)


def carry(sets, dist, rest=60) -> dict:
    return P(sets, rest=rest, dist=dist)


# --------------------------------------------------------------------------
# 1. Foundation Full Body: beginner, 6 weeks × 3 days
# --------------------------------------------------------------------------
FOUNDATION_A = T("Day A — Squat & Push", "Jour A — Squat & poussée")
FOUNDATION_B = T("Day B — Hinge & Pull", "Jour B — Charnière & tirage")
FOUNDATION_C = T("Day C — Single-Leg & Arms", "Jour C — Unilatéral & bras")

foundation = {
    "id": "foundation-full-body",
    "level": "beginner",
    "goal": "general",
    "days_per_week": 3,
    "weeks": 6,
    "minutes": 45,
    "equipment": ["dumbbell", "kettlebell", "machine", "cable", "bodyweight"],
    "name": T("Foundation Full Body", "Fondations Corps Complet"),
    "summary": T(
        "Your first 6 weeks in the gym. Three full-body sessions a week teach the key movement patterns — squat, hinge, push, pull, carry — with machines and dumbbells you can load safely.",
        "Vos 6 premières semaines en salle. Trois séances corps complet par semaine pour apprendre les mouvements clés — squat, charnière de hanche, poussée, tirage, portage — avec des machines et haltères faciles à charger en sécurité.",
    ),
    "progression": [
        T("When every set is completed at the target RPE, add the smallest weight increment next session.",
          "Quand toutes les séries sont réussies au RPE visé, ajoutez le plus petit incrément de charge à la séance suivante."),
        T("New phase, new variations: start them a little lighter for the first session.",
          "Nouvelle phase, nouvelles variantes : commencez un peu plus léger lors de la première séance."),
        T("After week 6, move on to Upper / Lower Strength.",
          "Après la semaine 6, passez au programme Haut / Bas Force."),
    ],
    "phases": [
        Phase([1, 2], T("Learn the patterns", "Apprendre les mouvements"),
              T("Light weights and perfect technique on the key movements.",
                "Charges légères et technique parfaite sur les mouvements clés."), [
            Day("a", FOUNDATION_A, S("goblet-squat", "main"), S("dumbbell-bench-press", "main"),
                S("one-arm-dumbbell-row", "assist", "/side"), S("glute-bridge", "acc"), S("plank", "core", "s")),
            Day("b", FOUNDATION_B, S("leg-press", "main"), S("lat-pulldown", "main"),
                S("dumbbell-shoulder-press", "assist"), S("back-extension", "acc"), S("dead-bug", "core", "/side")),
            Day("c", FOUNDATION_C, S("step-up", "assist", "/leg"), S("incline-push-up", "assist"),
                S("seated-cable-row", "assist"), S("dumbbell-curl", "arm"), S("triceps-pushdown", "arm"),
                S("farmers-carry", "carry", "m")),
        ]),
        Phase([3, 4], T("Build the base", "Construire la base"),
              T("New variations and more work: add weight whenever every rep is clean.",
                "Nouvelles variantes et plus de travail : ajoutez de la charge dès que toutes les répétitions sont propres."), [
            Day("a", FOUNDATION_A, S("goblet-squat", "main"), S("machine-chest-press", "main"),
                S("one-arm-dumbbell-row", "assist", "/side"), S("walking-lunge", "acc", "/leg"),
                S("side-plank", "core", "s/side")),
            Day("b", FOUNDATION_B, S("leg-press", "main"), S("lat-pulldown", "main"),
                S("dumbbell-shoulder-press", "assist"), S("lying-leg-curl", "acc"), S("bird-dog", "core", "/side")),
            Day("c", FOUNDATION_C, S("step-up", "assist", "/leg"), S("push-up", "assist"),
                S("seated-cable-row", "assist"), S("hammer-curl", "arm"), S("overhead-triceps-extension", "arm"),
                S("farmers-carry", "carry", "m")),
        ]),
        Phase([5, 6], T("Get stronger", "Gagner en force"),
              T("Heavier, lower-rep sets on the main lifts; the last set close to your limit.",
                "Séries plus lourdes et plus courtes sur les mouvements principaux ; dernière série proche de votre limite."), [
            Day("a", FOUNDATION_A, S("goblet-squat", "main"), S("dumbbell-bench-press", "main"),
                S("one-arm-dumbbell-row", "assist", "/side"), S("walking-lunge", "acc", "/leg"), S("plank", "core", "s")),
            Day("b", FOUNDATION_B, S("kettlebell-swing", "acc"), S("leg-press", "main"), S("lat-pulldown", "main"),
                S("dumbbell-shoulder-press", "assist"), S("side-plank", "core", "s/side")),
            Day("c", FOUNDATION_C, S("step-up", "assist", "/leg"), S("push-up", "assist"),
                S("seated-cable-row", "assist"), S("dumbbell-curl", "arm"), S("triceps-pushdown", "arm"),
                S("farmers-carry", "carry", "m")),
        ]),
    ],
    "roles": {
        "main": [P(2, "10", 90, 6), P(3, "10", 90, 7), P(3, "8", 90, 7), P(3, "8", 90, 8), P(4, "6", 120, 8), P(3, "5", 120, 9)],
        "assist": [P(2, "12", 75, 6), P(3, "12", 75, 7), P(3, "10", 75, 7), P(3, "10", 75, 8), P(3, "8", 90, 8), P(3, "8", 90, 8)],
        "acc": [P(2, "12", 60, 6), P(2, "12", 60, 7), P(3, "12", 60, 7), P(3, "12", 60, 8), P(3, "10", 60, 8), P(2, "10", 60, 8)],
        "arm": [P(2, "12", 45, 7), P(2, "12", 45, 7), P(2, "12", 45, 8), P(3, "12", 45, 8), P(3, "10", 45, 9), P(2, "10", 45, 9)],
        "core": [core(2, 8, 20), core(3, 8, 25), core(3, 10, 30), core(3, 10, 35), core(3, 12, 40), core(3, 12, 45)],
        "carry": [carry(2, 20), carry(3, 20), carry(3, 30), carry(3, 30), carry(4, 30), carry(3, 40)],
    },
    "notes": [
        T("Intro week: 2 sets with light weights — learn each movement.",
          "Semaine d'intro : 2 séries avec des charges légères — apprenez chaque mouvement."),
        T("Add a third set. Stop every set with about 3 reps in reserve.",
          "Ajoutez une troisième série. Arrêtez chaque série avec environ 3 répétitions en réserve."),
        T("New variations, sets of 8 on the main lifts.",
          "Nouvelles variantes, séries de 8 sur les mouvements principaux."),
        T("Same exercises, a little heavier (RPE 8).",
          "Mêmes exercices, un peu plus lourd (RPE 8)."),
        T("Strength phase: 4 sets of 6 on the main lifts.",
          "Phase de force : 4 séries de 6 sur les mouvements principaux."),
        T("Peak week: your best sets of 5. Next step: Upper / Lower Strength.",
          "Semaine de pic : vos meilleures séries de 5. Étape suivante : Haut / Bas Force."),
    ],
    "deload": [],
}

# --------------------------------------------------------------------------
# 2. Home Bodyweight Starter: beginner, 4 weeks × 3 days, no equipment
# --------------------------------------------------------------------------
HOME_A = T("Day A — Strength Base", "Jour A — Base de force")
HOME_B = T("Day B — Posture & Core", "Jour B — Posture & gainage")
HOME_C = T("Day C — Conditioning Circuit", "Jour C — Circuit cardio")

home = {
    "id": "home-bodyweight-starter",
    "level": "beginner",
    "goal": "fat_loss",
    "days_per_week": 3,
    "weeks": 4,
    "minutes": 30,
    "equipment": ["bodyweight"],
    "name": T("Home Bodyweight Starter", "Démarrage Maison au Poids du Corps"),
    "summary": T(
        "No gym, no equipment, no excuses. Thirty-minute sessions that build a strength and conditioning base anywhere — a chair, a table and a floor are all you need.",
        "Pas de salle, pas de matériel, pas d'excuses. Des séances de 30 minutes pour bâtir une base de force et de condition physique partout — une chaise, une table et un sol suffisent.",
    ),
    "progression": [
        T("Each week adds reps or rounds. Too easy? Lower slowly over 3 seconds on every rep.",
          "Chaque semaine ajoute des répétitions ou des tours. Trop facile ? Descendez lentement en 3 secondes à chaque répétition."),
        T("Can't reach the reps yet? Use the easier variation (hands on a table for push-ups) and keep the sets.",
          "Pas encore les répétitions ? Prenez la variante plus facile (mains sur une table pour les pompes) et gardez les séries."),
        T("After week 4, repeat with harder variations or move to Foundation Full Body.",
          "Après la semaine 4, recommencez avec des variantes plus dures ou passez à Fondations Corps Complet."),
    ],
    "phases": [
        Phase([1, 2], T("Foundations", "Fondations"),
              T("Learn the basic bodyweight movements and build the habit.",
                "Apprenez les mouvements de base au poids du corps et installez l'habitude."), [
            Day("a", HOME_A, S("bodyweight-squat", "main"), S("incline-push-up", "main"), S("inverted-row", "main"),
                S("glute-bridge", "acc"), S("plank", "core", "s")),
            Day("b", HOME_B, S("push-up", "main"), S("bench-dip", "acc"), S("bird-dog", "core", "/side"),
                S("side-plank", "core", "s/side"), S("standing-calf-raise", "acc")),
            Day("c", HOME_C, S("mountain-climber", "cond", "s"), S("bodyweight-squat", "cond"),
                S("incline-push-up", "cond"), S("dead-bug", "core", "/side"), S("dead-hang", "hang", "s")),
        ]),
        Phase([3, 4], T("Level up", "Passer au niveau supérieur"),
              T("Harder variations, more rounds and shorter rest.",
                "Variantes plus dures, plus de tours et des repos plus courts."), [
            Day("a", HOME_A, S("bodyweight-squat", "main"), S("push-up", "main"), S("inverted-row", "main"),
                S("glute-bridge", "acc"), S("side-plank", "core", "s/side")),
            Day("b", HOME_B, S("pike-push-up", "main"), S("bench-dip", "acc"), S("russian-twist", "core", "/side"),
                S("bird-dog", "core", "/side"), S("standing-calf-raise", "acc")),
            Day("c", HOME_C, S("burpee", "cond"), S("jump-squat", "cond"), S("push-up", "cond"),
                S("mountain-climber", "cond", "s"), S("dead-hang", "hang", "s")),
        ]),
    ],
    "roles": {
        "main": [P(3, "10", 60, 7), P(3, "12", 60, 7), P(4, "10", 60, 8), P(4, "12", 45, 8)],
        "acc": [P(3, "12", 45, 7), P(3, "15", 45, 7), P(3, "15", 45, 8), P(3, "20", 30, 8)],
        "core": [core(3, 8, 20), core(3, 10, 25), core(3, 10, 30, 30), core(3, 12, 35, 30)],
        "cond": [P(3, "10", 30, hold=20), P(4, "10", 30, hold=25), P(4, "12", 25, hold=30), P(5, "12", 20, hold=30)],
        "hang": [P(2, rest=45, hold=15), P(3, rest=45, hold=20), P(3, rest=45, hold=20), P(3, rest=45, hold=25)],
    },
    "notes": [
        T("Learn the moves, 60 s rest between sets.", "Apprenez les mouvements, 60 s de repos entre les séries."),
        T("+2 reps per set, and the circuit goes to 4 rounds.", "+2 répétitions par série, et le circuit passe à 4 tours."),
        T("Harder variations and shorter rest.", "Variantes plus dures et repos plus courts."),
        T("5-round circuit and 20 s rest — your fittest week.", "Circuit en 5 tours et 20 s de repos — votre semaine la plus intense."),
    ],
    "deload": [],
}

# --------------------------------------------------------------------------
# 3. Upper/Lower Strength: intermediate, 8 weeks × 4 days
# --------------------------------------------------------------------------
UL_UA = T("Upper A — Bench Focus", "Haut A — Focus développé couché")
UL_LA = T("Lower A — Squat Focus", "Bas A — Focus squat")
UL_UB = T("Upper B — Press Focus", "Haut B — Focus développé militaire")
UL_LB = T("Lower B — Deadlift Focus", "Bas B — Focus soulevé de terre")
UL_VOLUME = [
    Day("upper-a", UL_UA, S("barbell-bench-press", "main"), S("bent-over-row", "main"),
        S("dumbbell-shoulder-press", "assist"), S("chin-up", "assist"), S("triceps-pushdown", "acc")),
    Day("lower-a", UL_LA, S("back-squat", "main"), S("romanian-deadlift", "assist"), S("walking-lunge", "acc", "/leg"),
        S("standing-calf-raise", "acc"), S("cable-crunch", "core")),
    Day("upper-b", UL_UB, S("overhead-press", "main"), S("lat-pulldown", "assist"), S("incline-dumbbell-press", "assist"),
        S("seated-cable-row", "assist"), S("barbell-curl", "acc"), S("face-pull", "acc")),
    Day("lower-b", UL_LB, S("deadlift", "main"), S("leg-press", "assist"), S("hip-thrust", "assist"),
        S("lying-leg-curl", "acc"), S("side-plank", "core", "s/side")),
]
UL_STRENGTH = [
    Day("upper-a", UL_UA, S("barbell-bench-press", "main"), S("bent-over-row", "main"),
        S("close-grip-bench-press", "assist"), S("chin-up", "assist"), S("overhead-triceps-extension", "acc")),
    Day("lower-a", UL_LA, S("back-squat", "main"), S("romanian-deadlift", "assist"),
        S("bulgarian-split-squat", "acc", "/leg"), S("seated-calf-raise", "acc"), S("cable-crunch", "core")),
    Day("upper-b", UL_UB, S("overhead-press", "main"), S("one-arm-dumbbell-row", "assist", "/side"),
        S("incline-dumbbell-press", "assist"), S("lat-pulldown", "assist"), S("hammer-curl", "acc"), S("lateral-raise", "acc")),
    Day("lower-b", UL_LB, S("deadlift", "main"), S("leg-press", "assist"), S("hip-thrust", "assist"),
        S("lying-leg-curl", "acc"), S("plank", "core", "s")),
]

upper_lower = {
    "id": "upper-lower-strength",
    "level": "intermediate",
    "goal": "strength",
    "days_per_week": 4,
    "weeks": 8,
    "minutes": 60,
    "equipment": ["barbell", "dumbbell", "cable", "machine", "bodyweight"],
    "name": T("Upper / Lower Strength", "Haut / Bas Force"),
    "summary": T(
        "Four sessions a week built around the big barbell lifts. Heavy, low-rep main lifts followed by accessory work to bulletproof joints and fill the gaps.",
        "Quatre séances par semaine autour des grands mouvements à la barre. Mouvements principaux lourds en faibles répétitions, puis travail complémentaire pour renforcer les articulations et combler les lacunes.",
    ),
    "progression": [
        T("Main lifts: when all sets are done at the target RPE, add 2.5 kg (upper) or 5 kg (lower) next week.",
          "Mouvements principaux : quand toutes les séries sont réussies au RPE visé, ajoutez 2,5 kg (haut) ou 5 kg (bas) la semaine suivante."),
        T("Missed reps two sessions in a row? Drop 10% and build back up.",
          "Répétitions manquées deux séances de suite ? Baissez de 10 % et remontez."),
        T("Deload weeks (4 and 8): fewer sets and lighter weights. Don't skip them — that is when you adapt.",
          "Semaines de décharge (4 et 8) : moins de séries et des charges plus légères. Ne les sautez pas — c'est là que vous progressez."),
    ],
    "phases": [
        Phase([1, 2, 3], T("Volume block", "Bloc volume"),
              T("Moderate weights, more sets: build work capacity and technique on the big lifts.",
                "Charges modérées, plus de séries : développer la capacité de travail et la technique sur les grands mouvements."),
              UL_VOLUME),
        Phase([4], T("Deload", "Décharge"),
              T("Fewer sets, light weights — recover before the strength block.",
                "Moins de séries, charges légères — récupérez avant le bloc force."), UL_VOLUME),
        Phase([5, 6, 7], T("Strength block", "Bloc force"),
              T("Heavier, lower-rep sets and new accessories.",
                "Séries plus lourdes et plus courtes, nouveaux exercices complémentaires."), UL_STRENGTH),
        Phase([8], T("Deload", "Décharge"),
              T("Recover, then restart the cycle with heavier weights.",
                "Récupérez, puis relancez le cycle avec des charges plus lourdes."), UL_STRENGTH),
    ],
    "roles": {
        "main": [P(4, "8", 150, 7), P(4, "6", 165, 8), P(5, "5", 180, 8), P(3, "5", 120, 6),
                 P(5, "4", 180, 8), P(5, "3", 210, 8), P(4, "2", 240, 9), P(3, "3", 150, 6)],
        "assist": [P(3, "10", 90, 7), P(3, "8", 90, 8), P(4, "8", 90, 8), P(2, "8", 75, 6),
                   P(3, "6", 120, 8), P(3, "6", 120, 8), P(3, "5", 120, 8), P(2, "6", 90, 6)],
        "acc": [P(3, "12", 60, 7), P(3, "12", 60, 8), P(3, "10", 60, 8), P(2, "12", 60, 6),
                P(3, "10", 60, 8), P(3, "10", 60, 8), P(3, "8", 60, 9), P(2, "10", 60, 6)],
        "core": [core(3, 12, 30), core(3, 12, 35), core(3, 10, 40), core(2, 10, 30),
                 core(3, 12, 40), core(3, 12, 45), core(3, 10, 45), core(2, 10, 30)],
    },
    "notes": [
        T("Volume: 4 × 8 on the main lifts, about 3 reps in reserve.", "Volume : 4 × 8 sur les mouvements principaux, environ 3 répétitions en réserve."),
        T("Heavier: 4 × 6.", "Plus lourd : 4 × 6."),
        T("5 × 5 — the hardest volume week.", "5 × 5 — la semaine de volume la plus dure."),
        T("Deload: fewer sets, light weights. Recover.", "Décharge : moins de séries, charges légères. Récupérez."),
        T("Strength block: heavier sets of 4 with new accessories.", "Bloc force : séries de 4 plus lourdes avec de nouveaux compléments."),
        T("5 × 3 with long rests.", "5 × 3 avec de longs repos."),
        T("Heaviest week: doubles at RPE 9.", "Semaine la plus lourde : séries de 2 au RPE 9."),
        T("Deload, then restart the cycle with heavier weights.", "Décharge, puis relancez le cycle avec des charges plus lourdes."),
    ],
    "deload": [4, 8],
}

# --------------------------------------------------------------------------
# 4. Push/Pull/Legs: intermediate hypertrophy, 8 weeks × 6 days (A heavy, B volume)
# --------------------------------------------------------------------------
PUSH_A = T("Push A — Heavy", "Push A — Lourd")
PULL_A = T("Pull A — Heavy", "Pull A — Lourd")
LEGS_A = T("Legs A — Squat", "Jambes A — Squat")
PUSH_B = T("Push B — Volume", "Push B — Volume")
PULL_B = T("Pull B — Volume", "Pull B — Volume")
LEGS_B = T("Legs B — Hinge & Volume", "Jambes B — Charnière & volume")
PPL_1 = [
    Day("push-a", PUSH_A, S("barbell-bench-press", "main"), S("dumbbell-shoulder-press", "assist"),
        S("incline-dumbbell-press", "assist"), S("lateral-raise", "acc"), S("triceps-pushdown", "acc")),
    Day("pull-a", PULL_A, S("bent-over-row", "main"), S("chin-up", "assist"), S("lat-pulldown", "assist"),
        S("face-pull", "acc"), S("barbell-curl", "acc")),
    Day("legs-a", LEGS_A, S("back-squat", "main"), S("romanian-deadlift", "assist"), S("leg-press", "assist"),
        S("lying-leg-curl", "acc"), S("standing-calf-raise", "acc")),
    Day("push-b", PUSH_B, S("incline-dumbbell-press", "assist"), S("machine-chest-press", "assist"),
        S("cable-chest-fly", "acc"), S("lateral-raise", "acc"), S("overhead-triceps-extension", "acc")),
    Day("pull-b", PULL_B, S("seated-cable-row", "assist"), S("one-arm-dumbbell-row", "assist", "/side"),
        S("face-pull", "acc"), S("hammer-curl", "acc"), S("barbell-shrug", "acc")),
    Day("legs-b", LEGS_B, S("hip-thrust", "assist"), S("bulgarian-split-squat", "assist", "/leg"),
        S("leg-extension", "acc"), S("lying-leg-curl", "acc"), S("seated-calf-raise", "acc"), S("cable-crunch", "core")),
]
PPL_2 = [
    Day("push-a", PUSH_A, S("barbell-bench-press", "main"), S("overhead-press", "assist"),
        S("close-grip-bench-press", "assist"), S("lateral-raise", "acc"), S("cable-chest-fly", "acc")),
    Day("pull-a", PULL_A, S("bent-over-row", "main"), S("pull-up", "assist"), S("seated-cable-row", "assist"),
        S("face-pull", "acc"), S("dumbbell-curl", "acc")),
    Day("legs-a", LEGS_A, S("back-squat", "main"), S("romanian-deadlift", "assist"), S("walking-lunge", "assist", "/leg"),
        S("leg-extension", "acc"), S("standing-calf-raise", "acc")),
    Day("push-b", PUSH_B, S("dumbbell-shoulder-press", "assist"), S("dumbbell-bench-press", "assist"),
        S("cable-chest-fly", "acc"), S("lateral-raise", "acc"), S("triceps-pushdown", "acc")),
    Day("pull-b", PULL_B, S("lat-pulldown", "assist"), S("one-arm-dumbbell-row", "assist", "/side"),
        S("barbell-shrug", "acc"), S("face-pull", "acc"), S("hammer-curl", "acc")),
    Day("legs-b", LEGS_B, S("hip-thrust", "assist"), S("leg-press", "assist"), S("bulgarian-split-squat", "assist", "/leg"),
        S("lying-leg-curl", "acc"), S("seated-calf-raise", "acc"), S("cable-crunch", "core")),
]

ppl = {
    "id": "push-pull-legs",
    "level": "intermediate",
    "goal": "hypertrophy",
    "days_per_week": 6,
    "weeks": 8,
    "minutes": 70,
    "equipment": ["barbell", "dumbbell", "cable", "machine", "bodyweight"],
    "name": T("Push · Pull · Legs Hypertrophy", "Push · Pull · Legs Hypertrophie"),
    "summary": T(
        "The classic muscle-building split, six days a week: a heavy A day and a high-volume B day for every muscle group, with moderate reps taken close to failure.",
        "Le grand classique de la prise de muscle, six jours par semaine : un jour A lourd et un jour B à fort volume pour chaque groupe musculaire, en répétitions modérées proches de l'échec.",
    ),
    "progression": [
        T("Double progression: when you reach the top of the rep range on every set, add weight next time.",
          "Double progression : quand vous atteignez le haut de la fourchette sur toutes les séries, ajoutez de la charge la fois suivante."),
        T("A days are heavy, B days chase the pump: keep 1–2 reps in reserve on compound lifts; isolation can go close to failure.",
          "Les jours A sont lourds, les jours B visent la congestion : gardez 1–2 répétitions en réserve sur les polyarticulaires ; l'isolation peut aller près de l'échec."),
        T("Only 3 days available? Alternate an A week and a B week — progress is slower but steady.",
          "Seulement 3 jours ? Alternez une semaine A et une semaine B — la progression est plus lente mais régulière."),
    ],
    "phases": [
        Phase([1, 2, 3], T("Hypertrophy block 1", "Bloc hypertrophie 1"),
              T("Moderate weights, 8–15 reps: build tolerance to volume.",
                "Charges modérées, 8–15 répétitions : habituer le corps au volume."), PPL_1),
        Phase([4], T("Deload", "Décharge"),
              T("Two light sets per exercise. Recover before block 2.",
                "Deux séries légères par exercice. Récupérez avant le bloc 2."), PPL_1),
        Phase([5, 6, 7], T("Hypertrophy block 2", "Bloc hypertrophie 2"),
              T("Heavier compound lifts and new variations to keep growing.",
                "Polyarticulaires plus lourds et nouvelles variantes pour continuer à progresser."), PPL_2),
        Phase([8], T("Deload", "Décharge"),
              T("Recover, then start a new cycle a little heavier.",
                "Récupérez, puis démarrez un nouveau cycle un peu plus lourd."), PPL_2),
    ],
    "roles": {
        "main": [P(4, "8", 150, 7), P(4, "8", 150, 8), P(4, "6", 150, 8), P(2, "8", 120, 6),
                 P(4, "6", 180, 8), P(4, "6", 180, 9), P(5, "5", 180, 9), P(2, "6", 120, 6)],
        "assist": [P(3, "10-12", 90, 7), P(3, "10-12", 90, 8), P(4, "10", 90, 8), P(2, "10", 75, 6),
                   P(3, "8-10", 90, 8), P(4, "8-10", 90, 8), P(4, "8", 90, 9), P(2, "10", 75, 6)],
        "acc": [P(3, "12-15", 60, 8), P(3, "12-15", 60, 9), P(4, "12", 60, 9), P(2, "12", 60, 6),
                P(3, "10-12", 60, 9), P(4, "10-12", 60, 9), P(4, "10", 45, 10), P(2, "12", 60, 6)],
        "core": [core(3, 12, 30), core(3, 15, 30), core(3, 15, 30), core(2, 10, 30),
                 core(3, 12, 30), core(3, 15, 30), core(4, 15, 30), core(2, 10, 30)],
    },
    "notes": [
        T("Block 1: moderate weights, 2–3 reps in reserve.", "Bloc 1 : charges modérées, 2–3 répétitions en réserve."),
        T("Same exercises: add reps or weight (double progression).", "Mêmes exercices : ajoutez des répétitions ou de la charge (double progression)."),
        T("One extra set on most exercises.", "Une série de plus sur la plupart des exercices."),
        T("Deload: 2 easy sets per exercise.", "Décharge : 2 séries faciles par exercice."),
        T("Block 2: heavier compound lifts and new variations.", "Bloc 2 : polyarticulaires plus lourds et nouvelles variantes."),
        T("Add a set on compound lifts and accessories.", "Ajoutez une série sur les polyarticulaires et les compléments."),
        T("Overreach week: take the last isolation set to failure.", "Semaine de surcharge : amenez la dernière série d'isolation à l'échec."),
        T("Deload before the next cycle.", "Décharge avant le prochain cycle."),
    ],
    "deload": [4, 8],
}

# --------------------------------------------------------------------------
# 5. Athlete Power & Speed: pro, 6 weeks × 4 days
# --------------------------------------------------------------------------
AP_1 = T("Day 1 — Lower Power", "Jour 1 — Puissance bas du corps")
AP_2 = T("Day 2 — Upper Power", "Jour 2 — Puissance haut du corps")
AP_3 = T("Day 3 — Speed & Elasticity", "Jour 3 — Vitesse & élasticité")
AP_4 = T("Day 4 — Strength & Robustness", "Jour 4 — Force & robustesse")
AP_POWER = [
    Day("lower-power", AP_1, S("box-jump", "plyo"), S("power-clean", "main"), S("back-squat", "main"),
        S("nordic-curl", "assist"), S("hanging-leg-raise", "core")),
    Day("upper-power", AP_2, S("push-press", "main"), S("barbell-bench-press", "main"), S("chin-up", "assist"),
        S("bent-over-row", "assist"), S("band-pull-apart", "acc")),
    Day("elastic", AP_3, S("broad-jump", "plyo"), S("jump-squat", "plyo"), S("kettlebell-swing", "power"),
        S("walking-lunge", "assist", "/leg"), S("pallof-press", "core", "/side")),
    Day("robustness", AP_4, S("front-squat", "main"), S("hip-thrust", "assist"), S("chest-dip", "assist"),
        S("farmers-carry", "carry", "m"), S("dead-bug", "core", "/side")),
]

athlete = {
    "id": "athlete-power-speed",
    "level": "pro",
    "goal": "power",
    "days_per_week": 4,
    "weeks": 6,
    "minutes": 75,
    "equipment": ["barbell", "dumbbell", "kettlebell", "cable", "bodyweight", "band"],
    "name": T("Athlete Power & Speed", "Athlète Puissance & Vitesse"),
    "summary": T(
        "For competitive athletes in team and field sports. Explosive jumps and Olympic-style pulls come first while you are fresh, followed by heavy strength and injury-proofing work.",
        "Pour les athlètes en sports collectifs et de terrain. Les sauts explosifs et tirages olympiques passent en premier, à frais, suivis de la force lourde et du travail de prévention des blessures.",
    ),
    "progression": [
        T("Jumps and Olympic lifts: every rep at maximal intent. Stop the set if speed visibly drops.",
          "Sauts et mouvements olympiques : chaque répétition à intention maximale. Arrêtez la série si la vitesse baisse visiblement."),
        T("Main lifts use % of your 1-rep max (1RM). No recent max? Use a weight you could lift 3 more times.",
          "Les mouvements principaux sont en % de votre maximum sur 1 répétition (1RM). Pas de max récent ? Prenez une charge que vous pourriez soulever 3 fois de plus."),
        T("In season, keep days 1 and 2 only and cut sets by a third.",
          "En saison, gardez seulement les jours 1 et 2 et réduisez les séries d'un tiers."),
    ],
    "phases": [
        Phase([1, 2], T("Strength-speed base", "Base force-vitesse"),
              T("Build force on the main lifts while the jumps groove clean mechanics.",
                "Développer la force sur les mouvements principaux pendant que les sauts installent une mécanique propre."), [
            Day("lower-power", AP_1, S("box-jump", "plyo"), S("power-clean", "main"), S("back-squat", "main"),
                S("nordic-curl", "assist"), S("pallof-press", "core", "/side")),
            Day("upper-power", AP_2, S("push-press", "main"), S("barbell-bench-press", "main"), S("pull-up", "assist"),
                S("one-arm-dumbbell-row", "assist", "/side"), S("face-pull", "acc")),
            Day("elastic", AP_3, S("broad-jump", "plyo"), S("jump-squat", "plyo"), S("kettlebell-swing", "power"),
                S("bulgarian-split-squat", "assist", "/leg"), S("hanging-leg-raise", "core")),
            Day("robustness", AP_4, S("front-squat", "main"), S("romanian-deadlift", "assist"), S("chest-dip", "assist"),
                S("farmers-carry", "carry", "m"), S("side-plank", "core", "s/side")),
        ]),
        Phase([3, 4], T("Power conversion", "Conversion en puissance"),
              T("Fewer reps, heavier loads and more explosive variations.",
                "Moins de répétitions, charges plus lourdes et variantes plus explosives."), AP_POWER),
        Phase([5, 6], T("Peak & taper", "Pic & affûtage"),
              T("Low volume, maximal speed: arrive at competition fresh and fast.",
                "Faible volume, vitesse maximale : arriver frais et rapide en compétition."), AP_POWER),
    ],
    "roles": {
        "plyo": [P(4, "4", 90), P(5, "3", 90), P(5, "3", 90), P(6, "3", 90), P(4, "2", 120), P(3, "2", 120)],
        "main": [P(4, "5", 180, pct=75), P(5, "4", 180, pct=77.5), P(5, "3", 180, pct=80),
                 P(5, "3", 180, pct=82.5), P(4, "2", 210, pct=87.5), P(3, "2", 180, pct=80)],
        "power": [P(4, "10", 75), P(4, "10", 75), P(5, "8", 75), P(5, "8", 75), P(4, "6", 90), P(3, "6", 90)],
        "assist": [P(3, "8", 120, 7), P(4, "6", 120, 8), P(3, "6", 120, 8), P(4, "5", 120, 8), P(3, "4", 120, 8), P(2, "5", 90, 6)],
        "acc": [P(3, "15", 45, 7), P(3, "15", 45, 8), P(3, "12", 45, 8), P(3, "12", 45, 8), P(2, "12", 45, 7), P(2, "12", 45, 6)],
        "core": [core(3, 10, 30), core(3, 10, 35), core(3, 12, 40), core(3, 12, 45), core(2, 10, 40), core(2, 8, 30)],
        "carry": [carry(4, 30, 75), carry(4, 30, 75), carry(4, 40, 75), carry(5, 40, 75), carry(3, 40, 75), carry(2, 30, 75)],
    },
    "notes": [
        T("Build the engine: 75% on the main lifts, crisp jumps.", "Construire le moteur : 75 % sur les mouvements principaux, sauts nets."),
        T("77.5% and one more set of jumps.", "77,5 % et une série de sauts en plus."),
        T("Power block: fewer reps, more speed.", "Bloc puissance : moins de répétitions, plus de vitesse."),
        T("82.5% — make every rep fast.", "82,5 % — chaque répétition doit être rapide."),
        T("Peak: doubles at 87.5%, maximal intent.", "Pic : séries de 2 à 87,5 %, intention maximale."),
        T("Taper: half the volume, stay sharp for competition.", "Affûtage : moitié du volume, restez vif pour la compétition."),
    ],
    "deload": [6],
}

# --------------------------------------------------------------------------
# 6. Peak Strength Block: advanced, 4 weeks × 4 days
# --------------------------------------------------------------------------
PK_SQ = T("Day 1 — Squat", "Jour 1 — Squat")
PK_BP = T("Day 2 — Bench", "Jour 2 — Développé couché")
PK_DL = T("Day 3 — Deadlift", "Jour 3 — Soulevé de terre")
PK_OH = T("Day 4 — Overhead Press", "Jour 4 — Développé militaire")

peak = {
    "id": "peak-strength-block",
    "level": "advanced",
    "goal": "strength",
    "days_per_week": 4,
    "weeks": 4,
    "minutes": 75,
    "equipment": ["barbell", "dumbbell", "cable", "machine", "bodyweight"],
    "name": T("Peak Strength Block", "Bloc Pic de Force"),
    "summary": T(
        "A four-week peaking block for experienced lifters testing a new max. One heavy day per lift, low reps, long rest and focused accessories.",
        "Un bloc de pic de quatre semaines pour pratiquants confirmés qui veulent tester un nouveau maximum. Un jour lourd par mouvement, peu de répétitions, de longs repos et des compléments ciblés.",
    ),
    "progression": [
        T("Percentages are of your current 1-rep max (1RM). Round to the nearest 2.5 kg.",
          "Les pourcentages se basent sur votre maximum actuel (1RM). Arrondissez aux 2,5 kg les plus proches."),
        T("Accessories stay around RPE 7: recovery is the priority in this block.",
          "Les compléments restent autour du RPE 7 : la récupération est la priorité de ce bloc."),
        T("Test day: warm up, then singles at 90% and 95% before your new max attempt. Rest 3–4 days after.",
          "Jour de test : échauffez-vous, puis des simples à 90 % et 95 % avant votre tentative de nouveau max. Repos 3–4 jours ensuite."),
    ],
    "phases": [
        Phase([1, 2], T("Intensification", "Intensification"),
              T("Heavy triples to build strength that carries over to the max.",
                "Séries de 3 lourdes pour développer une force qui se transfère au maximum."), [
            Day("squat", PK_SQ, S("back-squat", "main"), S("front-squat", "assist"), S("lying-leg-curl", "acc"),
                S("plank", "core", "s")),
            Day("bench", PK_BP, S("barbell-bench-press", "main"), S("close-grip-bench-press", "assist"),
                S("pull-up", "assist"), S("face-pull", "acc")),
            Day("deadlift", PK_DL, S("deadlift", "main"), S("romanian-deadlift", "assist"), S("bent-over-row", "acc"),
                S("hanging-leg-raise", "core")),
            Day("press", PK_OH, S("overhead-press", "main"), S("incline-dumbbell-press", "assist"), S("chin-up", "assist"),
                S("farmers-carry", "carry", "m")),
        ]),
        Phase([3, 4], T("Peak & test", "Pic & test"),
              T("Heavier, fewer reps and lighter accessories so you arrive fresh for the max.",
                "Plus lourd, moins de répétitions et des compléments allégés pour arriver frais au test."), [
            Day("squat", PK_SQ, S("back-squat", "main"), S("leg-press", "assist"), S("lying-leg-curl", "acc"),
                S("plank", "core", "s")),
            Day("bench", PK_BP, S("barbell-bench-press", "main"), S("incline-dumbbell-press", "assist"),
                S("pull-up", "assist"), S("face-pull", "acc")),
            Day("deadlift", PK_DL, S("deadlift", "main"), S("back-extension", "assist"), S("seated-cable-row", "acc"),
                S("hanging-leg-raise", "core")),
            Day("press", PK_OH, S("overhead-press", "main"), S("dumbbell-shoulder-press", "assist"),
                S("lat-pulldown", "assist"), S("farmers-carry", "carry", "m")),
        ]),
    ],
    "roles": {
        "main": [P(5, "3", 240, pct=82), P(5, "3", 240, pct=86), P(4, "2", 270, pct=90), P(3, "1", 300, pct=[90, 102])],
        "assist": [P(3, "5", 150, 7), P(3, "5", 150, 7), P(3, "6", 120, 7), P(2, "6", 120, 6)],
        "acc": [P(3, "8", 90, 7), P(3, "8", 90, 7), P(3, "10", 75, 7), P(2, "10", 60, 6)],
        "core": [core(3, 8, 45, 60), core(3, 8, 45, 60), core(3, 10, 45, 60), core(2, 8, 30, 60)],
        "carry": [carry(3, 40, 90), carry(3, 40, 90), carry(3, 30, 90), carry(2, 30, 90)],
    },
    "notes": [
        T("5 × 3 at 82% on the main lifts.", "5 × 3 à 82 % sur les mouvements principaux."),
        T("5 × 3 at 86%.", "5 × 3 à 86 %."),
        T("Doubles at 90%; lighter accessory variations to save energy.",
          "Séries de 2 à 90 % ; variantes complémentaires allégées pour économiser l'énergie."),
        T("Test week: singles at 90% and 95%, then a new max. Rest 3–4 days after.",
          "Semaine de test : simples à 90 % et 95 %, puis un nouveau max. Repos 3–4 jours ensuite."),
    ],
    "deload": [],
}

PROGRAMS = [foundation, home, upper_lower, ppl, athlete, peak]


# --------------------------------------------------------------------------
# Expansion + validation
# --------------------------------------------------------------------------
def reps_for(p: dict, kind: str) -> str:
    if kind == "m":
        return f"{p['dist']}m"
    if kind in ("s", "s/side"):
        return f"{p['hold']}s" + ("/side" if kind == "s/side" else "")
    return f"{p['reps']}{kind}"


def expand(program: dict, exercises: dict) -> dict:
    pid = program["id"]
    errors: list[str] = []
    weeks = program["weeks"]
    phase_of = {}
    for i, ph in enumerate(program["phases"]):
        for w in ph["weeks"]:
            if w in phase_of:
                errors.append(f"{pid}: week {w} is in two phases")
            phase_of[w] = i
    if sorted(phase_of) != list(range(1, weeks + 1)):
        errors.append(f"{pid}: phases must cover weeks 1..{weeks}")
    if len(program["notes"]) != weeks:
        errors.append(f"{pid}: needs one note per week")
    for role, table in program["roles"].items():
        if len(table) != weeks:
            errors.append(f"{pid}: role {role!r} needs {weeks} weeks, has {len(table)}")

    plan = []
    for w in range(1, weeks + 1):
        phase = program["phases"][phase_of.get(w, 0)]
        days = []
        for day in phase["days"]:
            items = []
            for ex_id, role, kind in day["slots"]:
                ex = exercises.get(ex_id)
                if not ex:
                    errors.append(f"{pid}: unknown exercise {ex_id!r}")
                    continue
                if ex["equipment"] not in program["equipment"]:
                    errors.append(f"{pid}: {ex_id} needs {ex['equipment']}, not in the program's equipment")
                if role not in program["roles"]:
                    errors.append(f"{pid}: unknown role {role!r}")
                    continue
                p = program["roles"][role][w - 1]
                item = {"id": ex_id, "sets": p["sets"], "reps": reps_for(p, kind), "rest": p["rest"]}
                if p["pct"] is not None:
                    item["pct"] = p["pct"]
                elif p["rpe"] is not None:
                    item["rpe"] = p["rpe"]
                items.append(item)
            days.append({"id": day["id"], "name": day["name"], "exercises": items})
        if len(days) != program["days_per_week"]:
            errors.append(f"{pid}: week {w} has {len(days)} days, expected {program['days_per_week']}")
        plan.append({
            "week": w,
            "phase": phase_of.get(w, 0),
            "deload": w in program["deload"],
            "note": program["notes"][w - 1],
            "days": days,
        })

    ids = [d["id"] for d in plan[0]["days"]]
    for wk in plan:
        if [d["id"] for d in wk["days"]] != ids:
            errors.append(f"{pid}: week {wk['week']} day ids differ from week 1")
    for a, b in zip(plan, plan[1:]):
        if a["days"] == b["days"]:
            errors.append(f"{pid}: weeks {a['week']} and {b['week']} are identical")
    if errors:
        raise SystemExit("\n".join(errors))

    out = {k: program[k] for k in ("id", "level", "goal", "days_per_week", "weeks", "minutes",
                                    "equipment", "name", "summary", "progression")}
    out["phases"] = [{"weeks": ph["weeks"], "name": ph["name"], "focus": ph["focus"]} for ph in program["phases"]]
    out["plan"] = plan
    return out


def main() -> None:
    exercises = {e["id"]: e for e in json.loads((DATA / "exercises.json").read_text("utf-8"))}
    built = [expand(p, exercises) for p in PROGRAMS]
    OUT.write_text(json.dumps(built, ensure_ascii=False, indent=2) + "\n", "utf-8")
    for p in built:
        sessions = sum(len(w["days"]) for w in p["plan"])
        print(f"{p['id']:26} {p['weeks']} weeks · {len(p['phases'])} phases · {sessions} sessions")
    print(f"wrote {OUT.relative_to(ROOT.parent)}", file=sys.stderr)


if __name__ == "__main__":
    main()
