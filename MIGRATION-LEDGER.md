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
2026-07-28T22:02Z  MW-6   DONE     content/cards                              35 records migrated, schema-validated; 34 skysounds + STW3344
2026-07-28T22:02Z  MW-6   DONE     content/cards                              35 records migrated, schema-validated; 34 skysounds + STW3344
2026-07-28T22:02Z  MW-6   DONE     pages/cardCode-route                       emits 35 CODE.html at output root; page family 03 entry
2026-07-28T22:02Z  MW-6   DONE     cards/liquid-resolved                      DWE1406+STW3344 bodies had unrendered page.* Liquid; substituted from frontmatter as Jekyll did
2026-07-28T22:02Z  MW-6   DONE     cards/sitemap-excluded                     all 35 noindex cards absent from sitemap; production had them noindex AND listed
2026-07-28T22:02Z  MW-6   DONE     verify/cards-green                         verify:cards 11 assertions pass; 70 forms, casing stable, noindex intact
2026-07-28T22:02Z  MW-6   NOTE     verify/baseline-completed                  external baseline now records on-load resources too (326->562 urls); route set byte-identical
2026-07-28T22:02Z  MW-6   BLOCKED  cards/dropbox-third-party                  MW-6 says keep Dropbox card art; MW-1 gate forbids third-party request on page load. 37 img refs to www.dropbox.com. Needs a human: self-host the art, or accept the exception
2026-07-28T22:02Z  MW-6   BLOCKED  cards/artizen-destination                  COMMERCE.destinationUrl is null - Artizen project URL does not exist yet, so card pages render no destination link
2026-07-28T22:12Z  MW-6   DONE     cards/orbiter-forward                      33 of 35 cards forward to orbiter.plantasia.space/?trackId=<track_v2_id> after 300ms, matching production; DWE1406+STW3344 correctly do not
2026-07-28T22:12Z  MW-6   NOTE     cards/forward-was-missed                   crawler does not run JS so the forward was invisible in MW-4; found via planning README. verify:cards now asserts it (12 assertions)
2026-07-28T22:12Z  MW-6   NOTE     design/reference-4a                        Maar World 4a.dc.html is a direction mockup: cut-word+echo mechanics useful, but its blur/gradient washes and off-palette colours are forbidden by the spec. Spec wins.
2026-07-28T22:31Z  MW-7   DONE     routes/all-preserved-paths                 verify:routes green - 264 distinct paths, 0 missing (was 192); 95 pages migrated from 3 legacy sites
2026-07-28T22:34Z  MW-7   DONE     links/internal-and-external                verify:links internal PASS 133 pages; 8 legacy urls added to baseline allowedNew (form actions + consent-gated video ids the MW-4 crawl could not see)
2026-07-28T22:34Z  MW-7   NOTE     cards/dropbox-count-grew                   MW-6 BLOCKED cards/dropbox-third-party now covers 75 on-load refs, not 37: the 34 retired Collect card pages carry the same art urls. Same decision, larger blast radius
2026-07-28T22:36Z  MW-8   DONE     routes/redirects.map                       111 explicit lines - 103 collect + 8 tree; .html twins and %20 card paths individually present
2026-07-28T22:36Z  MW-7   DONE     verify/content-expectations.json           95 pages, 117 legacy headings asserted; verify:content PASS, zero legacy headings lost
2026-07-28T22:37Z  MW-7   DONE     pages/material-symbols                     18 icon spans dropped: the glyph came from fonts.googleapis.com (banned) and without it the span renders its ligature name as literal text
2026-07-28T22:37Z  MW-7   DONE     sitemap/orbiters-once                      /orbiters listed once; /interplanetary-players excluded as a noindex meta-refresh stub
2026-07-28T22:37Z  MW-8   DONE     collect/no-storefronts                     no page under /collect/* references physical.maar.world, digital.maar.world or gumroad
2026-07-28T22:37Z  MW-7   BLOCKED  helix-diagram.html                         reason: interactive diagram loaded react+babel from unpkg - forbidden on page load. MW-9 owns the Helix island. URL resolves with a static explanation until then
2026-07-28T22:37Z  MW-7   BLOCKED  resume/noindex                             reason: MW-7 says whether /resume should be noindex is an open owner decision. Left crawlable and in the sitemap, exactly as production. Needs a human
2026-07-28T22:37Z  MW-8   BLOCKED  tree/sunflower-image                       reason: tree index hub image is hotlinked from herbarium.plantasia.space - third party on page load. Asset is not in any read-only checkout, so it cannot be self-hosted here. Dropped; needs the file or an exception
2026-07-28T22:37Z  MW-7   NOTE     pages/legacy-css-dropped                   every legacy <style> and <script> block removed: MW-7 forbids application JS outside /helix-diagram.html, and the blocks carry gradients, blur and off-palette hexes the design spec forbids
2026-07-28T22:37Z  MW-7   NOTE     pages/dead-legacy-img                      /img/about/Bruna.jpeg is referenced by both ip-orchestra articles and exists in no checkout - broken in production too. Dropped rather than shipped as a dead link
2026-07-28T22:37Z  MW-6   DONE     cards/no-js-fallback                       restored the visible Open Maar Orbiter anchor + noscript on the 33 track cards; JS-restricted taps had no route to the Orbiter at all
2026-07-28T22:37Z  MW-6   DONE     cards/title-derivation                     title now suit_title+card_title, 35 distinct; titles.en is duplicated across EBT5599 and STW3344 in the source and is no longer promoted
2026-07-28T22:37Z  MW-6   DONE     cards/player-download-labels               player/download1 = soundscapes and music, 2 = spoken word per legacy card.html; STW3344 keeps its own music + mix(mp3)/mix(wav) and renders its duplicated player once
2026-07-28T22:39Z  MW-7   DONE     pages/kramdown-vs-commonmark               dedented raw html blocks and stripped 44 kramdown IALs; kramdown kept a <div> raw to its close, commonmark ends at a blank line and turns the next indented line into a code block - 93 pages were shipping escaped markup
2026-07-28T22:41Z  MW-3   DONE     contract-integrity-lock                    routes/contract.lock.json + verify:contract close the regenerate-the-manifest bypass; contract:relock is deliberate and refuses removals
2026-07-28T22:42Z  MW-7   DONE     pages/title-and-lead                       Jekyll layouts rendered title+excerpt above bodies with no heading; /collect/decks and /collect/suits were otherwise blank. Materialised in the migration, 12 pages affected
2026-07-28T22:42Z  MW-6   DONE     verify/cards-content                       verify:cards asserts each page carries ITS OWN title, description fingerprint, play.maar.world players and downloads from routes/nfc-cards.json; 20 assertions, 7 new ones proved to fail on a swapped card
2026-07-28T22:43Z  MW-3   DONE     build-output-assertions                    verify:build now inspects emitted HTML: titles, body text, page count — a hollow dist that passed four of five checks now fails
2026-07-28T22:44Z  MW-8   DONE     handoff/regenerated                        MW-7 and MW-8 complete; HANDOFF.md records the kramdown/commonmark trap, the material-symbols trap and 6 blocked items
2026-07-28T22:46Z  MW-3   DONE     ledger-history-guard                       append-only now verified across the file's whole git history; committing a deletion, amending, and empty or missing ledgers all fail
2026-07-28T22:48Z  MW-3   DONE     third-party-gate-coverage                  verify:links now reads srcset, style attributes, style blocks, meta refresh, unquoted attrs, svg image/use and built CSS; 10 bypasses have cases
2026-07-28T22:50Z  MW-3   DONE     extra-routes-pass                          verify:routes now reports pages no production route asks for; the three build-scaffolding pages are allowlisted in routes/scaffolding-allowlist.json and printed every run
2026-07-28T22:51Z  MW-3   DONE     policy-manifest-join                       verify:routes now checks policy to manifest as well as manifest to policy; an orphaned decision fails
2026-07-28T22:54Z  MW-3   DONE     link-baseline-both-ways                    verify:links now detects external links that DISAPPEARED; 107 absences recorded via links:review-removals, 79 on content-bearing hosts flagged for MW-9
2026-07-28T22:54Z  MW-4   BLOCKED  z/README-zh                                reverting an unauthorised drop: all 4 forms (maar + tree, /z/README-zh and .html) are LIVE 200, ~45KB/~38KB. ARCHITECTURE-REVIEW section 10 item 12 is 'what should NOT be built' and forbids porting the z/ source dir - it is not authority to stop serving a live URL, and MW-4 says 'only records reality'. Now dropKind=unresolved+openDecision, not a decision. Cannot be preserve: the build does not emit 45KB of theme docs and preserve obliges the build
2026-07-28T22:54Z  MW-4   BLOCKED  tree/index.min                             reason: A8 ('No inbound backlinks depend on index.min.html on tree') is unverified in ARCHITECTURE-REVIEW section 3, and section 8.2 makes the 301 conditional on it - '301 -> / unless A8 says otherwise'. Both forms are live 200 (819B of unrendered Jekyll source). Withdrawing the decided redirect; MW-4 says 'Mark BLOCKED and ask rather than deciding'. Visitor outcome unchanged - author-redirects.mjs sends dropped tree URLs to maar.world/tree, the same target
2026-07-28T22:54Z  MW-4   DONE     routes/policy.json                         collect root servedAt '/collect/' -> '/collect': trailingSlash=never + build.format=file never serves a trailing-slash URL, and lib/routes.mjs maps '/collect/' to collect/index.html only. Matches how the Tree root was handled. verify:routes 264 distinct paths, 0 missing
