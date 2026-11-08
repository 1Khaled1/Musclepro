<p align="center">
  <img src="frontend/public/logo.svg" width="72" height="72" alt="MusclePro logo" />
</p>

# MusclePro — Product Vision

> **Pick a muscle. Master the move.**
> One training companion that takes anyone from their first rep to the podium —
> starting from the body itself.

---

## 1. The idea in one paragraph

Most people who want to get stronger don't know *what* to train, *how* to do
it safely, or *what to do next week*. MusclePro answers all three, starting from
the most intuitive interface there is: the human body. Tap a muscle on a
professional anatomy map (2D or real 3D), get the right exercises with
step-by-step form, follow a program built for your level, and watch your body
light up as you train it. The same app serves a beginner doing push-ups at home
and a competitive athlete running a power block — in English and in French.

## 2. The problem we solve

| Who | What goes wrong today |
| --- | --- |
| **Beginners** | Overwhelmed by choice, unsure of form, quit within weeks because nothing tells them what to do next. |
| **Intermediate gym-goers** | Train the same few muscles, stall, and have no simple way to see balance or progress. |
| **Pro and competitive athletes** | Need structured, periodized power and strength work, precise logging (kg *and* lbs), and records — usually spread across spreadsheets and several apps. |
| **French-speaking athletes** | Most quality training tools are English-only or poorly translated. |

Existing muscle-map apps prove the demand, but many are cluttered with ads in the
middle of a workout, stop at "here is an exercise" without a plan, or treat
anatomy as a flat sticker rather than a living picture of your training.

## 3. Who it's for

- **Leïla, 27 — the beginner at home.** No equipment, 30 minutes, three times a
  week. Needs confidence and clear form cues. *Starts with:* Home Bodyweight
  Starter, the muscle map, coach tips.
- **Karim, 34 — the regular gym-goer.** Has trained for two years, plateaued.
  *Needs:* a real program (Upper/Lower, Push·Pull·Legs), progression rules,
  and proof that it's working.
- **Inès, 22 — the competitive athlete.** Plays a field sport at regional level.
  *Needs:* power and speed work in the right order, heavy strength blocks,
  estimated 1RM tracking, per-set units for mixed equipment.
- **Coaches (next).** Want to hand programs to athletes and see their logs.

## 4. Product principles

1. **Anatomy first.** The body is the home screen. Every exercise, program and
   statistic connects back to the muscles it trains — in 2D for speed, in real
   3D for understanding.
2. **Form before load.** Every exercise ships with numbered steps and a coach
   tip. We never push volume over technique.
3. **One app, first rep to podium.** Levels from beginner to pro athlete live
   side by side; users grow inside MusclePro instead of outgrowing it.
4. **Bilingual by design.** English and French are first-class, including
   exercise content, units and number formats — not an afterthought.
5. **Calm, premium, focused.** Liquid Glass design, no ads in the training flow,
   no dark patterns. A workout screen is for training.
6. **Trust and privacy.** Strong security by default, data export (CSV) and
   one-tap account deletion. We never sell personal or training data.
7. **Free to start, light to run.** Runs on free hosting tiers; heavy assets
   (the 3D model) load only when asked for.

## 5. Where we are today (v1)

Shipped and running:

- **Muscle map** — professional 2D anatomy illustrations (male/female,
  front/back, dark/light) and a real 3D anatomical model (BodyParts3D +
  Z-Anatomy, 467 muscle structures and skeleton) mapped to 14 training groups.
- **67 exercises** with step-by-step form and coach tips, in EN/FR.
- **6 programs** from beginner to pro: Foundation Full Body, Home Bodyweight
  Starter, Upper/Lower Strength, Push·Pull·Legs, Athlete Power & Speed, Peak
  Strength Block.
- **Workout generator** — goal × level × time × equipment × muscles.
- **Workout logger** — per-set kg/lbs, rest timer, autosaved drafts.
- **Progress** — streaks, weekly volume, estimated 1RM records, weekly muscle
  heat map on the body, CSV export.
- **Accounts and admin** — secure sign-in, profiles, user management with roles
  (athlete, coach, admin).
- **Stack** — Vite + TypeScript + Three.js/GLSL front-end, Flask API, Firebase
  Realtime Database, one Docker service on Render.

## 6. Where we're going

### Now — make v1 excellent (next 3 months)

- **Go live** on Render with Firebase, monitoring and backups.
- **Exercise media** — short looping form clips or posed 3D demonstrations for
  every exercise, starting with the 20 most used.
- **150+ exercises**, including mobility, stretching and rehab-friendly
  variations.
