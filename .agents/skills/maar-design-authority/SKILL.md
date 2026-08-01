---
last-verified: 2026-08-01
verified-against: moved from docs/agent/DESIGN-REFERENCES.md
status: active
---

# Design references, and which one wins

## Order of authority

1. **`Maar World Design System.dc.html`** in the Claude Design project — the specification,
   and the source of truth. Read it **live** every session; it is actively edited. Never cache
   its values into this repo. Token values in `src/styles/tokens.css` came from spec **1.1**.
2. **`planning/design-references/current-site/Maar World 4a.dc.html`** — a design *direction*
   mockup. Reference only. Useful for intent, not for values.
3. **`planning/design-references/current-site/*.png`** — production screenshots. Evidence of
   content types, density and responsive problems. Not a visual target.
4. **`uploads/Maar World Directions.dc.html`** in the design project — how the direction was
   arrived at. Context only.

Where a reference and the spec disagree, **the spec wins.**

## What "Maar World 4a" is good for

It is the only place the **cut-words / dada cut** treatment is shown concretely. The spec's
rules-of-use table permits "cut words" at `h1` and card-cover level and forbids them
everywhere else, but does not illustrate them. 4a shows the two mechanics:

- **Cut word** — a word in a flat pastel field given a torn edge via `clip-path: polygon(...)`
  plus a small rotation, sitting inside an otherwise plain heading.
- **Echo** — the same text duplicated at a few pixels' offset in a pigment, `aria-hidden`, so
  the visible word reads once to a screen reader.

Its faces agree with the spec: Bodoni Moda for display, Archivo for the cut word, DM Mono for
the meta line, Libre Franklin for prose. Its pigments agree exactly: `#a9d5e8`, `#f0aecb`,
`#e7c98f`, `#100f14`, `#efe7da`, `#f2ece2`. That agreement is corroboration for
`src/styles/tokens.css`.

## Where 4a must NOT be followed

These are not matters of taste — the spec forbids them in as many words:

| 4a does | The spec says |
|---|---|
| `radial-gradient(...)` pigment washes behind headings | *"pigment appears only as flat fields — no diffusion washes, no gradients, no glows"* |
| `filter: blur(17px)` on those washes | *"no diffusion washes anywhere: pigment is a hard-edged field or it is absent"*; motion moves *"opacity, height and 2d transform only. no blur"* |

> **Read the gradient row narrowly. The test is diffusion, not the keyword.**
> 4a's `linear-gradient`s are **not** washes: three are highlighter strokes
> (`transparent 8%, #a9d5e8 8%, #a9d5e8 92%, transparent 92%` — hard stops, a marker stroke that
> does not fill the line box) and two are 8px diagonal hatch patterns. Neither diffuses anything.
> An agent that reads "the spec forbids gradients" and deletes them removes two of the seven
> marks. Only the **radial** washes and the blur behind them are forbidden. See
> `skills/maar-visual-language/SKILL.md`.
| `#ff3ec8`, `#8d8798`, `#d6d2cc`, `#141319`, `#a39ead`, `#1a1822` | every value must be *"one of the six approved colours, or ink at a fixed opacity, or one measured step off a surface"* |
| `'Chivo'` in one stylesheet block | the four faces are Bodoni Moda, Archivo, Libre Franklin, DM Mono |

So: take the **cut-word and echo mechanics** from 4a, take **every value** from the spec, and
implement the marks with flat hard-edged pigment fields and no blur.

## Reminder about marks

Randomness is decided once per instance and **persisted** — a heading must not reshuffle on
re-render or on navigating back. `src/components/patterns/GlyphRun.astro` does this by
deriving the run deterministically from a seed rather than storing state; any future mark
component should follow the same approach.

Caps, from the rules-of-use table:

| Level | Marks | Tilt | Faces | Cut words |
|---|---|---|---|---|
| h1 | max 2 | allowed | 2 max | allowed |
| card cover | max 2 | allowed | 2 max | allowed |
| h2 | none | never | one face | never |
| h3, accordion label | none | never | one face | never |
| body, ui, labels, captions | none | never | one face | never |
