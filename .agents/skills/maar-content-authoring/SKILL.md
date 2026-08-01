---
last-verified: 2026-08-01
verified-against: src/content.config.ts, src/content/schemas.mjs, scripts/verify-translations.mjs, verify-routes.mjs
status: active
---

# Writing a page

Every page lives in `src/content/pages/`, filed **by language**:

```
src/content/pages/
  en/about.md          es/about.md
  en/lab/dadada.md     es/lab/dadada.md
  en/collect/…         es/collect/…
```

**One rule, and you can infer it: language, then area, then page.** A page and its
translation sit at the same path under the two language roots, so finding a
page's other half is looking at the same path.

**The file's path is not decoration — it is asserted.** A record must sit at
`pages/<lang>/<its outputPath>`, and `verify:translations` fails if it does not.
All 157 records, both languages, no exceptions.

> This replaced a `migrated/` and `authored/` split, which sorted pages by how
> they arrived rather than what they are. If you are looking for those folders,
> they are gone — see `.agents/decisions/0004-content-tree-by-language.md`.
> Provenance is now the `origin` field.

> Nothing may live in `src/content/pages/` except `.md`/`.mdx` page records. The
> collection globs it, so a stray `README.md` would be parsed as a page and fail
> schema validation.

## Adding a page

Create a `.md` file at `src/content/pages/<lang>/<path>.md`, where `<path>`
matches the `outputPath` you want.

```markdown
---
outputPath: "lab/en/my-new-post"   # the URL — no leading slash, no .html
title: "My new post"
area: "maar"                        # maar | collect | tree
kind: "lab"                         # lab | genesis | doc | index | page
surface: "dark"
lang: "en"                          # en | es
origin: "authored"                  # migrated | authored — see below
indexGroup: "lab"                   # put it in the /lab index
indexLabel: "My new post"           # the title the index row shows
date: "2026-08-01"
---

# My new post

Body goes here.
```

The file for that record goes at `src/content/pages/en/lab/my-new-post.md` — the
language segment comes out of the middle of the path, because the language is
already the top folder.

**`origin` is required, and for a new page it is always `"authored"`.**
It records where the page came from, and it is what authorises the URL:
an `authored` record authorises itself by existing, a `migrated` one must appear
in the frozen route policy. `"migrated"` means the page came from the 2023
migration of the three legacy sites — never use it for a page you are writing.

Then:

```
npm run build
npm run verify
```

**Quote the date.** `date: 2026-08-01` unquoted is parsed by YAML as a
date object, and the schema wants a string — the build fails with
`InvalidContentEntryDataError` naming the file. `date: "2026-08-01"` is correct.

That is the whole procedure. `verify:routes` reads `outputPath` off every record
declaring `origin: "authored"`, so **a page is authorised by existing** — there is
no second list to update, and deleting the file de-authorises it again.

## Writing a Spanish page

Put it beside its English half, at the same path under `es/`:

```
src/content/pages/en/lab/my-new-post.md      the English page
src/content/pages/es/lab/my-new-post.md      the Spanish one
```

```markdown
---
outputPath: "es/lab/my-new-post"     # "es/" + the English page's outputPath
title: "Mi nueva entrada"
area: "maar"
kind: "lab"
lang: "es"
origin: "authored"
translationOf: "lab/en/my-new-post"  # the English page's outputPath
---
```

`translationOf` goes on the Spanish side only and must name a page that exists —
a value naming nothing fails the build.

Two separate rules, both asserted, and it is worth knowing they are separate:

| | |
|---|---|
| **on disk** | `pages/es/<path>` — same as every record, no exceptions |
| **as a URL** | `outputPath` starts `es/` — **new pages only** |

### A translation is words, never markup

**Do not copy the English page's HTML into the Spanish record.** Structure lives
once, in the page family that renders it; the record carries the words.

`verify:translations` asserts it: **a Spanish record must not carry structural
markup in its body** — `div|section|figure|ul|ol|table|article|span|img|iframe|a`.
English is the source of truth for structure (owner, 2026-08-01), so the rule
names one side as correct rather than comparing two editable things. It does not
make Spanish second-class output: both halves render through the same component,
so they render identically. It decides where structure is *authored*.

Why the rule exists: translating a page used to mean copying the whole page and
translating the text inside it, so every component existed twice and had to be
kept in step by hand. It was not kept in step. `collect/index` drifted by two
elements with nobody editing it to diverge, and the Spanish page visibly rendered
differently — found by a person looking at two pages, because no check could see
it. MW-19.

`collect/index` is the converted example — read
`src/components/families/Collect.astro` and the `collect` field in
`src/content/schemas.mjs` before converting another page. Where each kind of
string belongs:

| | |
|---|---|
| the page's own copy | a field on the record — its pitch, its captions, its headings |
| what the FAMILY says on any page | `src/config/site.ts`, keyed by language, both halves adjacent (`COLLECT_LANDING`, `LAB_INTRO`) |
| a URL or an image path | neither — those have no language, so they are named once in `site.ts` |