- **Installable app (PWA)** — home-screen install and offline logging that
  syncs when back online.
- **Accessibility pass** — WCAG 2.2 AA across the app, screen-reader friendly
  muscle selection.

### Next — make it smart (3–9 months)

- **Smart progression** — suggest next session's loads and reps from what was
  actually logged (RPE, missed reps, deloads).
- **Recovery map** — the 3D body shows which muscles are fresh or fatigued based
  on recent training, and the generator respects it.
- **Coach mode** — coaches assign programs, athletes train, coaches review logs
  and records; the coach role already exists in the data model.
- **Custom programs** — users and coaches build and share their own plans.
- **More languages** — Arabic and Spanish next, with right-to-left support.

### Later — the performance platform (9–18 months)

- **Athlete testing** — jump, sprint, and strength tests with benchmarks by
  sport and level.
- **Health integrations** — Apple Health / Google Fit for body weight, heart
  rate and activity.
- **Teams and clubs** — squads, shared plans and a team dashboard.
- **Coach marketplace** — verified coaches publish programs; MusclePro takes a
  fair share.

## 7. What we will not do

- **No medical claims.** MusclePro gives general training guidance, not
  diagnosis or rehabilitation prescriptions.
- **No ads inside workouts** and no selling of personal or training data.
- **No copied content.** Our anatomy assets are properly licensed (MIT and
  CC BY-SA, credited in `THIRD_PARTY_NOTICES.md`); exercises and programs are
  written by us.
- **No feature bloat.** If a feature doesn't help someone train better this
  week, it waits.

## 8. How we'll measure success

| Goal | Signal | Target (first year) |
| --- | --- | --- |
| People start | First workout logged within 24 h of sign-up | 50 % of new accounts |
| People stay | Active in week 4 after sign-up | 35 % |
| Plans work | Program weeks completed vs started | 60 % |
| People progress | Users who move up a level (beginner → intermediate…) | 20 % within 6 months |
| Athletes trust it | Pro-level users logging 3+ sessions a week | 70 % of pro accounts |
| It feels great | Satisfaction score (NPS) | ≥ 50 |
| It stays fast | Mobile page load (LCP), 2D map interactive | < 2.5 s; 3D model < 3 MB |

These are targets to aim for, not current results.

## 9. Business model (hypothesis to validate)

- **Free** — muscle map (2D and 3D), exercise library, programs, logging and
  progress. The core must stay free.
- **MusclePro Plus** — smart progression, recovery map, unlimited custom
  programs, advanced analytics.
- **Coach & Team** — per-athlete pricing for coaches and clubs.
- Start on free hosting; move to paid tiers only when usage justifies it.

## 10. Technical direction

- Keep the **single-origin architecture** (SPA served by the API) — simple,
  secure and cheap to run.
- Firebase Realtime Database for user data now; revisit (Firestore or
  PostgreSQL) when we need richer queries for coaches and teams.
- **Anatomy as a platform** — one muscle taxonomy shared by the 2D map, the 3D
  model, exercises, programs and analytics, so every new feature lights up the
  body for free.
- Performance budgets are features: lazy-load heavy assets, render 3D on
  demand, respect reduced-motion and low-power devices.
- Security stays non-negotiable: strict CSP, hashed passwords, revocable
  sessions, rate limits, and a security scan in CI before launch.

## 11. Risks and open questions

- **Content depth vs. speed** — exercise media is costly to produce; posed 3D
  demonstrations may scale better than filmed video.
- **3D on low-end phones** — keep 2D as the default and 3D as an opt-in.
- **Free-tier limits** — Render's free plan sleeps when idle; plan the move to
  a paid instance before public launch.
- **Licensing** — the 3D model is CC BY-SA: attribution must stay visible, and
  changes to the model file must remain under the same licence.
- **Female 3D anatomy** — the open 3D dataset is male; a female model is
  needed for parity with the 2D map.

---

## Résumé en français

**MusclePro : choisissez un muscle, maîtrisez le geste.** Une application
d'entraînement qui part du corps humain — carte musculaire professionnelle en
2D et modèle anatomique réel en 3D — pour guider chacun, du débutant à
l'athlète de haut niveau : exercices détaillés étape par étape, programmes
adaptés au niveau, générateur de séances et suivi des progrès, en français et
en anglais. Nos principes : l'anatomie d'abord, la technique avant la charge,
un design premium sans publicité pendant l'entraînement, et le respect de la
vie privée. Prochaines étapes : mise en production, vidéos ou démonstrations
3D des exercices, progression intelligente, carte de récupération musculaire
et mode coach.
