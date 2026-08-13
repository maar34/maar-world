# 0007 — The version switch loads a frame when its panel opens

**Status:** accepted
**Date:** 2026-08-13
**Issue:** MW — /orbiters version two

**This is the fourth application-JavaScript exception.** `AGENTS.md` allowed
three — the Helix island, `ui/carousel`, `ui/embed-consent` — and said a fourth
"is a decision to be taken, not a precedent to follow". This is that decision,
taken by the owner.

## Context

`/orbiters` shows two versions of the instrument, swapped by
`patterns/VersionSwitch`: two radio inputs and a `:checked` selector, no script.
The closed panel is `display: none`.

A `display: none` subtree has no layout, so an iframe inside it loads into a
viewport of **0×0**. `play.maar.world` sizes its p5 canvas once, at startup, from
the window it finds. Version one's two players therefore booted at zero width
behind a closed panel and were **still zero-width when the panel opened**. The
owner's report: the code "is not loading correctly".

The frame is cross-origin. Nothing in this repository can reach inside it to
resize it after the fact — the same wall the `scrolling="no"` note in
`styles/prose.css` runs into, about the same application.

## What was tried before spending the exception

| | why it does not hold |
|---|---|
| `loading="lazy"` on the frames | Not a promise. Engines disagree about a lazy frame inside `display: none`, and one that defers gives no signal about when it stops. |
| `visibility: hidden` instead of `display: none` | Keeps layout, so the frame **would** size correctly — and both panels then take space at once. Stacked in one grid cell the page grows to the taller panel and leaves a screen of nothing under the shorter one. |
| Fix it in the player | The real fix, and it is in another repository. It does not help this page today. |

## Decision

`ui/VersionSwitchScript` parks and wakes frames:

- every frame ships in the HTML with its **real `src`**;
- on load, frames in the closed panel are parked — address moved to
  `data-parked-src`, `about:blank` put in its place;
- on each switch, the panel being left is parked and the panel being opened is
  woken, which assigns the original address back so the frame loads fresh, while
  visible, at its real size.

Parking the panel you leave is not housekeeping: **both versions make sound**, and
a player left running behind a closed panel goes on playing into a page showing
something else, with no control on screen to stop it.

## Why this is an enhancement and not a dependency

With the script absent, every frame keeps the `src` the build wrote and loads
exactly as it did before this file existed. Version one is then mis-sized behind
its panel — the bug as it stands, unchanged — and version two, the panel the page
opens on, is correct either way. No content, heading or link is lost. The swap
itself keeps working: it is CSS.

Nothing is persisted. No cookie, no storage.

## Consequences

- `AGENTS.md`'s count moves from three to four, and the sentence about a further
  exception now reads "a fifth". The rule is unchanged; only the number is.
- `verify:build` gains a `DRIVEN_MARKUP` rule — a page rendering
  `class="version-switch"` must ship the script. The failure this guards is
  silent: a zero-width app looks broken rather than unscripted.
- `[...page].astro` narrows it to records whose body calls `<VersionSwitch>`, the
  same shape as the other three tests. Only `{orbiters,es/orbiters}` today.
