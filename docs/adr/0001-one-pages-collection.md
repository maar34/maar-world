# 0001 — One `pages` collection, and navigation as declared config

**Status:** accepted
**Date:** 2026-07-29
**Issue:** MW-11

## Context

The repo declared five content collections: `cards`, `pages`, `genesis`, `lab`
and `docs`. Three of them — `genesis`, `lab`, `docs` — held zero files, had
zod schemas, were validated by `verify:schemas`, and were read by nothing.
`getCollection` was called for exactly `cards` and `pages`.

They were the shape the repo was designed with *before* the migration ran. The
migration then went another way, for a reason it recorded in
`src/content/schemas.mjs`: one flat `pages` collection keyed by `outputPath` is
what lets 264 preserved production URLs collapse onto ~95 records, because the
host serves `/x` and `/x.html` from one file. What a page *is* — a Lab article,
a genesis code, a Collect doc — is carried by the `kind` discriminator.

Nothing recorded that the three were obsolete rather than unfinished. They cost
three `[glob-loader] No files found` warnings on every build, and to anyone
reading the repo for the first time they looked like work in progress.

Separately, the page schema carried `inNav: z.boolean().default(false)`. The
migration set it to `false` on all 95 records. Nothing read it. A comment in
`SiteHeader.astro` called it *"the eventual source"* for the navigation, which
was hardcoded in that component as a `SECTIONS` constant.

## Decision

**Remove `genesis`, `lab` and `docs`.** A Lab article is a `pages` record with
`kind: 'lab'`. `check-schemas.mjs` asserts that shape directly now.

**Remove `inNav`.** Navigation is declared configuration, and `SECTIONS` moved
from `src/components/ui/SiteHeader.astro` to `src/config/site.ts`, beside
`AREAS`, which the header already reads from there.

## Consequences

Navigation is not derived from the content. That is deliberate, and it is the
part most likely to be re-litigated, so: a content-derived nav still needs a
**label** and an **order** per entry, which is precisely the data `SECTIONS`
already holds. Deriving it would spread one reviewable list across 95 generated
files — files that `scripts/migrate-pages.mjs` wipes and rewrites on every run —
and gain nothing. If a page must appear in the navigation, it is one line in
`site.ts`.

Three build warnings are gone. `verify:schemas` went 12 → 12 cases: three
collection-specific cases were replaced by two that assert the same constraints
on `pages`, plus one new case covering `translationKey`.

If a genuine second collection is ever needed — one whose records are *not*
addressed by `outputPath`, so not a page — adding it back is a `defineCollection`
call and a schema. This ADR is not an argument against collections; it is a
record that these three were superseded, so a future reader does not restore
them believing they were forgotten.
