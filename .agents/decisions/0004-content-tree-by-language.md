# 0004 — The content tree is organised by language, not by provenance

**Status:** accepted
**Date:** 2026-08-01
**Issue:** MW-11

## Context

`src/content/` was split `migrated/` and `authored/`. That sorts pages by **how
they arrived** — the 2023 migration of the three legacy sites, versus written by
hand afterwards. It is history, and history is the one thing a person cannot
infer by looking at a page.

Language then cut across it at random. 72 Spanish records were filed three
different ways, in two different trees, by three different conventions:

| | |
|---|---|
| `authored/es/about.md` → `/es/about` | prefix — 61 pages |
| `migrated/lab/es/dadada.md` → `/lab/es/dadada` | infix — 10 pages |
| `migrated/esp-feedback.md` → `/esp-feedback` | no marker at all — 1 page |

Which one applied to a given page depended on the year it arrived. `migrated/`
held 84 English records and 11 Spanish ones, so the top-level folder told you
where a page came from and never what language it was in. `npm run i18n:map`
exists because a tool had to be built to answer a question the folder layout
should have answered.

The owner asked for a clear translation structure repeatedly, across many
sessions. Each time the answer was that reorganising was possible but should be
its own ticket, and each time it was deferred. The deferral was the problem: the
structure is the thing being complained about, and a ticket is not a structure.

Two facts made the split indefensible rather than merely awkward:

1. **Its original justification is gone.** The split earned its keep when
   `scripts/migrate-pages.mjs` owned `migrated/` and wiped it on every run — you
   genuinely could not hand-edit there. That script was deleted on 2026-07-31
   because its "regeneration" had become a revert. Both directories are
   hand-maintained now. `migrated/` named a pipeline that no longer exists.
2. **Nothing in `src/` reads a file's path.** The URL comes from `outputPath`
   and from nothing else, which is how 95 records were re-nested once already
   without moving a URL.

## Decision

Organise `src/content/pages/` by language first, then by area:

```
src/content/pages/
  en/about.md          es/about.md
  en/lab/dadada.md     es/lab/dadada.md
  en/collect/…         es/collect/…
```

Provenance moves out of the directory and into a required `origin:
migrated | authored` field on every page record.

**This was done in two commits, and the order is not optional.** The folder was
carrying a security rule: `verify-routes.mjs` read `src/content/authored/**` by
directory to decide which URLs were *allowed to exist* — an authored page
authorises itself by existing, a migrated one must appear in the frozen policy.
Moving the files first would have silently changed which URLs were authorised.

1. **Route authorisation moved off the directory.** `origin` added to the schema
   as required, written into all 157 records, and `authoredRoutes()` changed to
   read the field. Suite green, no file moved.
2. **The files moved.** Nothing but paths changed.

## Consequences

- One inferable rule: language, then area, then page. A page and its translation
  sit side by side.
- **No URL moved.** `outputPath` stayed authoritative throughout, the route
  manifest and contract lock were never touched, and `verify:contract` was green
  at every step. `/lab/es/dadada` is still `/lab/es/dadada` — those eleven
  legacy URLs are frozen and their filing is now the only thing that changed.
- `origin` is required rather than defaulted, for the reason `lang` is: a
  defaulted value that decides something load-bearing is invisible in a diff.
  A record without it fails the build.
- Authorisation is now stated per record rather than implied by a path. Flipping
  a record from `migrated` to `authored` is a one-line diff someone reads,
  instead of a `git mv` nobody looks at twice. Both directions are asserted in
  `selftest.mjs` — an authored record authorises its URL from any directory, and
  a migrated one does not authorise it from the same place.
- The `migrated`/`authored` distinction survives where it does real work
  (authorisation, and knowing which URLs are frozen) and disappears where it did
  not (filing).

## What this does not do

It does not touch the eleven legacy Spanish URLs, which stay exactly where they
are for the reason above. It does not rename slugs. The prefix rule for new
Spanish pages, and the closed list of the eleven exceptions, were the previous
commit's work and are unchanged by this one.
