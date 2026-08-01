# Handoff

**State:** `npm run verify` = **94 passed, 0 failed, 1 skipped**. The one skip is
`verify:cards`' host-canary assertion, which needs MW-10 upstream.

**Last shipped:** MW-13, MW-14, MW-16, MW-11's i18n structure work, and **MW-19
through fourteen of its sixteen pairs** — sixteen commits, merged to `main`
2026-08-01. Nine pairs remain and none of them blocks a deploy.

## MW-19 — NINE PAIRS LEFT. READ THE LAST SECTION FIRST.

**Fourteen pairs converted. `/radio` deleted and 404ing. The suite is 94 checks.**

`STRUCTURED_ES` in `scripts/verify-translations.mjs` is down to **9**, and there
are now THREE ratchets, all closed, all shrink-only:

| list | holds | meaning |
|---|---|---|
| `STRUCTURED_ES` | 9 | Spanish records still carrying markup |
| `DIVERGENT_PAIRS` | 7 | pairs whose two halves still render different structure |
| `TRANSLATED_ARTWORK` | 2 | pairs whose pictures legitimately differ (poster with type on it) |

### THE OWNER'S VERDICT ON HOW THIS WAS BUILT — read this before deciding how to do the rest

2026-08-01, and it is correct:

> *"I can't believe we migrated all the trash of the old website… instead of
> doing the page correctly, doing the structure correctly, we keep doing
> everything in the most complex way possible. We need to make 20 pages or 30,
> I don't mind."*

The migration imported a dead Jekyll site wholesale — its markup, its dead
classes, its empty spacers, its single-child grid wrappers — and MW-19 is the
bill for that. **For several of the nine that remain, REWRITING the page is
cheaper and better than converting it.** That is the shortcut nobody has been
taking, and it is the legitimate one:

- `collect/docs/mw` — two raw `<table>`s. Write them as markdown tables.
- `collect/docs/ent-cards` — five nested divs around a picture and a list.
- `collect/docs/releases/skysounds` — a raw table plus two links.
- `collect/cards`, `collect/documentation` — one wrapper each.

Only these four need real component work:
`lab/*/ip-orchestra-design` (19), `lab/*/orbits-and-bodies` (15),
`lab/*/dadada` (11 — its Spanish half says "listen on soundcloud" in English,
fix it in the conversion), `lab/*/helix-eac-montevideo-2025` (2).

### WHAT EXISTS NOW, SO NOTHING GETS WRITTEN TWICE

`media/EmbedPlate` · `media/PdfEmbed` · `media/PlayFrame` (bare player + its
full-screen link) · `media/PlayEmbed` (player in a captioned band, has `level`)
· `media/Picture` · `media/Carousel` (has `autoplayMs`) · `media/EmbedFacade` ·
`media/EmbedGroup` · `patterns/Band` · `patterns/Mark` · `patterns/EditorialProfile`
· `ui/ContactForm` · `ui/LogoGrid` · `ui/SubscribeStub`.

Strings and addresses: `src/config/embeds.ts` (facade words by provider AND
language — add an entry when you convert a page that needs one; `soundcloud`
and `external` are still missing on purpose) and `src/config/articles.ts`
(every image path and query string, named once for both halves).

### FOUR TRAPS THIS SESSION HIT, ON TOP OF THE SIX BELOW

- **`*/` inside a block comment closes it.** Writing `lab/*/ip-1` in an
  `.astro` comment broke the build twice, with an error pointing at the next
  word rather than the comment.
- **`STRUCTURAL_TAGS` is case-INSENSITIVE**, so a component named `<Figure>`
  counts as a `<figure>` tag. `Section`, `Article`, `Table`, `Span` are the
  remaining names a component must not take.
- **An `<a>` inside `<object>`** makes Astro's parser reconstruct the anchor
  twice further down the document — two nameless links, caught only by
  `verify:a11y`. `media/PdfEmbed` injects that fallback as escaped HTML.
- **Clearing `.astro` while `npm run dev` is running kills the preview the
  owner is watching.** It 404s every page until restarted. Do not clear the
  cache mid-session without restarting dev afterwards.

### WHAT WAS WRONG BEYOND STRUCTURE, AND IS NOW FIXED

Worth knowing because none of it was visible to any check, and all of it was
what the owner actually saw:

- **Five Spanish pages had NO header at all** — `/es/landings`, `/es/bookings`,
  `/es/orbiters`, `/es/about`, `/es/calendar`. `SECTION_COLLAGE` is keyed by
  `outputPath` and a miss returned null silently.
- **The Spanish home drew one of three cards with no picture** —
  `ARTICLE_COVER_FALLBACKS` held only the English href.
- **The whole shell was English on every Spanish page.** `BaseLayout` set
  `chromeLang="en"` and a comment explained that the shell "is written in
  English on every page" — an honest label on a defect. `SECTIONS` and
  `HOME_ACTIONS` carry `labelEs` now, read through one `labelFor`.
- **Thirteen Spanish players said "Play full screen"** in English.

Three checks were added so none of it can come back: *a page and its
translation render the same structure* (body), *…show the same pictures* (whole
document — the header is chrome and that is exactly where the bugs were), and
*a Spanish page names its navigation in Spanish* (labels, not hrefs — the
existing href check passed throughout).

### /radio IS GONE

Deleted, `policy: drop` on both URLs, the three external links recorded as
reviewed removals, contract relocked (policy sha `5ad5bb98`, preserve 355→353).
Done with the owner's own hand on the relock, because AGENTS.md reserves it.

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

The two failures this file used to list are both closed; the suite is green end to
end. Two figures from them are still worth carrying forward as ceilings:

- **`verify:links`** — the on-load `www.dropbox.com` references (MW-6 card art).
  Now baselined and passing. **The count must never go up.**
- **`verify:content`** — passing. Where the build legitimately departs from
  production, the reason is a named entry in `EXCLUSIONS` in
  `scripts/author-content-expectations.mjs`, never an edit to the content.
  **Do not edit content to make this check pass.**

Everything is green: selftest · schemas · build · contract · routes ·
cards (+1 skip, needs MW-10) · a11y · content · links · translations · ledger.

⚠ **`npm run author:content-expectations` cannot be run from a worktree.** It
reads the read-only legacy `_site` checkouts at `ROOT/../maar.world-site` etc.,
which from `maar-world.worktrees/wt-N` resolve to nothing — it then silently
falls back to a weaker baseline and rewrites the whole file (measured: 2,424
deletions, every `legacy-site-exact` baseline lost). Run it from the primary
checkout, or hand-apply the one page an exclusion changes.

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
