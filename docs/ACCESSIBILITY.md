# Accessibility

MusclePro targets **WCAG 2.2 level AA**. This page says what was tested, how,
and what is still open.

## What was tested (November 2026)

**Automated: axe-core 4.10** (rules tagged `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa` and `best-practice`). It ran on every page, signed out
and signed in as admin, in dark/English and light/French, with the menu
closed and open. That is 38 page states, plus a phone viewport
(iPhone 13), plus the exercise page and the workout logger with a
demonstration playing, at 1280 and 360 px in both themes.
**Result: no violations.**

**Scripted checks with Playwright:**

| Check | Result |
| --- | --- |
| The first Tab lands on "Skip to content", which moves focus to the main content | ✅ |
| Every muscle group on the 2D map can be reached with Tab and selected with Enter or Space (`role="button"`, `aria-pressed`) | ✅ |
| A focused muscle shows a ring and its name, even when it is already selected | ✅ |
| The menu is a modal dialog: focus moves into it, Tab stays inside, Escape closes it and returns focus to the menu button | ✅ |
| The muscle chips next to the body select muscles from the keyboard too | ✅ |
| At 320 CSS px wide (WCAG 1.4.10, Reflow), no page scrolls sideways | ✅ |
| Text contrast is at least 4.5:1 in both themes, including the small level badges and orange links on light surfaces | ✅ |
| Demonstration player: Tab reaches Pause, Slow motion and the four viewing angles in order; Space and Enter operate them; each state is exposed (`aria-pressed`, the Play / Pause name) | ✅ |
| Demonstration player: every control is at least 34 px high (WCAG 2.5.8, Target Size) | ✅ |
| With "reduce motion" on, a demonstration starts paused on a still frame and plays only when asked | ✅ |

## Design rules we keep

- Every interactive element is a real `button`, `a`, `input` or `select`,
  or has a role, a name and keyboard support (the SVG muscle groups).
- Focus is always visible (`:focus-visible` halo), never removed.
- Colour never carries meaning alone: levels are also written ("Beginner"),
  muscle roles are listed in text next to the body map, and the recovery map
  comes with a list that names each muscle's status and time to recover.
- Motion respects `prefers-reduced-motion`: the GLSL light field and the
  transitions stop, and demonstrations do not start by themselves.
- Anything that moves can be paused (WCAG 2.2.2): every demonstration has a
  Pause button, and it stops by itself when it is off screen.
- Dragging is never the only way (WCAG 2.5.7): the athlete can be turned by
  dragging, and the same views are available as buttons.
- A demonstration is a picture of the written steps, not a replacement: the
  canvas is named ("Animated demonstration: Back Squat") and the numbered
  steps next to it carry the same instructions as text.
- Each page has one `h1` and heading levels in order. `.h2` and `.h3`
  classes change how a heading looks without changing its level.
- Both languages are fully translated, and `lang` is set on `<html>` so
  screen readers use the right voice.

## Known limitations

- **Real screen readers**: VoiceOver, TalkBack and NVDA have not been tested
  yet. Automated tools find only part of the issues, so a manual pass with
  real assistive technology is the next step.

Found a barrier? Please open an issue. Accessibility bugs are treated as
bugs, not feature requests.
