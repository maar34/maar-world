# Handoff

**State:** last work commit `af173c3`, plus the commit that updated this file.
`npm run verify` = **73 passed, 2 failed, 1 skipped**. selftest 106/106.

---

## READ THIS BEFORE YOU WRITE ANY CSS

The checks are green and the owner is unhappy. Both are true at once. Their words,
after the first carousel shipped:

> *"There's no one photo that looks good. We are not respecting any size. We have
> numbers. We have numbers everywhere. I don't know how we can make this carousel
> worse… It's really bad. This is not something you can give me after one day of
> work."*

They were right. It passed every check and it was ugly. So, before anything else:

1. **Look at it.** Screenshot the page and judge it as a designer would. A green
   `verify` is not evidence that anything looks good — no check here measures
   taste and none can.
2. **Measure the content before you frame it.** Five of the eleven home-page
   photographs are square, six are 3:2. One forced ratio cropped a third off half
   the set. That query took ten seconds and I ran it only after being told.
3. **Never draw a constraint on the page.** Eleven numbered links existed because
   a no-JavaScript carousel cannot track position. A limitation is something to
   design around silently, not to render as chrome.
4. **Reuse before inventing.** The owner: *"It's a carousel. Why don't we use a
   carousel with cards? Do we need to invent it again?"* `patterns/card`, the
   plate, the badge and the meta line all exist. Compose them.
5. **Fewer, better.** Every unit costs the owner tokens, time and patience. One
   thing that looks finished beats three that pass checks.

---

The 71 you may remember became 73 as `verify:build` gained two coverage
assertions — prose elements, and component classes. Both were **added**; no check
was changed, relaxed or removed. A correspondence held between two files by hand
is the failure mode this codebase has actually shipped three times.

Both failures are known, deliberate and human-gated. Neither is a regression:

- **`verify:links`** — 73 on-load refs to `www.dropbox.com` (MW-6 card art). **Must never go up.**
- **`verify:content`** — 49 problems / 48 pages. All check-side. **Do not edit content to fix them.**
  Why: `npm run ledger -- find residue-is-check-side`

Everything else is green: selftest 106/106 · schemas 12/12 · build 8/8 · contract 3/3 ·
routes 8/8 · cards 20/20 (+1 skip, needs MW-10) · a11y 24/24.

---

## Next action

**The page families are the whole of what the site is missing.** The owner's own
list — "missing cards, carousels, a hero; the content is narrower than the header;
images don't fit" — is one cause, not five: `/` renders **family 03 (entry)**,
whose spec is *"single measure, 66ch max"*. It is an article layout on the home
page. The narrow column is family 03 behaving correctly on the wrong page.

Build in dependency order, because four families consume the same component:

~~1. `patterns/card`~~ **BUILT** — five variants, live on both covered indexes.
~~2. `ui/carousel`~~ **BUILT, then corrected once.** 8 carousels, 38 slides, no
JavaScript. Read `ledger -- find carousel-corrected` before touching it.

1. **Family 01 home** — *"one feature card, then three entry cards. no sidebar."*
   This is the next unit and the one the owner is waiting for. `/` is still an
   article: a 66ch column, no hero, the header twice as wide as the content.
   `card.feature` is the spec's hero. **Compose the existing card — do not invent
   a hero component.**
2. **Family 04 collection** for `/collect` — *"two-up card grid, pink badges,
   collect action per card"*. Then **06 tree**, **05 place**, **07 search**,
   **08 form**.

Do NOT widen family 03's measure to make the home page look wider. 66ch is the
spec's rule for an entry page, and the home page simply is not one.

Still open and needing a human:

5. **Dropbox card art** — the only red check that isn't check-side.
6. **4 route groups**, 215 live URLs — theme assets, orphan files, deploy artifacts,
   `%20` card URLs. Need the owner's knowledge. `ledger -- find routes/`

### Type marks — where they stand

`.agents/skills/maar-visual-language/SKILL.md` names seven. **All seven are built.**

