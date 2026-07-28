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
2026-07-28T22:54Z  MW-4   DONE     contract/relock-d1-d3                      route count 306 -> 306; route sha 54e9ae87c5a94328 unchanged; policy sha ffefa1ec2cfb2c78 -> e9691d64fbf3d3a1; policy mix {preserve:299,redirect:2,drop:5} -> {preserve:299,redirect:0,drop:7}; route set unchanged against HEAD, no --accept-removals needed
2026-07-28T22:57Z  MW-3   DONE     verify-composes-ci                         npm run verify now runs verify:selftest, verify:schemas and ledger:check as well; a selftest case asserts every CI command is composed in
2026-07-28T23:00Z  MW-9   DONE     helix-diagram/react-island                 the one approved island: /helix-diagram.html is HelixDiagram.tsx mounted client:only=react, built here instead of react18+reactdom+@babel/standalone from unpkg transpiling jsx in the browser. route unchanged, 3 third-party requests and a runtime compiler removed; only page in dist that ships js
2026-07-28T23:03Z  MW-9   DONE     embeds/facades                             18 third-party embeds across 13 pages are click-to-load facades: 10 youtube, 2 vimeo, 2 soundcloud, 2 google-forms, 1 google-calendar, 1 s1.ssl-stream radio. each is a titled anchor with a provider chip and a note, keyboard-operable, --focus-* ring, rel=noopener noreferrer. verified in a built preview: page load requests are first-party only. play.maar.world and radio.maar.world stay plain iframes
2026-07-28T23:03Z  MW-9   BLOCKED  embeds/click-out-not-load                  reason: MW-9 asks for in-page click-to-load players, but injecting an iframe on click needs script, so all 13 embed pages would ship application javascript - and MW-9 also says the helix island is the only page allowed to. both cannot hold. shipped as click-OUT: nothing third-party is requested until the visitor chooses, and no page but helix ships js. a visitor now leaves the site to play the media. needs an owner
2026-07-28T23:03Z  MW-9   NOTE     embeds/no-poster                           MW-9 asks each facade to carry a poster image. the only source of a youtube/vimeo/soundcloud poster is the third party itself, and none exists in the read-only checkouts, so fetching one would be the request the facade exists to prevent. a flat maar pigment chip naming the provider stands in its place
2026-07-28T23:04Z  MW-9   DONE     fonts/self-hosted                          confirmed and not regressed by the react island: 18 woff2 served from /_assets, zero fonts.googleapis.com / fonts.gstatic.com / unpkg.com / cdnjs / googletagmanager / google-analytics / @babel/standalone anywhere in dist, and every url() in every built stylesheet is relative. no cookie banner and no consent engine exist in the codebase
2026-07-28T23:04Z  MW-9   NOTE     js/one-island-only                         dist audit: 133 html pages, exactly 1 (helix-diagram.html) references a javascript asset, 0 carry <script src>. the 34 pages with an inline script are the 33 MW-6 orbiter forwards plus helix's own island bootstrap
2026-07-28T23:04Z  MW-9   BLOCKED  media/assets-over-2mb                      reason: MW-9 requires the largest served asset under 2 MB. the 8.8 MB gif is already gone but 5 assets remain over it - 2024_ss-5/6/7.jpeg at 2.6-2.75 MB and 433-suits.gif at 2.48 MB, 33.9 MB dist total. re-encoding needs sharp/ffmpeg and changes what a visitor sees, and it was outside this session's scope. not attempted, not hidden
2026-07-28T23:04Z  MW-9   NOTE     design/designsync-unavailable              the DesignSync MCP was not connected this session, so 'Maar World Design System.dc.html' could not be re-read live as OPERATING-RULES requires. every value in the helix island and the facades comes from src/styles/tokens.css (transcribed from spec 1.1) and no raw hex, pixel or duration was introduced. re-check both components against the live spec when the mcp is reachable
2026-07-28T23:04Z  MW-9   NOTE     build/astro-cache-duplicate-id             trap: after any change under src/content, the next astro build emits one [glob-loader] Duplicate id warning per changed file from the incremental .astro store, and verify:build fails on warnings above 0. it is stale cache, not a content defect - a fresh clone and CI never see it. delete .astro and rebuild
2026-07-28T23:06Z  MW-9   DONE     handoff/regenerated                        MW-9 complete: helix island, 18 embed facades, fonts confirmed. handoff records the astro cache duplicate-id trap and that verify:contract/verify:routes were red only from a concurrent uncommitted route re-freeze (306 -> 611), green against committed routes/
2026-07-28T23:06Z  MW-9   DONE     helix-diagram.html                         clears the MW-7 BLOCKED of the same unit: the interactive diagram is back at its original url as a built react island, no unpkg and no runtime babel. verify:build 6/6 and verify:links internal PASS with the page in the build. note that ledger status prints every BLOCKED line ever written, so the MW-7 entry stays visible - this line is its resolution
2026-07-28T23:07Z  MW-4   DONE     routes/manifest.production.json            306 -> 611 routes (+305, 0 removed). freeze-routes.mjs followed only <a href>, so the manifest recorded HTML pages + 4 PDFs and called itself a record of production. Now probes 22 host-level paths per origin and follows same-host <link>/<img>/<script>/<source>/srcset/og:image. 311 pages + 300 assets; per-route kind, referenceCount, referencedBy, redirectTargetStatus
2026-07-28T23:07Z  MW-4   DONE     scripts/freeze-routes.mjs                  bytes now always the decoded resource size; it preferred Content-Length for text and byteLength for binary, so gzipped HTML was recorded compressed - /z/README-zh read 14124 bytes and is 45078. transferBytes keeps the header value where it differs
2026-07-28T23:07Z  MW-4   DONE     verify/external-links-baseline.json        re-freezing overwrote allowedNew with [] every run, silently re-arming verify:links against 9 URLs MW-7 had already reviewed. allowedNew is now carried forward; the crawl cannot see a form action or a consent-gated embed id
2026-07-28T23:07Z  MW-4   DONE     scripts/collect-seeds.mjs                  258 legacy img/ and assets/ files seeded as speculative candidates from the read-only checkouts; freeze-routes probes them and records only what production answers, so a stale checkout can never put a URL into the contract
2026-07-28T23:07Z  MW-4   BLOCKED  routes/syndication                         reason: /feed and /feed.xml are live RSS on all 3 origins and the build emits no feed. A reader that stops receiving produces no 404 anyone sees. 6 URLs. Ship a feed at these exact paths or accept losing every subscriber - not a routing decision
2026-07-28T23:07Z  MW-4   BLOCKED  routes/crawler-directive                   reason: production serves /robots.txt + /sitemap.xml on all 3 origins; the build emits /sitemap-index.xml and no robots.txt. Search Console is registered against the production URLs. 6 URLs
2026-07-28T23:07Z  MW-4   BLOCKED  routes/host-error-page                     reason: /404 and /404.html are live themed 404s on all 3 origins and are the GitHub Pages error document. The build emits neither, so a mistyped NFC card code lands on the host default. 6 URLs
2026-07-28T23:07Z  MW-4   BLOCKED  routes/browser-chrome                      reason: 21 live icon/manifest URLs (favicon.ico, favicon-16x16, favicon-32x32, apple-touch-icon, safari-pinned-tab.svg, site.webmanifest, browserconfig.xml on 3 origins). The build emits none; already-saved bookmarks and home-screen shortcuts lose their icon
2026-07-28T23:07Z  MW-4   BLOCKED  routes/deploy-artifact                     reason: /Dockerfile.dev, /docker/nginx.conf, /tools/assert-url.js and /CNAME are publicly readable on all 3 origins - Jekyll copied the repo root into _site. Removing them is almost certainly right but it changes what is served, and MW-4 does not authorise that. 12 URLs
2026-07-28T23:07Z  MW-4   BLOCKED  routes/theme-asset-tree                    reason: 54 live URLs under /assets/**, including /assets/css/main.css (155KB, loaded by every page on all 3 sites). Most likely group to be safe to retire, but ARCHITECTURE-REVIEW section 10 item 12 is about not carrying the theme into the repo, not about what the host answers - the same over-claim this session reverted for /z/
2026-07-28T23:07Z  MW-4   BLOCKED  routes/orphan-legacy-asset                 reason: 129 live static files referenced by no page on any of the 3 sites. Reachable only by knowing the URL - which is what a hotlink or an old social card is. One decision for the group: check referrer logs and retire, or carry the tree across
2026-07-28T23:07Z  MW-4   BLOCKED  collect/documentation-covers               reason: collect.maar.world/documentation.html renders 9 cover thumbnails today; the migrated /collect/documentation.html renders no images at all - the refs were lost when MW-7 stripped its raw HTML blocks. A content regression, not a routing call. Restore the thumbnails or accept the loss
2026-07-28T23:07Z  MW-4   NOTE     crawl/search-console-seeding               MW-4 task 'Seed the crawl with Google Search Console top pages and any analytics landing-page report' has never been done and cannot be without credentials (A7 - GSC verification for all 3 domains - is itself unverified). URLs that nothing links to and that are absent from every sitemap and every legacy checkout are therefore still missing from the contract. Not complete; blocked on access
