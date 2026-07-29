# Handoff

Regenerated at every stop. A fresh agent should need nothing but this file,
`MIGRATION-LEDGER.md`, `docs/agent/OPERATING-RULES.md` and the Linear issue.

**Last updated:** 2026-07-29T09:20Z
**Last issue worked:** MW-11 — accessibility and responsive sign-off, plus the first design
work done against the live spec (the DesignSync MCP was unreachable during MW-9).
**Next action:** the remaining MW-11 human gates, listed under "What MW-11 still needs a human
for" below. **Do not start MW-10/MW-12.** The remaining `verify:content` failures are
check-side, not content-side; see the ledger line `content/residue-is-check-side` before
touching any content to satisfy them.

---

## Where the programme is

| Issue | Title | State |
|---|---|---|
| MW-3 | Resumable execution harness | **done** |
| MW-4 | Freeze the production route manifest | **done** — 306 routes frozen |
| MW-5 | Repository, Astro scaffold, content schemas | **done** |
| MW-6 | 35 NFC card records, 70 immutable URLs | **build done, in review** — human must review 35 pages + scan 3 cards |
| MW-7 | Maar pages, genesis codes, Lab articles | **done** — 95 pages, `verify:content` green |
| MW-8 | Collect → `/collect/*`, Tree → `/tree` | **done** — `routes/redirects.map`, 111 lines |
| MW-9 | Embed facades, self-hosted fonts, Helix island | **build done** — 3 items handed to an owner, see below |
| MW-11 | Full verification + a11y/responsive sign-off | **automated gates done, human gates outstanding** |
| MW-10, MW-12 | Cutover, stabilise | **human-gated — do not start** |

## Read this before trusting a green run

The route contract is now **fully satisfied**. The missing-count metric has landed:

| Checkpoint | preserved paths missing |
|---|---|
| after MW-5 | 262 of 264 |
| after MW-6 | 192 of 264 — dropped by exactly the 70 card forms |
| after MW-8 | **0 of 264** ✔ |

`npm run verify` exits non-zero — **70 passed, 2 failed, 1 skipped** — for exactly two reasons,
both known and both recorded. It was 46/2/1; the 24 new passes are `verify:a11y`, which is now
composed into the suite. The two failures are the same two they have always been:

1. `verify:links` → *no third-party request fires on page load*, **73** on-load references to
   `www.dropbox.com`. That is MW-6's card art, blocked on a human decision since MW-6. It was
   75; two went when the DWE1406 and STW3344 bodies stopped duplicating the cover the card
   route already renders. **It must never go up.**
2. `verify:content` → **49 problems across 48 of 130 pages** (33 headings, 7 text, 9 links).
   It was 174, then 56 at the start of this session. Every one of the 49 left is the check
   disagreeing with itself, quantified page by page in the ledger line
   `MW-7 NOTE content/residue-is-check-side`: an entity-decoding asymmetry in
   `verify-content.mjs` `stripTags()` on 33 card pages, a text floor measured against the
   whole production document (`<title>` counted as body text) on 7 pages, 8 `disqus.com`
   links removed on purpose, and one `soundcloud.com` link the expectation took from a stale
   legacy `_site` build that the frozen production manifest contradicts. **Do not edit content
   to satisfy these.** Fixing them means `scripts/author-content-expectations.mjs` and
   `scripts/verify-content.mjs`, and each needs a selftest case.

**Every other check passes.** If a future run sees anything else red, it is a regression.

`npm run migrate:pages` regenerates `src/content/pages/` and `media/` from the read-only
legacy checkouts. It is idempotent and its output is committed, so a fresh clone needs no
access to those checkouts to build.

## In flight

Nothing. Nothing is half-applied.

## What the a11y/responsive session did

`npm run verify:a11y` is new and is composed into `npm run verify`. It is 18 per-page
assertions plus 6 stylesheet ones, measured against `dist/` and against the CSS that ships —
**including inline `<style>` blocks**, which matters: Astro emits a scoped style inline when it
is small and into a stylesheet when it is not, and the rule painting `--ink-faint` is inline on
all 35 card pages, so reading only `dist/**/*.css` concluded the token was painted nowhere.