| # | mark | state |
|---|---|---|
| 1 | cut word | 46 h1s |
| 2 | highlighter | 11 h1s — **level, 0°, and it stays that way** |
| 3 | struck word | **1**, the 404, and one is the honest number |
| 4 | stamp | 67 card covers |
| 5 | opposed chips | fill vs outline, leaning apart at −1.5° / +1° |
| 6 | tilted actions | primary −0.6°, collect −0.8°, secondary +0.5°, text square |
| 7 | hatch plate | 79 plates + 17 facades |

The one thing not to "fix": **the highlight never rotates and everything else
does.** A highlight is a pen stroke and a hand holds the pen level; a stamp, a
chip and a button are objects someone placed. `.mark--highlight` counter-rotates
by whatever its block sets, so a run of them down a tilted heading steps rather
than skewing.

Two of those placements are not where `VISUAL-LANGUAGE.md` asks for them, and
the doc is wrong rather than the code: it puts the **stamp** on the card
suit/number line and implies the **strike** can be applied freely. The
suit/number line is a *label* line, where the rules-of-use table allows no
marks — the same rule that moved the glyph runs into the `<h1>` — so the stamp
went to the card cover. And §02 of the spec opens with *"marks … never indicate
state or meaning"*, so nothing chooses a word to strike: it goes only where the
copy already says the thing.

**Do not start MW-10/MW-12.** They touch DNS, live sites and physical cards.

## How to find things

**Do not read the ledger.** It is 164 entries and grows. Query it:

```
npm run ledger -- find <term>      why is this like this
npm run ledger -- status           what is blocked
```

Reasoning lives in comments beside the code, not in the ledger. If a file looks
odd, open it — the explanation is there.

| Question | File |
|---|---|
| How do I publish a page? | `.agents/skills/maar-content-authoring/SKILL.md` |
| What is a type mark? | `.agents/skills/maar-visual-language/SKILL.md` |
| Which design reference wins? | `.agents/skills/maar-design-authority/SKILL.md` |
| What are the rules? | `.agents/AGENTS.md` |
| Why two collections? | `.agents/decisions/0001-one-pages-collection.md` |

## Repo shape

The two stylesheets that are easiest to get wrong, because one name used to
cover both:

```
src/styles/prose.css      the rendered body of EVERY page — migrated and
                          authored alike. PERMANENT. Keyed to elements.
                          verify:build fails if a body contains an element it
                          never decided about, so it cannot silently lose one.
src/styles/legacy.css     DISPOSABLE. Only rules keyed to the dead Jekyll
                          theme's class names. When migrate-pages.mjs stops
                          emitting them, delete the file and its import.
```

The wrapper class is `.prose`. It was `.legacy`, which was a lie — that div
wraps every body on the site, so a name meaning "temporary" was sitting on the
one thing that is permanent. That mis-naming is what let `h1` go unstyled.

```
src/content/migrated/**   95 records. GENERATED — wiped by rmSync every run.
                          Fix scripts/migrate-pages.mjs, never the .md.
src/content/authored/**   yours. No script writes here. Page records only —
                          the collection globs it, so a stray README.md fails.
src/content/cards/        35 NFC card records
src/lib/                  mark.mjs · translations.mjs · feed.mjs — pure, tested
scripts/lib/html-text.mjs plainText() defines textSha256 in the frozen manifest
routes/                   CONTRACTS. Never edit. Regenerating IS editing.
media/                    tracked assets → .public/ at build (gitignored)
```

`outputPath` is the load-bearing field: it is the URL. The filename is
navigational only.

## Invariants — work that can only pass by breaking one of these does not pass

- **35 NFC codes, 70 URLs**, never redirected, byte-for-byte stable.
- **Never edit `routes/manifest.production.json` or `routes/policy.json`.**
  Re-locking is a deliberate human command in its own commit.
- **Preserve URLs exactly.** No `.html` stripping, no slug normalising.
- **Self-host every font. No analytics, no cookie banner. No third-party request
  on page load.**