**33 Spanish records still carry markup**, listed in `STRUCTURED_ES` in
`scripts/verify-translations.mjs`. That list is **closed: it may shrink, never
grow.** Converting a page deletes its line — and the check fails if a listed
record no longer carries markup, so the deletion happens in the same diff.
Adding a line is the bypass the list exists to make visible.

### Which shape a page takes

Two converted examples, and they are converted differently on purpose:

| | |
|---|---|
| **a landing** (`collect/index`) | a page family. `families/Collect.astro` draws the whole page from record fields. The body is empty. |
| **an article** (`lab/*/ip-orchestra`) | `.mdx`. Prose stays markdown; a block calls a component where it goes. A family cannot express an article, because its prose and its blocks interleave and fixed slots would move every carousel to the end. |

**`.md` is still the default.** Convert a body to `.mdx` when you are lifting its
structure out, not before — MDX needs JSX-valid markup and the migrated bodies
are not. `<br>` becomes `<br />`, and a bare `{` or `<` in prose is an expression.

MDX ships no JavaScript: the components are `.astro` and render at build time.

Components to reach for before writing markup: `media/Carousel`,
`media/EmbedFacade`, `media/PlayEmbed`, `media/EmbedGroup`, `ui/ContactForm`,
`ui/LogoGrid`, `ui/SubscribeStub`, `patterns/Mark` (an explicitly chosen mark;
`patterns/TypeMark` is the seed-derived one). An article's images go in
`src/config/articles.ts`, named once for both halves — a photograph is the same
photograph in Spanish.

**If a page renders a carousel or a gated facade, `verify:build` asserts it also
ships the script that drives it.** That check exists because moving markup into a
component twice produced dead carousels that no other check could see.

### The eleven frozen URLs

Ten Lab pages publish `/lab/es/<slug>` — language in the middle — and
`/esp-feedback` carries no language marker at all and is a retired redirect stub
with no Spanish/English pair. **Do not move those URLs.** They are in the frozen
route manifest, so `/lab/es/dadada` cannot become `/es/lab/dadada`; changing one
is a contract change, not a tidy-up.

Their *files* are not special — they sit at `pages/es/lab/dadada.md` like
everything else. Only their URLs are frozen.

The eleven are listed in `LEGACY_ES` in `scripts/verify-translations.mjs`, and
that list is **closed: it may shrink, never grow.** If the check fails because a
new page is off-prefix, fix the page's `outputPath`. Adding a line to the list is
the bypass the list exists to make visible.

## What you do NOT have to do

- Add anything to `routes/manifest.production.json`. That file is a frozen record
  of what the three legacy sites served. A page you write now was never on them,
  and it is not supposed to appear there.
- Add anything to `routes/policy.json`.
- Run `npm run contract:relock`.
- Touch the read-only legacy checkouts one directory up.

Until MW-11 all of the above *were* required to publish anything, because the
frozen manifest was doing two jobs at once: recording what production served, and
deciding which URLs were allowed to exist. The first is right forever; the second
was right only until cutover. `scripts/verify-routes.mjs` now separates them.

## Rules that still apply

- **Never reuse an `outputPath` a migrated page already claims.** Two records with
  the same `outputPath` are two routes with the same param, and the build fails.
  Check with `grep -rn 'outputPath: "your/path"' src/content/`.
- Content files are `.md` by default. Use `.mdx` only where a component is
  genuinely needed — the migrated bodies are full of raw HTML that MDX rejects.
- No third-party request may fire on page load. Embeds get a click-to-load facade;
  `play.maar.world` and `radio.maar.world` are same-site and may be plain iframes.
- `lang` matters. It sets `<html lang>`, and a Spanish page that does not declare
  `es` is read aloud with English phonemes.

## Fixing a page that came from the migration

Edit it. That is the whole instruction now — and it is no longer a different
kind of file, only a record whose `origin` says `"migrated"`.

**This reversed on 2026-07-31, and the old rule is the opposite of the new one.**
It used to read "do not edit `src/content/migrated/**` — fix
`scripts/migrate-pages.mjs` and re-run it", because the migration deleted and
rewrote that directory on every run. `scripts/migrate-pages.mjs` has been
DELETED and `npm run migrate:pages` no longer exists.

Why: the script had fallen behind the content it generated, so running it was no
longer a regeneration but a revert. In one afternoon it twice destroyed live work
— including all 34 `collect/cards/` records, which are the URLs printed on
physical NFC cards — and reverted hand-made page structure back to dead Jekyll
markup. A generator that reproduces an older tree than the one it overwrites is
not a source of truth; it is a rollback with a build step. The site is past
cutover and is now built on top of its content rather than out of it.

The legacy checkouts one directory up remain the historical record of what the
three sites served, and `routes/manifest.production.json` still freezes their
URLs. Neither is regenerated from anything.

The script itself is kept, out of the project, at `../_retired/migrate-pages.mjs`
with a README saying why. It is outside `maar-world/` deliberately: no npm
script, no CI job and no import can reach it from there. Git history is the other
copy (`git log --diff-filter=D -- scripts/migrate-pages.mjs`).

Do not simply re-run it. Reconcile it with the current content first — that
reconciliation is the work it was skipping, and is why running it destroys
things.