Contrast is **computed, not transcribed**: tokens are resolved out of the built CSS through
`var()` and `color-mix(… N%, transparent)`, composited over their surface and measured as WCAG
relative luminance. 17 pairs, lowest 3.33:1. A pair is measured on a surface only where a page
actually paints it, and the pairs skipped are named in the output rather than passed over.

**24 selftest cases** were added (57 → 81), one per assertion plus three that prove the shapes
which only *look* wrong still pass — a wrapping `<label>` with no `for=`, an `aria-hidden`
region that is also `display:none`, and a decorative `alt=""`. Each of those three was a false
positive the check reported before it was calibrated against the real build.

Six real defect classes were found and fixed, all in the migration scripts rather than in
`src/content/**`, which is generated:

- **38 pages skipped a heading level and 7 carried two `<h1>`.** The legacy theme printed the
  title as an `<h1>` above every body, so authors reached for `###`/`####` as a font size.
  `scripts/lib/headings.mjs` rewrites each heading to one level deeper than its nearest
  smaller-level ancestor. Heading *text* is untouched byte for byte.
- **30 `<iframe>` had no title.** Every Lab player's track name was already in the block above
  it; that is now the frame's title. **Ordering trap:** this must run *after* the kramdown
  `{:.class}` strip, or the strip deletes the label back out of the title it just wrote.
- **Two anchors were empty** — Mailchimp badges whose only child was a third-party image the
  privacy rule drops. They now read their own `title` as visible text.
- **Two tables had no `<th>`.** Both are label-column tables; their left cells are now
  `<th scope="row">`, and the single-cell one is `role="presentation"`.
- **Nothing allowed a long word to break.** `body` now sets `overflow-wrap: break-word`.

**Responsive, measured in Chrome, not asserted:** every page loaded into a fixed-width iframe
and measured for horizontal overflow. **0 of 133 pages overflow** — 101 at all four widths plus
the remaining 32 at 360. The harness was proved able to fail first. Per-breakpoint layout
matches the spec's responsive table exactly: gutters 20/32/48/64 and display 40/48/60/76.

## What the design session did

The **DesignSync MCP is reachable now** — it was not during MW-9 — so `Maar World Design
System.dc.html` was read live. Three things came out of it:

- **The display scale is bound at all four breakpoints.** The spec states this twice and the
  two do not agree: the type-scale table names two steps (76, 48), the responsive table names
  four (40, 48, 60, 76). Only two were bound, so an `h1` was 48px at 360 where the table says
  40 and 48px at 1024 where it says 60.
- **`src/styles/button.css`** is the spec's five-by-four state grid transcribed cell by cell.
  It reaches migrated form controls by element, not by class — a class in `src/content/**` is
  removed by the next migration run.
- **The prose column now aligns with the chrome.** It was centred in the *viewport* while the
  header and footer sat in the 1180 column, so at 1745px the chrome started at x=276 and the
  body text at x=480. Every page read as two documents that had never met.

## What MW-11 still needs a human for

The automated gates pass. These are the issue's own human-review gates, and an agent cannot
close them:

1. **All 35 rendered card pages reviewed**, and three physical cards scanned.
2. **Forms submit end-to-end** — both Formspree endpoints and both Google Forms, with a real
   test submission each. Sending real traffic to a third party is not an agent's call.
3. **All ~175 `play.maar.world` embeds load from the new origin.** They are titled, same-site
   and unclipped; whether each *plays* needs the origin live.
4. **Judgement, not mechanics:** whether an alt text reads well, whether a focus ring is
   legible over a photograph, whether the reading order makes sense.
5. **Lighthouse against the pre-migration baseline** — non-blocking, and the baseline was
   never captured.

One thing a fresh session will still meet immediately, plus one now settled:

- **`verify:contract` is green.** It is now 3/3 against a committed 611-route manifest
  (sha256 `3f55727ba0d4`, decisions 355 preserve / 0 redirect / 256 drop). The history
  below is kept because it explains how it got there. — *At the MW-9 stopping point
  `verify:contract` was red, and it was not MW-9's.* A concurrent session had an
  *uncommitted* re-freeze in the working tree:
  `routes/manifest.production.json` had grown from the locked 306 routes to 611, and
  `routes/policy.json` from 299/0/7 to 355/0/256, so all three contract-lock assertions
  failed. Run against the committed `routes/` with the same `dist/`, `verify:contract` is
  3/3 and `verify:routes` 7/7. No MW-9 commit touches `routes/`. That re-freeze needs
  `npm run contract:relock`, which is a deliberate human decision in its own commit — see
  OPERATING-RULES. If contract is still red, look at the manifest's `routeCount` first.
