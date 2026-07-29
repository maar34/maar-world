# Handoff

Regenerated at every stop. A fresh agent should need nothing but this file,
`MIGRATION-LEDGER.md`, `docs/agent/OPERATING-RULES.md` and the Linear issue.

**Last updated:** 2026-07-29T16:00Z
**Last issue worked:** MW-11 — the type marks, then an architecture review and
the six structural changes that came out of it, then three groups of restored
production endpoints.
**Next action:** see "What to do next" below. **Do not start MW-10/MW-12.**

---

## Read this first: the repo changed shape this session

If you have seen this repo before, four things moved. Everything else is where
it was.

| Was | Is now |
|---|---|
| `src/content/pages/` — 95 files, one directory, `__`-encoded names | `src/content/migrated/**` — a real tree mirroring the URL |
| *(nothing)* | `src/content/authored/**` — **yours**, no script writes here |
| 5 collections (`cards`, `pages`, `genesis`, `lab`, `docs`) | 2 (`cards`, `pages`) — see `docs/adr/0001` |
| Lab index baked into `lab.md` as HTML | rendered by the route from the collection |

**The single most important change:** you can now publish a page by writing one
file. See `docs/AUTHORING.md`. Before this session there was no authoring path
at all — adding a Lab post meant editing a read-only legacy checkout, amending a
hash-locked contract, running `contract:relock`, and re-running a 1760-line
migration.

## Where the programme is

| Issue | Title | State |
|---|---|---|
| MW-3 | Resumable execution harness | **done** |
| MW-4 | Freeze the production route manifest | **done** — 611 routes frozen, 3 blockers closed this session |
| MW-5 | Repository, Astro scaffold, content schemas | **done** |
| MW-6 | 35 NFC card records, 70 immutable URLs | **build done, in review** — human must review 35 pages + scan 3 cards |
| MW-7 | Maar pages, genesis codes, Lab articles | **done** |
| MW-8 | Collect → `/collect/*`, Tree → `/tree` | **done** |
| MW-9 | Embed facades, self-hosted fonts, Helix island | **build done** |
| MW-11 | Verification, a11y, design, architecture | **automated gates done, human gates outstanding** |
| MW-10, MW-12 | Cutover, stabilise | **human-gated — do not start** |

## The numbers, and what they mean

```
npm run verify   →  71 passed, 2 failed, 1 skipped   (was 70/2/1 at session start)
```

Both failures are known, deliberate and **human-gated**. Neither is a regression:

1. **`verify:links`** → 73 on-load references to `www.dropbox.com`. MW-6's card
   art. **It must never go up.** See BLOCKED item 1.
2. **`verify:content`** → 49 problems across 48 of 130 pages. Every one is the
   check disagreeing with itself, quantified in the ledger line
   `MW-7 NOTE content/residue-is-check-side`. **Do not edit content to satisfy
   these.**

Everything else passes. If a future run shows anything else red, it is a
regression:

```
verify:selftest   94/94        verify:routes     8/8   (0 missing, 320 distinct paths)
verify:schemas    12/12        verify:cards      20/20 (+1 skip, needs MW-10)
verify:build      6/6          verify:a11y       24/24 (19 contrast pairs, lowest 3.33:1)
verify:contract   3/3          ledger:check      ok
```

`verify:contract` is 3/3 against the **same sha256 it had at session start**
(`3f55727ba0d4`). Nothing this session touched `routes/manifest.production.json`
or `routes/policy.json`. No relock happened.

## What this session did

Eight commits, `4fbb16e..a9269c1`. Each has its own ledger line with the
reasoning; this is the map.

### Design — the type marks (2 commits)

`docs/agent/VISUAL-LANGUAGE.md` is the reference and is up to date.

- **`src/lib/mark.mjs`** chooses which word is marked and which frozen variant it
  gets, and emits **class names only**. **`src/styles/mark.css`** draws them and
  holds every value. The spec's folder map asks for exactly that split.
- Two marks, **two different authorities**, and this is the thing to understand
  before touching them: `mark.highlight` is *specified* by the live design spec
  and is transcribed from it. The **cut word** is only *permitted* by the spec
  and never defined, so its mechanics and values come from
  `planning/design-references/current-site/Maar World 4a.dc.html` — which lives
  one directory **up**, not in this repo.
