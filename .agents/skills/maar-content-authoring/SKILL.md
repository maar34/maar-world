---
last-verified: 2026-08-01
verified-against: scripts/verify-translations.mjs (LEGACY_ES, the /es/ prefix rule)
status: active
---

# Writing a page

There are two page sources, and the difference between them is the whole point.

| Directory | Written by | Wiped by a script? |
|---|---|---|
| `src/content/migrated/**` | originally the migration, now **you** | **No.** The migration is gone — see below. |
| `src/content/authored/**` | you | **Never.** No script writes or deletes here. |

`migrated/` is a historical name now, not a live pipeline. Both directories are
hand-maintained and equally safe to edit.

Both are globbed into the one `pages` collection by `src/content.config.ts`, so a
page you write is the same kind of record as a migrated one — same schema, same
route, same `outputPath` → URL rule. `src/pages/[...page].astro` cannot tell them
apart, which is deliberate.

> Nothing may live directly in `src/content/authored/` except `.md`/`.mdx` page
> records and the `.gitkeep`. The collection globs this directory, so a stray
> `README.md` here would be parsed as a page and fail schema validation. That is
> why this file lives in `docs/`.

## Adding a page

Create a `.md` file anywhere under `src/content/authored/`. The path on disk is
for your convenience; the URL comes from `outputPath` and from nothing else.

```markdown
---
outputPath: "lab/en/my-new-post"   # the URL — no leading slash, no .html
title: "My new post"
area: "maar"                        # maar | collect | tree
kind: "lab"                         # lab | genesis | doc | index | page
surface: "dark"
lang: "en"                          # en | es
indexGroup: "lab"                   # put it in the /lab index
indexLabel: "My new post"           # the title the index row shows
date: "2026-08-01"
---

# My new post

Body goes here.
```

Then:

```
npm run build
npm run verify
```

**Quote the date.** `date: 2026-08-01` unquoted is parsed by YAML as a
date object, and the schema wants a string — the build fails with
`InvalidContentEntryDataError` naming the file. `date: "2026-08-01"` is correct.

That is the whole procedure. `verify:routes` reads `outputPath` straight out of
this directory, so **a page is authorised by existing** — there is no second list
to update, and deleting the file de-authorises it again.

## Writing a Spanish page

A Spanish page is published at **`/es/<path>`** and filed at
**`src/content/authored/es/<path>`**, where `<path>` is the `outputPath` of the
English page it translates. The URL and the path on disk agree, so either one
tells you where the other half is without opening anything.

```markdown
---
outputPath: "es/lab/my-new-post"     # "es/" + the English page's outputPath
title: "Mi nueva entrada"
area: "maar"
kind: "lab"
lang: "es"
translationOf: "lab/en/my-new-post"  # the English page's outputPath
---
```

`translationOf` goes on the Spanish side only and must name a page that exists —
a value naming nothing fails the build. `verify:translations` asserts both halves
of the rule: *every Spanish record is at the mirror or a named exception*, and
*a new Spanish page is published under /es/*.

### The eleven pages that do not follow it

Ten Lab pages are filed `migrated/lab/es/<slug>` and publish `/lab/es/<slug>`;
`/esp-feedback` carries no language marker at all and is a retired redirect stub
with no Spanish/English pair. **Leave all eleven where they are.** Their URLs are
in the frozen route manifest, so moving one is a contract change and not a
tidy-up — `/lab/es/dadada` cannot become `/es/lab/dadada`.

They are named individually in `LEGACY_ES` in `scripts/verify-translations.mjs`,
and that list is **closed: it may shrink, never grow.** If the check fails because
a new page is off-prefix, move the page. Adding a line to the list is the bypass
the list exists to make visible.

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

## Fixing a migrated page

Edit it. That is the whole instruction now.

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
