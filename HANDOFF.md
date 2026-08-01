# Handoff

**State:** `npm run verify` = **90 passed, 0 failed, 1 skipped**. The one skip is
`verify:cards`' host-canary assertion, which needs MW-10 upstream.

**Last shipped:** MW-13, MW-14 and MW-16, then MW-11's i18n structure work, then
**MW-19 steps 1 and 3 plus the first of step 2** — the `arch/collect-structure-once`
and `arch/ip-orchestra-structure-once` lines at the end of the ledger.

## MW-19 — TWO PAIRS DONE OF SIXTEEN. READ ALL OF THIS BEFORE TOUCHING IT.

**The owner is out of patience with this issue, and the reason is fair.** Their
words, 2026-08-01, after a session spent on the wrong page:

> *"There's no shortcut here. We need to do the things right. Don't try to skip
> the work that you need to do. We built this site from the beginning, from the
> root, to make it Spanish and English. And it's the fourth time that I ask
> this."*

So: **do not ask which pages matter. They all matter.** Only `/radio` is
deprecated. Everything else on the list below is live, in use, and expected to
work in both languages. Convert them properly, one at a time, and do not
propose a reduced scope.

### DO THESE FIRST, IN THIS ORDER — the owner named them explicitly

1. **`landings`** — 47 duplicated elements. Central navigation.
2. **`bookings`** — 9. Central navigation.

They are the two most important pages on the site and were expected done
already. Start here, not at the top of the element-count ranking. **Element
count measures how broken a page is, not how much it matters** — sorting by it
is what sent the last session to `/radio`, which turned out to be dead. That
mistake cost an hour and is the direct cause of the quote above.

Then the rest, all of them, none optional: `orbiters` (49), `about` (7),
`calendar` (5), `music` (4), `collect/docs/tutorials` (9),
`collect/docs/ent-cards` (7), `collect/docs/releases/skysounds` (4),
`collect/cards` (3), `collect/docs/ent-cards/nfc` (3), `collect/docs/mw` (3),
`collect/docs/orbiters/development` (3), `collect/documentation` (3),
`lab/es/ip-orchestra-design` (19), `ip-2` (18), `ip-3` (15),
`orbits-and-bodies` (15), `ip-1` (13), `dadada` (11),
`helix-eac-montevideo-2025` (2), and the one-element tail.

`STRUCTURED_ES` in `scripts/verify-translations.mjs` is the live work list —
**32 Spanish records** — and it is **closed: it may shrink, never grow.**
Converting a pair deletes its line, and the check fails if a listed record no
longer carries markup, so the deletion lands in the same diff.

### `/radio` IS DEPRECATED AND MUST 404 — and it is BLOCKED

Owner, 2026-08-01: *"the radio page is deprecated… for me it's just remove the
page. 404."* They were asked whether to relock or leave a redirect stub and
answered that they do not know what those are and do not want to choose. **Do
not ask them again. The answer is: the page 404s.**

It is blocked on machinery, not on a decision:

- `src/content/pages/en/radio.md` is `origin: "migrated"` and `/radio` +
  `/radio.html` are `policy: "preserve"` in `routes/policy.json`, under the
  contract lock. Deleting the record fails **verify:routes** (2 preserved routes
  missing), **verify:content** (it has a production baseline), and
  **verify:links** (3 external links vanish: eepurl.com, maarworld.gumroad.com,
  s1.ssl-stream.com).
- `src/content/pages/es/radio.md` is `origin: "authored"` and deletes cleanly.

Making those pass needs `npm run contract:relock -- --accept-removals`, plus
recording the link removals through `npm run links:review-removals` into
`routes/external-link-removals.json`, plus dropping `/radio` from
`verify/content-expectations.json`.

**AGENTS.md forbids re-locking as a way to turn a check green** — "if a re-lock
is what makes a check pass, that is not a fix". The owner has authorised the
OUTCOME (the page 404s) but a re-lock is a contract change and the invariant
says a human must take it deliberately. Confirm the relock specifically, in
those words, then do all four steps in one commit. `ledger -- find
radio-deprecated`.

### TWO WORKED EXAMPLES, CONVERTED DIFFERENTLY ON PURPOSE

Which shape a page takes is the first decision and it follows from what the page
is:

| | |
|---|---|
| **a landing** — `collect/index` | a page family. `families/Collect.astro` draws the whole page from record fields; the body is empty. |
| **an article** — `lab/*/ip-orchestra` | `.mdx`. Prose stays markdown and a block calls a component where it goes. A family cannot express an article: its prose and blocks interleave, and fixed slots would move every carousel to the end of the piece. |

`landings` and `bookings` are landings, so they are probably family work — but
**read them before deciding**, because the shape follows the page.

`@astrojs/mdx` (v4 — v5 needs Astro 6) was added on the owner's approval of
2026-08-01. It ships no JavaScript; the components are `.astro`. `.md` is still
the default — convert a body when you are lifting its structure out, not before.