- **The staircase rule.** The spec says "a highlighted span is never rotated".
  That is a *mechanic*, not a prohibition: a highlight is a pen stroke and a hand
  holds the pen level, so when a line tilts the strokes stay horizontal and
  *step*. `.mark--highlight` counter-rotates by its block's tilt. A cut word is a
  piece of paper someone put down, and paper does not land square — it rotates.
- **`@fontsource-variable/archivo`** replaced the static package. The static one
  has no width axis, so `font-stretch` was silently inert. Costs **76 KB** on the
  latin subset. Reversible in two lines — `MW-11 NOTE design/archivo-variable-cost`.

### Architecture — from the review (4 commits)

The full review is at `/var/folders/.../architecture-review-20260729-112545.html`
(temp dir, will be cleaned by the OS — the findings are all in the ledger).

- **Authoring seam.** Two directories behind one collection. The migration keeps
  **full ownership** of `migrated/` and stays re-runnable — it was deliberately
  *not* frozen, because freezing before cutover would cost the ability to fix all
  95 pages at once when the next defect appears.
- **Route-contract split.** `routes/manifest.production.json` was doing two jobs:
  recording what production served (right forever) and deciding which URLs may
  exist (right only until cutover). `verify:routes` now allows
  `preserved ∪ authored`, and authored routes are read from the records
  themselves — no second list, no relock.
- **Lab index** renders from the collection. `labIndexHtml` and
  `collectLabEntries` are deleted.
- **i18n is a relation.** `translationKey` is **stored, not derived** — 3 of the
  10 Lab pairs have slugs that are translations rather than copies, so a
  path-based rule finds 70% and says nothing about the rest. 11 pairs, each
  exactly 2. `lang` is now **required by the schema** on all 96 records
  (85 en / 11 es); it used to default to `'en'` invisibly in the layout, which is
  why the a11y language check could never fail.
- **One `scripts/lib/html-text.mjs`** replaced five text extractors. The three
  forms are **deliberately not unified** — `plainText`'s exact output *is*
  `textSha256` in the frozen manifest.
- **Dead interfaces deleted**: 3 empty collections, `inNav`, and `SECTIONS` moved
  from `SiteHeader.astro` to `src/config/site.ts`. Reasoning in
  `docs/adr/0001-one-pages-collection.md`.

### Restored production endpoints (2 commits)

Three MW-4 blockers closed — **39 of the 254** live URLs the build was going to
stop answering. All were chosen because they **fail silently**.

- `/feed`, `/feed.xml` — both, because production serves both as 200 XML, not as
  a redirect pair. `src/lib/feed.mjs`, hand-written, no dependency.
- `/robots.txt` — permissive on purpose. Cards stay `noindex`-by-meta rather than
  `Disallow`, because `Disallow` stops a crawler ever *seeing* the `noindex`.
- `/sitemap.xml` — the path Search Console is registered against.
- `/404` — an **authored content record**, the first real use of the new seam.
- **21 browser-chrome URLs** — icons, `site.webmanifest`, `browserconfig.xml`.
  Both manifests were unconfigured boilerplate (empty `name`, `#ffffff` theme,
  `#da532c` tile) and now carry the real name and surface token.
- **`BrandMark.astro`** — the header had no mark at all. It paints with
  `currentColor` and `shell.css` binds that to `--area-pigment`, so it is sky on
  Maar, pink on Collect, gold on Tree from one file.

**`verify:routes` asserts all 16 restored endpoints still exist**, separately
from the extras check, because that one asks "is this page wanted" and this asks
"is something production served still served".

## What to do next

In this order. The first is the only one that is blocking anything.

1. **Decide the Dropbox card art.** It is the only red check that is not
   check-side, it has been open since MW-6, and it gates the MW-1 quality gate.
   Self-host 73 images, or record an explicit exception.
2. **The remaining route groups** — 215 live URLs, 4 decisions. These need the
   owner's knowledge, not an agent's: 54 theme assets (incl. `main.css`, loaded
   by every page on all three live sites), 129 orphan static files reachable only
   by hotlink, 12 deploy artifacts (almost certainly retire), 34 `%20` Collect
   card URLs (are they printed on anything?).
