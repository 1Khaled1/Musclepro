# Accessibility

MusclePro targets **WCAG 2.2 level AA**. This page says what was tested, how,
and what is still open.

## What was tested (November 2026)

**Automated: axe-core 4.10** (rules tagged `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa` and `best-practice`). It ran on every page, signed out
and signed in as admin, in dark/English and light/French, with the menu
closed and open. That is 38 page states, plus the 3D view and a phone
viewport (iPhone 13). **Result: no violations.**

**Scripted checks with Playwright:**

| Check | Result |
| --- | --- |
| The first Tab lands on "Skip to content", which moves focus to the main content | ✅ |
| Every muscle group on the 2D map can be reached with Tab and selected with Enter or Space (`role="button"`, `aria-pressed`) | ✅ |
| A focused muscle shows a ring and its name, even when it is already selected | ✅ |
| The menu is a modal dialog: focus moves into it, Tab stays inside, Escape closes it and returns focus to the menu button | ✅ |
| In 3D mode the muscle chips next to the model select muscles from the keyboard | ✅ |
| At 320 CSS px wide (WCAG 1.4.10, Reflow), no page scrolls sideways | ✅ |
| Text contrast is at least 4.5:1 in both themes, including the small level badges | ✅ |

## Design rules we keep

- Every interactive element is a real `button`, `a`, `input` or `select`,
  or has a role, a name and keyboard support (the SVG muscle groups).
- Focus is always visible (`:focus-visible` halo), never removed.
- Colour never carries meaning alone: levels are also written ("Beginner"),
  and muscle roles are listed in text next to the body map.
- Motion respects `prefers-reduced-motion`: the GLSL light field and the
  transitions stop.
- Each page has one `h1` and heading levels in order. `.h2` and `.h3`
  classes change how a heading looks without changing its level.
- Both languages are fully translated, and `lang` is set on `<html>` so
  screen readers use the right voice.

## Known limitations

- **3D canvas**: the WebGL model is driven by pointer and touch only, so it
  is hidden from assistive technology. The muscle chips on the same page are
  the accessible way to do the same thing, and the 2D map is fully keyboard
  operable.
- **Real screen readers**: VoiceOver, TalkBack and NVDA have not been tested
  yet. Automated tools find only part of the issues, so a manual pass with
  real assistive technology is the next step.

Found a barrier? Please open an issue. Accessibility bugs are treated as
bugs, not feature requests.
