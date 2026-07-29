# Writing a page

There are two page sources, and the difference between them is the whole point.

| Directory | Written by | Wiped by a script? |
|---|---|---|
| `src/content/migrated/**` | `scripts/migrate-pages.mjs` | **Yes — every run.** Never hand-edit. |
| `src/content/authored/**` | you | **Never.** No script writes or deletes here. |

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
date: 2026-08-01
---

# My new post

Body goes here.
```

Then:

```
npm run build
npm run verify
```

That is the whole procedure. `verify:routes` reads `outputPath` straight out of
this directory, so **a page is authorised by existing** — there is no second list
to update, and deleting the file de-authorises it again.

## What you do NOT have to do

- Add anything to `routes/manifest.production.json`. That file is a frozen record
  of what the three legacy sites served. A page you write now was never on them,
  and it is not supposed to appear there.
- Add anything to `routes/policy.json`.
- Run `npm run contract:relock`.
- Run `npm run migrate:pages`.
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

Do **not** edit `src/content/migrated/**` — the next `npm run migrate:pages` run
deletes the directory and rewrites it.

Fix `scripts/migrate-pages.mjs` instead and re-run it. If the fix is genuinely
one page's own content rather than a migration rule, the page can be moved out of
`migrated/` into `authored/`, at which point it is yours and the migration stops
producing it. Move the file, do not copy it: two records claiming one
`outputPath` fails the build.
