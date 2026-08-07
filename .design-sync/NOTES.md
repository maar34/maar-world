# design-sync notes — Maar World

## What this repo is, for sync purposes

Maar World is an **Astro site, not a component package**. 38 of its 39 components are
`.astro` templates: they compile at build time and cannot render in a browser as React, so
they cannot go into `_ds_bundle.js`. Rewriting them as React was considered and rejected —
it would be new code that drifts from the real site, and the skill forbids reimplementation.

So this is a **styles-first sync**, agreed with the owner on 2026-08-03:

- The deliverable is the design language — 13 stylesheets (~230 KB), 237 tokens, 5 self-hosted faces.
- The bundle carries exactly one real component, `HelixDiagram` — the repo's one approved React island.
- A design agent builds Maar World layouts in HTML + these classes, not from React components.

If a real React component library ever appears here, re-run detection: the shape stays
`package`, but `componentSrcMap` and `ds-entry.tsx` would grow.

## Local scaffolding this sync owns

- **`.design-sync/ds-entry.tsx`** — the bundle entry. Re-exports `HelixDiagram` and imports
  `HelixDiagram.css` (the real site imports that CSS from `HelixIsland.astro`, beside the
  component rather than inside the `.tsx`; outside Astro there is no island to do it).
- **`.design-sync/build-styles.mjs`** (`cfg.buildCmd`) — flattens the stylesheets into
  `.cache/styles-flat.css`. **Run it before every converter build.**
  - Why it exists: the converter appends `cfg.cssEntry` *verbatim*. An entry made of
    `@import '../src/styles/*.css'` therefore ships unresolved paths and every design renders
    unstyled. The first build here did exactly that — 1 KB of CSS instead of 230 KB.
  - The stylesheet **order is parsed out of `BaseLayout.astro`**, not copied, so adding a
    stylesheet to the layout can't silently omit it here. It throws if the layout stops
    importing one-per-line.
- **`.design-sync/surface.css`** — appended last by the above. Re-asserts
  `html body { color: var(--ink); background: var(--sf-base) }`.
  - Why: the preview-card template hardcodes `body{background:#fff}` *after* our stylesheet,
    so equal specificity meant #efe7da cream ink on white — about 1.1:1, unreadable. `html body`
    is (0,0,2) and holds regardless of source order. It invents no values; both tokens are the
    ones `type.css` already binds.
- **`cfg.tokensGlob` is deliberately unset.** `lib/css.mjs` `copyTokens()` returns immediately
  without `tokensPkg` and resolves the glob under `node_modules/<pkg>` — useless for tokens
  that live in `src/styles/`. `tokens/` is empty by design; `tokens.css` ships first inside
  `_ds_bundle.css`, which IS reachable from the `styles.css` import closure. That closure is
  the actual contract.

## Known render warns (checked, legitimate — not new)

- **`[FONT_MISSING] "Archivo"`** — false positive. `--face-head` is
  `'Archivo Variable', 'Archivo', sans-serif`; the shipped face is **Archivo Variable**, first
  in the stack. Bare `Archivo` is a secondary fallback that was never meant to ship. Verified in
  Chrome: all five faces load, and the **width axis works** (`font-stretch` 62% → 63.3px,
  125% → 116.5px on the same string) — the exact capability MW-11 paid 90 KB for.
- **`[TOKENS_MISSING] --area-pigment, --page-icon`** — expected. Both are set at runtime via
  inline style (`SiteHeader.astro`, `[...page].astro`, `LabIndex.astro`).
- **`[TOKENS_MISSING] --card-rot`** — false positive. It appears only inside a *comment* in
  `card.css:838`; the validator's scraper doesn't strip comments.
- **`[RENDER_SKIPPED]`** — the owner declined the ~200 MB Playwright install and reviewed in
  Chrome instead. Previews are visually verified, not machine-verified.

## Real dangling token references found in the repo (NOT sync bugs)

Surfaced by `[TOKENS_MISSING]`. These are genuine and they affect the live site — reported to
the owner, deliberately **not** fixed here (a visual change is theirs to make):

- **`--t-h1-size` / `--t-h1-weight` / `--t-h1-line`** — used by
  `.prose .editorial-profile__statement h2` (`prose.css:355-359`), but `tokens.css` defines only
  the `--t-h1-sm-*` set. That heading gets no size, weight or line-height.
- **`--sf-ink`** — used by `prose.css:251` and `collage-field.css:14` as a `background`.
  Never defined anywhere; both backgrounds resolve to nothing.

## Re-sync risks

- **`build-styles.mjs` must run first.** `cfg.buildCmd` records it. Skip it and the converter
  silently ships whatever stale `.cache/styles-flat.css` is on disk — or fails if the cache was cleaned.
- **`surface.css` is a workaround for host behaviour**, not repo truth. If the design host ever
  stops injecting `body{background:#fff}`, this file becomes a harmless no-op — it never
  contradicts `type.css`.
- **The stylesheet list follows `BaseLayout.astro`.** A stylesheet imported anywhere else
  (a scoped `<style>` in an `.astro` file, e.g. `shell-dark/Shell.astro`) is **not** in the
  bundle. Scoped Astro styles are invisible to this sync by construction.
- **Only `.astro`-free CSS ships.** Any visual behaviour implemented in an `.astro` scoped
  `<style>` block will be missing from designs and is the most likely source of "it looks
  different in Claude Design" reports.
- `HelixDiagram`'s only states are interactive (focus/selection), so its card shows the resting
  drawing. That is the whole honest story, not a gap.