- **After any change under `src/content/`, the next `astro build` warns.** The incremental
  content-layer store in `.astro/` emits one `[glob-loader] Duplicate id` warning per changed
  file, and `verify:build` fails on warnings above zero. It is stale cache, not a content
  defect — a fresh clone and CI never see it. Delete `.astro/` and rebuild.

## What MW-9 changed

- `/helix-diagram.html` is the one approved React island: `src/components/react/`
  `HelixDiagram.tsx` + `HelixIsland.astro` + `HelixDiagram.css`, mounted `client:only="react"`
  from `island: "helix"` in the content record. The schema restricts `island` to that single
  literal, so a second island cannot be added by writing a string in a content file.
  `@astrojs/react` is in `astro.config.mjs` for this and nothing else.
- 18 third-party embeds across 13 pages carry a titled, keyboard-operable facade with a
  provider chip and a plain sentence about what is and is not requested. `play.maar.world`
  and `radio.maar.world` remain plain iframes — same registrable domain.
- Fonts confirmed self-hosted and not regressed by the island: 18 `woff2` under `/_assets`,
  zero `fonts.googleapis.com` / `gstatic` / `unpkg` / `cdnjs` / analytics / `@babel/standalone`
  anywhere in `dist/`, and every `url()` in every built stylesheet is relative.
- Exactly **1** of 133 emitted pages references a JavaScript asset. The 34 pages with an
  inline `<script>` are MW-6's 33 Orbiter forwards plus the island's own bootstrap.

**The DesignSync MCP was not reachable during MW-9**, so `Maar World Design System.dc.html`
could not be re-read live. Every value in the island and the facades comes from
`src/styles/tokens.css`; no raw hex, pixel size or duration was introduced. Re-check both
against the live spec when the MCP is available.

## Blocked — needs a human

1. **Card art is hotlinked from Dropbox** (`MW-6`, ledger `cards/dropbox-third-party`).
   **73** `<img src>` references to `www.dropbox.com` — 35 on the canonical card pages plus
   34 on the retired `/collect/cards/*` twins and 4 in Lab articles, all the same URLs and
   the same decision. MW-6 says keep those URLs and that
   migrating them is out of scope; the MW-1 quality gate says no third-party request may fire
   on page load. **Both cannot hold.** `verify:links` fails on this deliberately — the check
   was not weakened to make the build pass. Either self-host the card art (needs approval) or
   record an explicit exception for card art as page content. Two of these Dropbox URLs are
   already dead in production.
2. **No Artizen destination URL** (`MW-6`, ledger `cards/artizen-destination`).
   `COMMERCE.destinationUrl` is `null`, so card pages render no destination link at all.
   MW-1 and MW-6 forbid introducing Bandcamp, so nothing is substituted. One line in
   `src/config/site.ts` when the URL exists.
3. **The 34 `%20` Collect card URLs** (`MW-4`, ledger `collect/%20-card-urls`). Are they
   printed on any card, sleeve or packaging? Every one currently defaults to `preserve`,
   because preserving keeps both options open and redirecting does not. 66 routes carry
   this open decision in `routes/policy.json`.
4. **Should `/resume` be `noindex`?** (`MW-7`, ledger `resume/noindex`). MW-7 calls this an
   open owner decision and says mark it rather than guess. It is currently crawlable and in
   the sitemap, exactly as production. One flag in `src/content/pages/resume.md`.
5. ~~**The Helix diagram is a placeholder**~~ — **resolved by MW-9.** `/helix-diagram.html` is
   now `src/components/react/HelixDiagram.tsx`, mounted `client:only="react"`. No unpkg, no
   runtime Babel, route unchanged. It is the only page in `dist/` that references a
   JavaScript asset.
