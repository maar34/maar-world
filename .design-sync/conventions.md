# Maar World — how to build with this design system

This system is **CSS, not components.** Maar World is an Astro site: its 38 `.astro`
components compile at build time and are not importable here. `_ds_bundle.js` exports exactly
one React component, `HelixDiagram`. Everything else you build, you build as plain HTML
elements carrying this system's classes. That is the intended way to use it — not a limitation
to work around, and **not** an invitation to invent class names.

No Tailwind, no utility classes, no CSS-in-JS, no inline design values. Those are repo
invariants, not preferences.

## Wrapping and setup

Put page content inside the shell wrapper:

```html
<div class="shell" data-shell="dark">
  <main class="shell__main">
    <div class="shell__content">…</div>
  </main>
</div>
```

**One surface: dark, on every route.** There is no theme toggle and nothing to toggle to.
`body` is `--sf-base` (#000000) with `--ink` (#efe7da) cream text — already applied by the
stylesheet; never re-declare a page background. Light values exist (`--sf-paper`) but they are
for cut-paper *marks*, not for pages.

**Never all caps — and never all lowercase either.** There is no `text-transform` in these
stylesheets, and none may be added: type renders in the casing the copy is written in. The
design rule is a prohibition on shouting (no uppercased eyebrows, buttons or meta labels), not
an instruction to lowercase everything. `body` used to carry `text-transform: lowercase`, which
is exactly that misreading, and it flattened every proper noun on the site. Write copy in
normal sentence casing.

## The class vocabulary

Type — use these instead of styling headings yourself:

| Class | Face |
|---|---|
| `.t-display` | Bodoni Moda, 76px — the page's one big statement |
| `.t-h2` | Archivo Variable, 34px |
| `.t-h3` | Archivo Variable |
| `.t-small` | Libre Franklin |
| `.t-meta` | DM Mono — labels, captions, eyebrows |
| `.prose` | wrap long-form body copy; styles its own descendants |

Buttons — `.btn` plus one modifier:
`.btn--primary` · `.btn--secondary` · `.btn--text` · `.btn--stamp` · `.btn--destructive` · `.btn--collect`

Cards — `.card` plus one modifier:
`.card--article` · `.card--article-wide` · `.card--feature` · `.card--collection` · `.card--compact` · `.card--entry` · `.card--cover-card` · `.card--lean-1…3`

Marks — the house's editorial gesture, applied to a **heading**, one mark per heading:
`.mark--highlight` (fills with the area pigment) · `.mark--cut` · `.mark--stamp` · `.mark--strike` · `.mark--overprint` · `.mark--tear-1…4` · `.mark--tilt-1…4`

Other families: `.paper-phrase*`, `.tree-hub*`, `.collage-header*`, `.nav-link`, `.nav-list`.

## Tokens

Never write a raw pixel, hex or duration — every value comes from a custom property.

- **Pigments** — `--c-maar` #c36891 (water, place, wayfinding) · `--c-collect` #8cbdb3 (saving,
  sets, favourites) · `--c-tree` #bdbd8c (growth, time, lineage). Three, and only three.
- **`--area-pigment`** is the *current area's* pigment. Set it once on a wrapper
  (`style="--area-pigment: var(--c-collect)"`) and `.mark--highlight` follows it. Unset, it
  falls back to `--c-maar`.
- **Surfaces** — `--sf-base` (page) · `--sf-raised`, `--sf-raised-2` (lifted) · `--sf-sunken`.
- **Ink** — `--ink` · `--ink-muted` · `--pigment-ink` (#000000, for type sitting *on* a pigment).
- **Spacing** — `--s-1 --s-2 --s-3 --s-4 --s-6 --s-8 --s-12 --s-16 --s-24`. Use these for every
  gap, padding and margin.
- **Other** — `--r-0` (radius; it is `0` — this system has square corners) · `--measure` (66ch
  reading width) · faces `--face-display`, `--face-head`, `--face-body`, `--face-mono`.

## Where the truth is

Read these before styling anything non-obvious — they are the real files, and they beat this
summary: `_ds/<folder>/styles.css` and its import closure (`_ds_bundle.css` carries all 13
stylesheets, `tokens.css` first). `guidelines/` holds the project's own design docs.

## A typical build

```html
<div class="shell" data-shell="dark" style="--area-pigment: var(--c-collect)">
  <main class="shell__main">
    <div class="shell__content" style="display:flex; flex-direction:column; gap:var(--s-8)">
      <p class="t-meta">Colección · 2025</p>
      <h1 class="t-display"><span class="mark mark--highlight">Sky Sounds</span></h1>
      <p class="prose">Una edición de piezas grabadas sobre el agua.</p>
      <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:var(--s-4)">
        <article class="card card--article">
          <h3 class="t-h3">Primera pieza</h3>
          <p class="t-small">Catorce minutos, campo abierto.</p>
        </article>
        <article class="card card--feature">
          <h3 class="t-h3">Destacada</h3>
        </article>
      </div>
      <a class="btn btn--primary" href="#">Escuchar</a>
    </div>
  </main>
</div>
```

Layout glue (grid, flex, gaps) is yours to write — but spend tokens on it, never raw values.