Read `families/Collect.astro`, `src/content/pages/en/lab/ip-orchestra.mdx` and
`src/config/articles.ts` before converting anything. The three places a string
can live:

| | |
|---|---|
| the page's own copy | a field on the record, or prose in an `.mdx` body |
| what a FAMILY or component says on any page | `site.ts` / the component, keyed by language, both halves adjacent |
| a URL or an image path | neither — no language, so named once in `site.ts` or `config/articles.ts` |

Components that already exist, so do not write the markup again:
`media/Carousel`, `media/EmbedFacade`, `media/PlayEmbed`, `media/EmbedGroup`,
`ui/ContactForm`, `ui/LogoGrid`, `ui/SubscribeStub`, `patterns/Mark`.

### Step 3 is already in, as a ratchet

*A Spanish record must not carry structural markup in its body.* English is the
source of truth for structure (owner, 2026-08-01), so the rule names one side as
correct instead of comparing two editable things. It cannot be absolute until
the list is empty; `STRUCTURED_ES` holds the line meanwhile, and a NEW Spanish
page is bound by it fully today.

### TRAPS — every one of these was silent, and every one shipped green

- **`hasCarousel` / `hasMediaEmbed` in `[...page].astro` read the record BODY**
  to decide which pages ship JavaScript. Markup moved into a family or a
  component stops matching, so the page renders a carousel and ships nothing to
  drive it. This happened TWICE. `verify:build` now asserts the property — a
  built page whose HTML holds a carousel, or a facade the gate opens, must
  reference the script — so it cannot happen a third time silently.
- **Only facades whose provider the gate KNOWS should load the gate.** Testing
  for the component alone put 2.6kB of unused JavaScript on a click-out page.
- **`data-embed-provider` is a KEY; the provider name a reader sees is COPY.**
  They are the same word for youtube/vimeo/soundcloud and different elsewhere.
- **A CSS background path is invisible to every check.** `/radio` had
  `url("img/…")` with no leading slash in both halves: fine at a root-level URL,
  404 at `/es/…`. `verify:links` reads `href` and `src`, not `style`. **If a
  page you are converting has a background image, resolve it against the SPANISH
  URL.**
- **A record declaring `family: "collect"` without the `collect` field renders
  an EMPTY page.** The schema refuses it now.
- **Check chrome for language.** `/es/collect` shipped two English cards and an
  English contact form under Spanish body copy, and had no visual header at all
  because `SECTION_COLLAGE` is keyed by `outputPath`.

### Still outstanding, and shared by every carousel/facade page

`ui/CarouselScript` announces "slide 1 of 5" and labels its arrows "previous
slide" / "next slide" in English on Spanish pages; `ui/EmbedConsentScript`
prints "plays from youtube". That chrome belongs to the components, so fix it
once, for every page, rather than per conversion.

### Where the work is

Branch `wt/1-mw-19-separate-structure-from-copy` in slot `wt-1`, three commits,
**not merged to trunk** and awaiting the owner's go-ahead. `npm run verify` =
90 passed, 0 failed, 1 skipped. selftest 139/139.

**`src/content/` IS ORGANISED BY LANGUAGE NOW. `migrated/` AND `authored/` ARE GONE.**

```
src/content/pages/en/**   85 English      src/content/pages/es/**   72 Spanish
```

One rule, asserted over all 157 records with no exceptions: **a record sits at
`pages/<lang>/<its outputPath>`**, language segment taken out of the middle of
the path. A page and its translation sit at the same path under the two language
roots. `verify:translations` fails if a record is anywhere else.

Provenance moved into a required **`origin: migrated | authored`** field, because
the folder was carrying a security rule — `verify-routes.mjs` read
`authored/**` by directory to decide which URLs were allowed to exist. It reads
the field now. **An `authored` record authorises its own URL; a `migrated` one
must appear in the frozen policy.** Never set `origin: "authored"` to make
`verify:routes` pass.

**No URL moved and none may.** All 426 built files were byte-identical across the
reorganisation. `outputPath` is authoritative; nothing in `src/` reads a file's
path. `LEGACY_ES` in `scripts/verify-translations.mjs` is now purely **eleven
frozen URLs** — the ten `/lab/es/<slug>` pages and `/esp-feedback`, which has no
other-language half and must not be given one. Their *files* are ordinary; only
their URLs are frozen. **That list is closed: it may shrink, never grow** —
adding a line to turn a check green is the bypass it exists to make visible.

Authors: `.agents/skills/maar-content-authoring/SKILL.md`.
Reasoning: `.agents/decisions/0004-content-tree-by-language.md`.

**THERE IS ONE SURFACE NOW.** `layouts/shell-paper`, the `[data-surface='paper']`
token block, the `surface` frontmatter field and the `paper` entry in
`verify-a11y`'s `SURFACES` are all deleted — the docs were the only pages using
them, and the owner removed the second surface once they moved to dark. Do not
reintroduce a light theme without asking. **`@media print` in tokens.css keeps
the cream values** and is now the only place they live; printing is a different
question from theming. `ledger -- find shell-paper-removed`.

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