3. **The remaining five marks** — stamp, hatch plate, tilted actions, struck
   word, opposed chips. All measured in `VISUAL-LANGUAGE.md`. Safe to build now
   that the structure is settled; they key off `outputPath`, which does not move.
4. **Seven of ten page families** are unbuilt. Every route renders family 03.
   Home is family 01 and building it means deciding *which* cards — content, and
   the owner's call.

## Blocked — needs a human

`npm run ledger -- status` lists 24, but the ledger is **append-only**, so it
still shows blockers that later work closed. **Five are already resolved**:
`MW-7 helix-diagram.html` (MW-9 shipped the island), `MW-11
shell/designsync-unavailable` (the MCP is reachable; the spec was read live this
session), `MW-11 design/page-bodies-unstyled`, `MW-11 pages/missing-alt` (a11y
passes 133/133), and `MW-11 shell/lang-two-pages-unset` is half-closed —
`/esp-feedback` is now `es`; `/helix-diagram` is deliberately left, being English
prose around a Spanish diagram.

**Improving `ledger status` to reconcile closed blockers is itself worth doing** —
a status that overstates open work gets ignored.

The genuinely open ones:

1. **Card art is hotlinked from Dropbox** (`MW-6`). 73 refs. Both MW-6 and the
   MW-1 gate cannot hold. Two of the URLs are already dead in production.
2. **`/collect/cards` lost 34 thumbnails** and `/collect/documentation` lost 9.
   Restoring the first would take Dropbox from 73 to ~109 — same decision as 1.
3. **No Artizen destination URL** (`MW-6`). One line in `src/config/site.ts`.
4. **Four route groups** — see "What to do next" item 2.
5. **`/resume` noindex?** (`MW-7`). Currently crawlable, exactly as production.
6. **Embeds click *out*, not *in*** (`MW-9`). An in-page player needs script on
   13 pages; MW-9 allows script on one.
7. **5 assets over 2 MB** (`MW-9`). Re-encoding needs `sharp`/`ffmpeg`.
8. **The Tree hub image** (`MW-8`) — hotlinked, in no checkout.
9. **`/lab/*/ip-orchestra`'s author avatar** (`MW-7`) — 404s in production too.
10. **Two interpolated display line heights** (`MW-11 design/display-steps`).
11. **The mark tilt set, and the spec's block-only tilt rule**
    (`MW-11 NOTE design/mark-tilt-set`) — 4a's values shipped, on instruction.

## MW-11's own human gates

The automated gates pass. An agent cannot close these:

1. All 35 rendered card pages reviewed, and three physical cards scanned.
2. Forms submit end-to-end — both Formspree endpoints and both Google Forms.
3. All ~175 `play.maar.world` embeds load from the new origin.
4. Judgement, not mechanics: does an alt read well, is a focus ring legible over
   a photograph, does the reading order make sense.
5. Lighthouse against a pre-migration baseline that was never captured.

## Traps that are easy to hit

- **`src/content/migrated/**` is generated and wiped by `rmSync` on every
  migration run.** Fix `scripts/migrate-pages.mjs`, never the `.md`.
  `src/content/authored/**` is the opposite: no script touches it.
- **Nothing but page records may live in `src/content/authored/`.** The
  collection globs it, so a stray `README.md` there is parsed as a page and fails
  schema validation. That is why `docs/AUTHORING.md` is in `docs/`.
- **Quote the date.** `date: 2026-08-01` unquoted is a YAML date object; the
  schema wants a string. The build fails and names the file.
- **After any change under `src/content/`, the next `astro build` warns** —
  `[glob-loader] Duplicate id`, one per changed file, and `verify:build` fails on
  warnings above zero. Stale cache, not a defect:
  `find .astro -mindepth 1 -delete` and rebuild.
- **Ledger prose is evaluated by the shell.** Backticks, `$` and unquoted quotes
  in a `npm run ledger -- append` argument are interpolated before `ledger.mjs`
  sees them. One word was lost this way; see `MW-11 NOTE routes/feed-robots-404-typo`.