- **No Tailwind, no CSS-in-JS, no CMS, no backend.** React only in the Helix island.
- **Application JavaScript on two things only: the Helix island and `ui/carousel`.**
  The carousel exception is the owner's, after two no-script attempts failed — the
  engine is Embla's plain-JS core (no React, no Tailwind), bundled by Vite, loaded on
  the 5 pages that have a carousel. `ledger -- find carousel-embla`. A third is a
  decision, not a precedent.
- **Legacy checkouts one directory up are READ-ONLY.** Never touch DNS or the live sites.
- Per unit: do the work, run the narrowest check, append **one** ledger line, commit.
  Stage your own paths — never `git add -A` at the repo root.
- **Never declare work done from judgement. Run the command; its exit code decides.**

## The failure mode this repo actually has

Twice now the bug has been the same shape: **a correspondence maintained between
two files by hand, with nothing asserting the two agree.**

- `prose.css` listed h2–h6 and skipped `h1`. 61 titles shipped with no space.
- `mark.mjs` interpolates `mark--tilt-${n}`; `mark.css` defines 1–4 one at a
  time. They agreed by luck, and the tilt set is an open decision.

Both are now checked by `verify:build`, which reads what the build RENDERS and
fails if the stylesheet does not cover it. **Before adding a third list of this
shape, add its check in the same commit.** An audit for further instances found
no others: the only unrendered CSS is the four button variants and the type
utilities, which are specified ahead of the page families that will use them.

## Traps

- **After any change under `src/content/`**, the next build emits
  `[glob-loader] Duplicate id` and `verify:build` fails on warnings > 0. Stale cache:
  `find .astro -mindepth 1 -delete`, then rebuild.
  **Deleting the cache first is not enough** — the very next `npm run verify` still
  fails, because the run rebuilds the cache as it goes. Editing one authored `.md`
  cost a spurious `70 passed, 3 failed`. Run `npm run verify` a second time and it
  is green; do not go hunting for what you broke until you have.
- **Ledger prose is evaluated by the shell.** No backticks, `$`, or unescaped quotes
  in `ledger -- append`. Entries are capped at 500 chars — that is deliberate.
- **An Astro expression between `</head>` and `<body>`** makes Astro drop `<body>`
  entirely, and every check reading body text sees an empty document.
- **Card pages forward to Orbiter after 300 ms.** Use `/STW3344` or `/DWE1406` —
  neither forwards.
- **`npm run dev` now serves the same URLs the host does.** `/`, `/collect` and
  `/tree` used to 404 in dev and 200 in preview — never intermittently, though it
  looked that way. A dev-only Vite plugin in `astro.config.mjs` resolves the
  directory-index form the way a static host does. Still kill a stale
  `astro preview` first: it serves a stale `dist` and does not hot-reload.
- **Quote the date.** `date: 2026-08-01` unquoted is a YAML date object; the schema
  wants a string.
- **Design references live one directory UP**, in `../planning/design-references/`.
- **The design spec is actively edited.** Re-read it live via DesignSync
  (project `9c177a8a-4d82-4322-963b-4ee7018f3982`). Never cache its values here.

## Blocked — needs a human

`ledger -- status` lists 24, but the ledger is append-only so it still shows five
that later work closed: `helix-diagram.html`, `shell/designsync-unavailable`,
`design/page-bodies-unstyled`, `pages/missing-alt`, and `shell/lang-two-pages-unset`
(half — `/esp-feedback` is fixed).

Genuinely open: Dropbox card art · 34+9 lost cover thumbnails · Artizen URL · 4 route groups ·
`/resume` noindex · embeds click out not in · 5 assets over 2 MB · Tree hub image ·
ip-orchestra avatar · 2 interpolated display line heights · the mark tilt set.

**MW-11's own human gates:** 35 card pages reviewed + 3 physical cards scanned ·
4 real form submissions · ~175 embeds confirmed loading · a11y judgement calls ·
Lighthouse (no baseline was captured).

## Housekeeping

A stray `package.json`, `package-lock.json` and `node_modules/` sit in the **parent**
directory from a shell cwd reset during an `npm install`. The repo was never affected;
deleting there is blocked for an agent.
