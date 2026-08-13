# 0006 — Orbiters version two links its own source

**Status:** accepted
**Date:** 2026-08-13
**Issue:** MW — /orbiters version two

## Context

`/orbiters` and `/es/orbiters` now show the Orbiters twice: version one on
`play.maar.world`, and version two on `orbiter.plantasia.space`. Version two's
opening claim, in the owner's words, is that it was written from scratch for
Plantasia Space and **is open source**.

A page that says "open source" and links nothing is asking to be taken on trust
about the one thing that can be checked in a click. So the claim ships with the
repository beside it: `https://github.com/plantasia-space/orbiters`, given by the
owner on 2026-08-13, rendered as a secondary action next to the version-two
banner.

## The check this had to pass

`verify:links` fails on any external URL that is neither in the frozen baseline
nor on `allowedNew`:

```
no unreviewed external links introduced
```

That is the point of the check — a new outbound link on a site with no analytics
and no cookie banner is a decision, not a detail. `allowedNew` is where a link
introduced after the 2026-07-28 freeze gets reviewed **once**, in the open,
instead of arriving unremarked. Its note says entries carry their reason in a
decision record. This is that record.

## Decision

`https://github.com/plantasia-space/orbiters` is added to `allowedNew` in
`verify/external-links-baseline.json`, and its address is written once, in
`ORBITERS.v2.repoUrl` in `src/config/articles.ts`, so both language halves link
the same repository and cannot drift.

## What it does not change

- **Nothing is fetched on load.** It is a plain anchor. "No third-party request
  fires on page load" still passes, and the promise on `/privacy` is untouched.
- **`github.com` is not a new host.** The baseline already carries eight
  `github.com` URLs and sixteen on `raw.githubusercontent.com`, inherited from
  the Jekyll theme the old site ran on.
- **The baseline is not re-frozen.** Only `allowedNew` grows, which is the list
  built for exactly this and the reason re-freezing was not necessary. Re-freezing
  to make a check pass is the bypass `AGENTS.md` names.

## Consequences

If the repository is ever made private or renamed, this link 404s in public on a
page that says the project is open source — a worse failure than having no link.
`npm run check:links` is what would catch it; it is not part of `npm run verify`
and has to be run deliberately.
