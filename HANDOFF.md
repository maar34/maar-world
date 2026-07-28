# Handoff

Regenerated at every stop. A fresh agent should need nothing but this file,
`MIGRATION-LEDGER.md`, `docs/agent/OPERATING-RULES.md` and the Linear issue.

**Last updated:** 2026-07-28T23:05Z
**Last issue worked:** MW-6 (build + verification complete; human sign-off outstanding)
**Next action:** MW-7 — migrate Maar pages, 6 genesis codes and 20 Lab articles (en/es).

---

## Where the programme is

| Issue | Title | State |
|---|---|---|
| MW-3 | Resumable execution harness | **done** |
| MW-4 | Freeze the production route manifest | **done** — 306 routes frozen |
| MW-5 | Repository, Astro scaffold, content schemas | **done** |
| MW-6 | 35 NFC card records, 70 immutable URLs | **build done, in review** — human must review 35 pages + scan 3 cards |
| MW-7 | Maar pages, genesis codes, Lab articles | not started ← **next** |
| MW-8 | Collect → `/collect/*`, Tree → `/tree` | not started |
| MW-9 | Embed facades, self-hosted fonts, Helix island | not started |
| MW-11 | Full verification + a11y/responsive sign-off | not started |
| MW-10, MW-12 | Cutover, stabilise | **human-gated — do not start** |

## Read this before trusting a green run

`npm run verify` is **expected to exit non-zero until MW-8 finishes.** That is the
harness working, not a defect: `verify:routes` compares the build against 264 distinct
preserved paths and content migration has not happened yet. Use the *missing count* as the
progress metric — it should fall monotonically:

| Checkpoint | preserved paths missing |
|---|---|
| after MW-5 | 262 of 264 |
| after MW-6 | **192 of 264** — dropped by exactly the 70 card forms |
| after MW-8 | must be 0 |

`verify:build`, `verify:links` and the non-build half of `verify:cards` pass **now** and
must stay passing. A regression there is real.

## In flight

Nothing. MW-6 finished cleanly; only its human sign-off remains.

## Blocked — needs a human

1. **Card art is hotlinked from Dropbox** (`MW-6`, ledger `cards/dropbox-third-party`).
   37 `<img src>` references to `www.dropbox.com`. MW-6 says keep those URLs and that
   migrating them is out of scope; the MW-1 quality gate says no third-party request may fire
   on page load. **Both cannot hold.** `verify:links` fails on this deliberately — the check
   was not weakened to make the build pass. Either self-host the card art (needs approval) or
   record an explicit exception for card art as page content. Two of these Dropbox URLs are
   already dead in production.
2. **No Artizen destination URL** (`MW-6`, ledger `cards/artizen-destination`).
   `COMMERCE.destinationUrl` is `null`, so card pages render no destination link at all.
   MW-1 and MW-6 forbid introducing Bandcamp, so nothing is substituted. One line in
   `src/config/site.ts` when the URL exists.
3. **The 34 `%20` Collect card URLs** (`MW-4`, ledger `collect/%20-card-urls`). Are they
   printed on any card, sleeve or packaging? Every one currently defaults to `preserve`,
   because preserving keeps both options open and redirecting does not. 66 routes carry
   this open decision in `routes/policy.json`.

## Decisions taken that a human should confirm

- **Repository name `maar-world`**, at `/Users/Qubit/Documents/Github/maar-world/maar-world/`.
  Taken from ARCHITECTURE-REVIEW §6/§7 rather than invented, because the brief left it blank
  and stalling an unattended run was worse. Renaming is a `git mv` plus one line in
  `package.json`.
- **No git remote, nothing pushed.** Creating a GitHub repository is outward-facing and
  human-gated. All work is local commits on `main`.
- **5 routes dropped**: `/z/README-zh(.html)` on maar and tree (theme ballast, per
  ARCHITECTURE-REVIEW §10 item 12) and the already-404 collect
  `/docs/ent-worlds/glossary.html`.
- **Tree merges to `/tree/*`, not a single `/tree` page.** Tree has two real pages, so
  collapsing everything onto one path would lose `/max-network-berlin`.

## Two things production told us that the decision records did not

1. **The dual-form property is site-wide.** Every page is live at both `/X` and `/X.html`
   via the host's `.html` fallback — not just the 35 card codes. The crawl probes the twin of
   every HTML route; that found 97 extra live URLs. Preserving both spellings is automatic
   under `build.format: 'file'`.
2. **Addendum §5.1 is stale against production.** It reports all 68 card pages pointing at
   dead storefronts. The live Collect card pages already link to
   `maar-world.bandcamp.com/merch`; `physical.maar.world` and `digital.maar.world` appear
   nowhere in the crawl. Trust the manifest, not the addendum, on commerce links.

## State of the repo

```
routes/manifest.production.json   306 routes, frozen — CONTRACT, do not edit
routes/policy.json                299 preserve / 5 drop / 2 redirect — CONTRACT
routes/nfc-cards.json             the 35 codes (34 skysounds + STW3344)
routes/seeds.json                 URLs a crawler cannot discover
verify/external-links-*.json      562 external URLs (incl. on-load resources), 11 already dead
src/styles/tokens.css             design tokens, framework-neutral
src/content/schemas.mjs           zod schemas (testable without a build)
src/config/site.ts                COMMERCE.destinationUrl — the ONLY destination URL (null)
```

Route-shape proofs live at `src/pages/ZZZ0000.astro` and
`src/pages/route-proof/[...slug].astro`. They prove `CODE.html` emits at the output root and
that a filename with a space *and a trailing space* survives the build. **Remove both at
MW-11**, once the 35 real cards carry the guarantee themselves.

## Commands

```
npm run build            assemble media + astro build
npm run verify           everything; exit code decides
npm run verify:cards     the physical-card contract, cheapest useful check
npm run verify:selftest  proves the suite still fails on broken builds (10/10)
npm run verify:schemas   proves the schemas still reject bad records (12/12)
npm run freeze:routes    re-crawl production (only if the contract must be re-frozen)
npm run ledger -- status summary, including every BLOCKED item
```

## Reminders that are easy to get wrong

- The design system project is **actively edited**. Re-read it live before implementing any
  component; never cache its values into this repo. Token values in `src/styles/tokens.css`
  were transcribed from spec version **1.1** — re-check them against the live spec before
  building new components.
- Legacy checkouts one directory up are **read-only**.
- `verify:cards` guards a case-insensitive-filesystem trap: on macOS `existsSync` confirms
  `/ebt5599.html` for a file named `EBT5599.html`, so casing is compared against an exact
  directory listing.
- Cards must carry `noindex`, and the schema enforces `noindex: true` as a literal.
- Commerce URLs are banned from content records by the schema. They come from
  `COMMERCE.destinationUrl`, which is deliberately `null` — MW-1 and MW-6 forbid introducing
  Bandcamp or any storefront, so card pages render no destination at all until Artizen exists.