6. **Embeds click *out*, not *in*** (`MW-9`, ledger `embeds/click-out-not-load`).
   All 18 third-party embeds are facades that link to the provider rather than loading a
   player in place. An in-page player has to be injected by script, which would put
   application JavaScript on 13 pages — and MW-9 says the Helix island is the only page
   allowed to ship any. Both cannot hold. Nothing third-party is requested until the visitor
   chooses; what changed is that a visitor now leaves the site to play the media.
7. **5 assets are still over 2 MB** (`MW-9`, ledger `media/assets-over-2mb`).
   MW-9's acceptance criterion is "largest served asset under 2 MB". The 8.8 MB landing GIF
   is already gone; `2024_ss-5/6/7.jpeg` (2.6–2.75 MB) and `433-suits.gif` (2.48 MB) are not.
   Re-encoding needs `sharp`/`ffmpeg` and changes what a visitor sees.
8. **Two display line heights are interpolated, not specified** (`MW-11`, ledger
   `design/display-steps`). The spec's responsive table gives four display sizes but the
   type-scale table gives line heights for only two of them. 40px and 60px ship as a linear
   interpolation between the two stated anchors — 1.03 and 1.00 — and that is the **only**
   value in `src/styles/tokens.css` not read directly off the spec. One line each to change.
9. **Seven of the spec's ten page families are unbuilt** (`MW-11`, ledger
   `shell/page-families-outstanding`). Every route still renders family 03 (entry). Home is
   specified as family 01 — "one feature card, then three entry cards" — and building it means
   deciding *which* cards, which is content, which moves what `verify:content` asserts. That
   is an owner's decision, not a styling one.
10. **The Tree hub image is gone** (`MW-8`, ledger `tree/sunflower-image`).
   `/tree` had one image, hotlinked from `herbarium.plantasia.space` — a different
   registrable domain, so a third-party request on page load. The file is in no read-only
   checkout, so it cannot be self-hosted from here. Needs the asset, or an exception.

## Decisions taken that a human should confirm

- **Repository name `maar-world`**, at `/Users/Qubit/Documents/Github/maar-world/maar-world/`.
  Taken from ARCHITECTURE-REVIEW §6/§7 rather than invented, because the brief left it blank
  and stalling an unattended run was worse. Renaming is a `git mv` plus one line in
  `package.json`.
- **No git remote, nothing pushed.** Creating a GitHub repository is outward-facing and
  human-gated. All work is local commits on `main`.
- **5 routes dropped**: `/z/README-zh(.html)` on maar and tree (theme ballast, per
  ARCHITECTURE-REVIEW §10 item 12) and the already-404 collect
  `/docs/ent-worlds/glossary.html`.
- **Tree merges to `/tree/*`, not a single `/tree` page.** Tree has two real pages, so
  collapsing everything onto one path would lose `/max-network-berlin`.

## Three things production told us that the decision records did not

0. **Card pages forward to Orbiter, and a crawler cannot see it.** `/EBT5599` returns 200 and
   then runs `window.location.href = "https://orbiter.plantasia.space/?trackId=<track_v2_id>"`
   300ms later. That is what a physical card scan actually does. Exactly the 33 cards with a
   `track_v2_id` forward; `DWE1406` and `STW3344` do not. `verify:cards` asserts it per card
   against the frozen `orbiterTrackId`. **Any future crawl-based check is blind to JavaScript
   behaviour — do not assume the manifest captures everything a visitor experiences.**


1. **The dual-form property is site-wide.** Every page is live at both `/X` and `/X.html`
   via the host's `.html` fallback — not just the 35 card codes. The crawl probes the twin of
   every HTML route; that found 97 extra live URLs. Preserving both spellings is automatic
   under `build.format: 'file'`.
2. **Addendum §5.1 is stale against production.** It reports all 68 card pages pointing at
   dead storefronts. The live Collect card pages already link to
   `maar-world.bandcamp.com/merch`; `physical.maar.world` and `digital.maar.world` appear
   nowhere in the crawl. Trust the manifest, not the addendum, on commerce links.
3. **Kramdown is not CommonMark, and the difference is visible.** Kramdown kept a `<div>`
   and everything to its matching close as one raw HTML block. CommonMark ends an HTML block
   at the first blank line, so the next indented line becomes an indented *code* block —
   93 of 95 pages initially shipped their own markup as escaped source inside `<pre>`.
   `migrate-pages.mjs` dedents raw HTML while it is open. **Any further legacy content
   arriving as `.md` needs the same treatment**, along with kramdown's `{:.class}` inline
   attribute lists, which every other engine renders as literal text.