- **`verify:cards` guards a case-insensitive-filesystem trap.** On macOS
  `existsSync` confirms `/ebt5599.html` for a file named `EBT5599.html`.
- **The card pages forward to Orbiter after 300 ms**, so a browser-based check
  navigates away mid-measurement. Use `STW3344` or `DWE1406` — they do not
  forward — or disable scripts.
- **Design references live one directory UP**, in
  `../planning/design-references/`, not in this repo. The legacy checkouts
  (`../maar.world-site`, `../collect.maar.world`, `../tree.maar.world`) are
  **read-only**.
- **The design spec is actively edited.** Re-read it live through the DesignSync
  MCP (project `9c177a8a-4d82-4322-963b-4ee7018f3982`) before implementing any
  component. Never cache its values here.

## Invariants — work that can only pass by breaking one of these does not pass

- **The 35 NFC card codes**, 70 URLs, never redirected, byte-for-byte stable.
- **Never edit `routes/manifest.production.json` or `routes/policy.json`.**
  Regenerating them is a change. `verify:contract` fails the moment either moves.
  Re-locking is a deliberate human command in its own commit.
- **Preserve URLs exactly** — no `.html` stripping, no slug normalising.
- **Self-host every font. No analytics, no cookie banner.**
- **No Tailwind, no CSS-in-JS, no React app shell, no CMS, no backend.** React
  only inside the Helix island.
- **Never touch DNS, the live sites, or any legacy repository.**

## State of the repo

```
src/content/migrated/     95 generated page records, a tree mirroring the URL
src/content/authored/     1 record (404.md) — yours, no script writes here
src/content/cards/        35 NFC card records
src/content.config.ts     2 collections
src/lib/                  mark.mjs, translations.mjs, feed.mjs — pure, testable
src/pages/                4 routes + 6 endpoints (feed, feed.xml, robots.txt,
                          sitemap.xml, favicon.svg, safari-pinned-tab.svg,
                          site.webmanifest, browserconfig.xml)
scripts/lib/html-text.mjs the one HTML→text module; plainText defines textSha256
routes/                   CONTRACTS — manifest, policy, contract.lock, nfc-cards
docs/AUTHORING.md         how to publish a page
docs/adr/0001-*.md        why there are two collections and not five
docs/agent/               OPERATING-RULES, DESIGN-REFERENCES, VISUAL-LANGUAGE
media/                    tracked source assets → .public/ at build (gitignored)
```

**`outputPath` is still the load-bearing field.** It is the dist-relative path
with no `.html`, and the route uses it as the param untouched. The *filename* is
now navigational only — nothing in `src/` reads the entry id.

**Route-shape proofs** at `src/pages/ZZZ0000.astro` and
`src/pages/route-proof/[...slug].astro` are still scaffolding and are **still to
be removed at MW-11**, once the 35 real cards carry the guarantee themselves.

## Commands

```
npm run build                 assemble media + astro build
npm run verify                everything; its exit code is the source of truth
npm run verify:cards          the physical-card contract, cheapest useful check
npm run verify:selftest       proves the suite still fails on broken builds (94/94)
npm run migrate:pages         re-derive src/content/migrated/ from the legacy checkouts
npm run author:content-expectations   re-record per-page assertions after a content change
npm run contract:relock       DELIBERATE, human, its own commit
npm run ledger -- status      summary, including every BLOCKED item
```

## Decisions a human should still confirm

- **Repository name `maar-world`**, at `/Users/Qubit/Documents/Github/maar-world/maar-world/`.
- **No git remote, nothing pushed.** All work is local commits on `main`.
- **5 routes dropped**: `/z/README-zh(.html)` on maar and tree, and the
  already-404 collect `/docs/ent-worlds/glossary.html`.
- **Tree merges to `/tree/*`**, not a single `/tree` page.
- **A stray `package.json`, `package-lock.json` and `node_modules/` sit in the
  PARENT directory** (`/Users/Qubit/Documents/Github/maar-world/`) from a shell
  cwd reset during an `npm install`. The repo was never affected. Deleting files
  there is blocked for an agent; it needs a human.
