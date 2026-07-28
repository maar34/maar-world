# Migration ledger

Append-only record of completed units of work for the Maar World rebuild (Linear epic MW-1).

**This file is a record, not a working file.** Never rewrite it. Never reorder it. Never
delete a line. Only append. `npm run ledger:check` fails if the committed version stops
being a prefix of the working copy.

The first action of any agent session is to read this file. The last action before stopping
is to append to it.

## Line format

```
<stamp>            <issue>  <status>  <unit>                                     <detail>
2026-07-29T02:14Z  MW-7     DONE      lab/en/ip-1.html                           routes:ok content:ok links:ok
2026-07-29T02:16Z  MW-7     BLOCKED   lab/es/dadada.html                         reason: source references missing image
```

Machine-parseable as `^(stamp)\s+(MW-\d+)\s+(DONE|BLOCKED|NOTE)\s+(unit)\s+(detail)$`.

| Field | Rule |
|---|---|
| `stamp` | UTC, minute precision, `YYYY-MM-DDTHH:MMZ` |
| `issue` | Linear issue key, `MW-<n>` |
| `status` | `DONE`, `BLOCKED` or `NOTE` — nothing else |
| `unit` | one token, no spaces: a route, file path, or named checkpoint |
| `detail` | free text; **required** for `BLOCKED`, and must state the reason |

Padding is cosmetic. Parsing splits on whitespace runs, so alignment can drift without
breaking anything.

Append with the CLI rather than by hand — it stamps the time and rejects malformed entries:

```
npm run ledger -- append MW-7 DONE lab/en/ip-1.html "routes:ok content:ok links:ok"
npm run ledger -- append MW-7 BLOCKED lab/es/dadada.html "reason: source references missing image"
```

## Entries

2026-07-28T21:31Z  MW-3   NOTE     repo/init                                  destination repo created, git init on main, no remote (human-gated)
2026-07-28T21:32Z  MW-3   DONE     harness/verify-suite                       5 checks + selftest 10/10; exit code is source of truth
2026-07-28T21:32Z  MW-3   DONE     harness/docs                               OPERATING-RULES.md, HANDOFF.md, MIGRATION-LEDGER.md format documented
2026-07-28T21:32Z  MW-3   NOTE     repo/name                                  repo named maar-world per ARCHITECTURE-REVIEW 6/7; no git remote created (human-gated)
2026-07-28T21:44Z  MW-4   DONE     routes/manifest.production.json            306 routes from live crawl; 305x200, 1x404 pre-existing
2026-07-28T21:44Z  MW-4   DONE     routes/nfc-cards.json                      35 codes = 34 skysounds + 1 stoney_way; 70 forms all 200 with noindex
2026-07-28T21:44Z  MW-4   DONE     routes/policy.json                         299 preserve, 5 drop, 2 redirect; every route classified
2026-07-28T21:44Z  MW-4   DONE     verify/external-links-baseline.json        326 external URLs, 53 hosts; 11 already dead recorded
2026-07-28T21:44Z  MW-4   NOTE     contract/dual-form                         every page live at BOTH /X and /X.html via host fallback, not just NFC codes; 97 twins added
2026-07-28T21:44Z  MW-4   NOTE     contract/addendum-drift                    live collect cards already link Bandcamp; physical./digital.maar.world absent in production, addendum 5.1 stale vs live
2026-07-28T21:44Z  MW-4   BLOCKED  collect/%20-card-urls                      are the 34 %20 Collect card URLs printed on physical material? defaulted to preserve; redirect option needs a human
2026-07-28T21:52Z  MW-5   DONE     astro/scaffold                             astro 5.18.2, build.format=file, trailingSlash=never, publicDir=.public
2026-07-28T21:52Z  MW-5   DONE     styles/tokens.css                          surfaces, 3 pigments, type scale, spacing, radii, tilt, motion, focus; framework-neutral
2026-07-28T21:52Z  MW-5   DONE     styles/reset+type                          self-hosted fontsource faces; no fonts.googleapis.com anywhere
2026-07-28T21:52Z  MW-5   DONE     content/schemas                            zod per collection; bans per-record commerce fields; 12/12 schema cases
2026-07-28T21:52Z  MW-5   DONE     config/site.ts                             COMMERCE.storeUrl single source = bandcamp; artizen move is one line
2026-07-28T21:52Z  MW-5   DONE     proof/ZZZ0000.html                         emits CODE.html at output root - card route shape proved
2026-07-28T21:52Z  MW-5   DONE     proof/space-trailing-space                 route-proof/032_-maar-sky-sounds.3-card X .html emitted with trailing space intact
2026-07-28T21:52Z  MW-5   DONE     scripts/assemble-public.mjs                media/shared + per-area layering; errors on differing collisions
2026-07-28T21:52Z  MW-5   DONE     ci/verify.yml                              selftest + schemas + verify + ledger:check on PR and main
2026-07-28T21:52Z  MW-5   NOTE     verify/expected-red                        verify:routes and verify:cards fail by design until MW-6/7/8 migrate content; 262 of 264 paths outstanding