4. **Jekyll's layouts rendered `title` and `excerpt`, and nothing in Astro does.**
   `/collect/decks` and `/collect/suits` have literally empty bodies; without the layout
   they render blank. The migration materialises a heading for any page whose body has none.
5. **`<span class="material-symbols-outlined">speaker_group</span>` is not an icon here.**
   The glyph came from `fonts.googleapis.com`, which the self-hosted-fonts rule forbids, so
   without the font the span degrades to the literal ligature name in the heading. All 18
   were dropped. Do not reintroduce that class.

## State of the repo

```
routes/manifest.production.json   306 routes, frozen — CONTRACT, do not edit
routes/policy.json                299 preserve / 5 drop / 2 redirect — CONTRACT
routes/nfc-cards.json             the 35 codes (34 skysounds + STW3344)
routes/seeds.json                 URLs a crawler cannot discover
routes/redirects.map              111 explicit collect/tree 301s — MW-11 configures the host
verify/external-links-*.json      562 external URLs + 9 reviewed allowedNew, 11 already dead
verify/content-expectations.json  95 pages, 117 headings taken from the legacy sources
src/styles/tokens.css             design tokens, framework-neutral
src/content/schemas.mjs           zod schemas (testable without a build)
src/config/site.ts                COMMERCE.destinationUrl — the ONLY destination URL (null)
src/content/pages/               95 migrated pages; filename encodes outputPath, `/`→`__`
src/pages/[...page].astro         the catch-all; params come from outputPath, verbatim
```

**`outputPath` is the load-bearing field.** It is the dist-relative path with no `.html`,
derived from the policy's `servedAt`, and the route uses it as the param without touching
it. `collect/cards/032_-maar-sky-sounds.3-card X ` keeps its internal space *and* its
trailing space. Never slugify, trim or re-case it.

Route-shape proofs live at `src/pages/ZZZ0000.astro` and
`src/pages/route-proof/[...slug].astro`. They prove `CODE.html` emits at the output root and
that a filename with a space *and a trailing space* survives the build. **Remove both at
MW-11**, once the 35 real cards carry the guarantee themselves.

## Commands

```
npm run build            assemble media + astro build
npm run verify           everything; exit code decides
npm run verify:cards     the physical-card contract, cheapest useful check
npm run verify:a11y      the accessibility gates, against dist/ and the CSS that ships
npm run verify:selftest  proves the suite still fails on broken builds (81/81)
npm run verify:schemas   proves the schemas still reject bad records (12/12)
npm run freeze:routes    re-crawl production (only if the contract must be re-frozen)
npm run migrate:pages    re-derive src/content/pages/ + media/ from the legacy checkouts
npm run author:redirects           regenerate routes/redirects.map from the policy
npm run author:content-expectations  re-record the per-page assertions after a content change
npm run ledger -- status summary, including every BLOCKED item
```

## Reminders that are easy to get wrong

- Design references have an order of authority — see `docs/agent/DESIGN-REFERENCES.md`.
  The live spec wins over `Maar World 4a.dc.html`, which is a direction mockup whose gradient
  washes, blur and off-palette colours the spec forbids. Take its cut-word/echo mechanics,
  take every value from the spec.
- The design system project is **actively edited**. Re-read it live before implementing any
  component; never cache its values into this repo. Token values in `src/styles/tokens.css`
  were transcribed from spec version **1.1** — re-check them against the live spec before
  building new components.
- Legacy checkouts one directory up are **read-only**.
- `verify:cards` guards a case-insensitive-filesystem trap: on macOS `existsSync` confirms
  `/ebt5599.html` for a file named `EBT5599.html`, so casing is compared against an exact
  directory listing.
- Cards must carry `noindex`, and the schema enforces `noindex: true` as a literal.
- Commerce URLs are banned from content records by the schema. They come from
  `COMMERCE.destinationUrl`, which is deliberately `null` — MW-1 and MW-6 forbid introducing
  Bandcamp or any storefront, so card pages render no destination at all until Artizen exists.
