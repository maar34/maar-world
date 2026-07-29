# Handoff — maar-world content-rendering defects (MW-7 / MW-11)

**Repo:** `/Users/Qubit/Documents/Github/maar-world/maar-world`
**Written:** 2026-07-29
**State at stop:** working tree clean, five commits landed, nothing half-applied.

This document covers only what is *not* already durable in the repo. Read these first —
they are the record, this file is the context around it:

- `MIGRATION-LEDGER.md` — append-only. The last six entries are this session.
- `HANDOFF.md` — regenerated at this stop; has the current verify numbers and the
  "do not edit content to satisfy these" warning.
- `docs/agent/OPERATING-RULES.md` — binding. Read before doing anything.
- `git log 4953656..aa72dc1` — the five commits, each with its reasoning in the message.

---

## Where things stand

```
npm run verify   ->  46 passed, 2 failed, 1 skipped     (unchanged from session start)
npm run verify:content  ->  49 problems across 48 of 130 pages   (was 56 across 52)
verify:links Dropbox on-load references  ->  73        (was 75; must never go up)
```

Both failures are known, recorded and human-gated. **Anything else red is a regression.**

| Commit | Unit |
|---|---|
| `4953656` | MW-11 `pages/missing-alt` — alt text + card body duplicates |
| `b277851` | MW-7 `pages/article-title-heading` — six pages got their title `<h1>` back |
| `839abc6` | MW-7 `pages/commented-out-embed` — `/collect` 2 embeds → 1 |
| `dfde8c2` | MW-7 — three record-only ledger lines (residue analysis, ip-orchestra BLOCKED, landings/tables re-measured) |
| `aa72dc1` | MW-11 — `HANDOFF.md` regenerated |

---

## The four fixes and where they live

All content under `src/content/**` is **generated**. `npm run migrate:pages` and
`node scripts/migrate-cards.mjs` are idempotent — hand-editing a content file is
undone by the next run. Every fix therefore went into the migration scripts.

1. **`IMAGE_ALT` in `scripts/migrate-pages.mjs`** (with `addMissingAlt()`, called inside
   `transform()`). Keyed `page-key|src`. Twelve raw `<img>` had no alt. Any alt-less
   `<img>` without a recorded decision now gets `alt=""` **and is printed** by
   `npm run migrate:pages` — grep the output for `without alt`.
   Page keys are `collect`, `radio`, `collect/docs/ent-cards` — *not* `collect/index`.

2. **`dropRouteRenderedMedia()` in `scripts/migrate-cards.mjs`.** Compares body `<img src>`
   against `card_image`/`cover` and body `<iframe src>` against `player`/`player2`/
   `snip_player`, i.e. against what `src/pages/[cardCode].astro` already renders. Class
   detector, not two hand-fixes. Note the `GONE` sentinel: a removal that leaves a
   whitespace-only line would close the surrounding raw-HTML block and re-parse the rest
   as markdown, so such lines are deleted outright.

3. **`firstTopHeading()` + `PRODUCTION_HEADINGS` in `scripts/migrate-pages.mjs`.** The old
   test was `!/^#\s|<h1\b/im.test(body)` — "is there an `<h1>` anywhere". The right question
   is "is the body's *first* heading the page title". Gated on
   `routes/manifest.production.json` recording the title as production's own first heading,
   so no page can gain a heading production did not serve. Six pages changed, each verified
   against the live page: `/collect/docs/mw/terms`, `/lab/en/dadada`, `/lab/es/dadada`,
   `/privacy`, `/collect/privacy`, `/subscribe`.

4. **Comment rule in `transform()`, immediately before `defuseThirdParty()`.** A comment
   containing element markup is dropped and reported; prose comments (51 of the 52 in the
   corpus) stay. `/collect` was turning a commented-out `<iframe>` into a facade nobody
   could click but everything could count. The YouTube URL leaving the page is recorded in
   `routes/external-link-removals.json` via `npm run links:review-removals -- --write`.

---

## The remaining 49 are check-side. Do not "fix" them in content.

Full arithmetic is in the ledger line `MW-7 NOTE content/residue-is-check-side`. Summary of
the evidence, because the next agent will be tempted:

- **33 × `missing heading "soundscapes & music"`.** `verify-content.mjs` `stripTags()`
  decodes no entities. The build's text reads `soundscapes &amp; music`; the expectation,
  taken from production HTML that carried a bare `&`, reads `soundscapes & music`. The
  label is hard-coded at `src/pages/[cardCode].astro:112`; a reader sees the ampersand
  correctly, and the sibling label `spoken word` on the same 33 pages passes. Emitting a
  bare `&` would be invalid HTML.
- **7 text floors.** The production side of the assertion measures the **whole document**,
  so `<title>` counts as body text, while the build side measures `mainContent()` only.
  Four are exact identities: `collect/about` 32 = 27 + 5, `decks` 66 = 27 + 39, `suits`
  61 = 27 + 34, `music` 175 = title 19 + dropped `nature_people ` ligature 14 + 142. Both
  `tree` pages build **longer** than production-minus-decisions (87 vs 82, 306 vs 301).
  `/interplanetary-players`' 148 production chars are escaped literal
  `&lt;!DOCTYPE html&gt;…` that Jekyll printed as visible text — production ships a broken
  page and the migrated stub is the fix.
- **8 × `disqus.com/?ref_noscript`.** Removed on purpose, commit `9242758`.
- **1 × `/tree` missing `soundcloud.com/maarworld`.** The expectation took it from the
  **stale** `../tree.maar.world/_site/index.html`. The frozen
  `routes/manifest.production.json` lists 7 outbound links for `tree.maar.world/` and
  SoundCloud is not among them; live `tree.maar.world` serves none; the migration source
  `../tree.maar.world/index.html` has none. The build matches production; the baseline
  does not.

Fixing (a), (b) and (d) means `scripts/author-content-expectations.mjs` and
`scripts/verify-content.mjs`. **Every fix to the harness gets a selftest case**
(OPERATING-RULES) — `scripts/selftest.mjs`, fixtures use the `MW_VERIFY_ROOT` hook.

---

## BLOCKED — needs an owner

`MW-7 BLOCKED pages/ip-orchestra-bruna-image`. `/lab/en/ip-orchestra` and
`/lab/es/ip-orchestra` reference `/img/about/Bruna.jpeg` (round author avatar). It **404s
on both maar.world and collect.maar.world today** and exists in no read-only checkout —
production serves a broken image too, 12 `<img>` elements for 11 images. Already carried
as a per-page `images` exclusion, so nothing asserts it. The only first-party candidate is
`/img/about/bruna-profile.webp`, a **different** file used by `/about`. Substituting it
would put an image on the page production never served. One question for the owner: is
that substitution wanted?

---

## Ownership boundaries this session worked under

**Owned:** `scripts/migrate-pages.mjs`, `scripts/migrate-cards.mjs`, `src/content/**`,
`media/**`, `MIGRATION-LEDGER.md` (append only), `HANDOFF.md`.

**Explicitly off-limits:** `src/layouts/**`, `src/pages/**`, `src/components/**`,
`scripts/verify-*.mjs`, `scripts/author-content-expectations.mjs`, `routes/**`.

`routes/external-link-removals.json` was written, but only through the sanctioned
`npm run links:review-removals -- --write`, which the task explicitly required.

If the next session is asked to close the remaining 49, **the boundary has to move** — say
so before starting rather than working around it.

---

## Traps

- **`.astro/` staleness.** After any change under `src/content/`, the next `astro build`
  emits one `[glob-loader] Duplicate id` warning per changed file, and `verify:build` fails
  on warnings above zero. Not a content defect. `rm -rf` on the directory is blocked by the
  sandbox here; `find .../.astro -mindepth 1 -delete` works.
- **`node scripts/author-content-expectations.mjs` rewrites `verify/content-expectations.json`**
  (bumps `authoredAt`) as a side effect of printing the list. Revert it if you only wanted
  to read.
- **Legacy `_site/` builds are stale** relative to live production in at least one place
  (`tree`). When production and `_site` disagree, the frozen
  `routes/manifest.production.json` and a live `curl` are the authority.
- Never `git add -A`. Stage only owned paths.

---

## Open recommendation — Astro upgrade is its own ticket

Running **Astro 5.18.2**; the CLI advertises **7.1.5**. Pinned `"astro": "^5.18.2"` in
`package.json`, so it is deliberate, not drift.

Do **not** fold this into the content work:

- Every expectation in `verify/content-expectations.json` fingerprints *rendered HTML*.
  A major bump moves the markdown pipeline and therefore those fingerprints — you lose the
  ability to tell a migration defect from a renderer change, which is the entire value of
  `verify:content`.
- The one approved React island (`client:only="react"`) and `@astrojs/react ^5` have to
  move with it.
- It is revertible and belongs in its own commit with its own full verify run.

Right sequence: finish MW-11 sign-off → upgrade as a separate ticket → re-run `verify` and
diff the content expectations deliberately.

---

## The pages look raw — real, measured, and MW-11's other half

Observed at this stop, not a suspicion:

```
distinct classes in migrated bodies: 146  |  with CSS: 5  |  with NO CSS: 141
```

**Styled:** the shell only — `src/styles/{tokens,type,reset,shell}.css` (~49 KB shipped),
`src/layouts/BaseLayout.astro` + `shell-dark/` + `shell-paper/`,
`src/components/ui/{SiteHeader,SiteFooter,SkipLink,InstagramMark}`, `patterns/GlyphRun`,
the Helix island, the card pages' own scoped styles, and the embed facades.

**Not styled:** every migrated body still carries legacy TeXt-theme class names, and that
theme's stylesheet was deliberately never migrated — it is the same theme that carried
Disqus, Google Fonts and the analytics chrome the invariants forbid. Busiest orphans:
`index-row__tag` ×87, `hero` ×45, `container` ×41, `hero__content` ×40,
`responsive-iframe` ×39, `swiper__slide` ×38, `hero--center` ×35, `lightbox-ignore` ×35,
`button` ×34, `card-unlock` / `card-snippet` / `card-player-note` ×34 each.

What a reader sees: `hero` blocks render as plain flow, the five `/collect` swiper slides
stack vertically instead of sliding, every `class="button"` is a bare link. **`index-row*`
is unstyled too** — that is the Lab index a previous session built.

1. **Not a content defect.** `verify:content` asserts headings, text length, images,
   embeds and links — never CSS. A page can be fully content-correct and look like this.
   Do not chase it through the migration scripts.
2. **Out of the previous session's boundary.** `src/styles/**`, `src/components/**` and
   `src/layouts/**` were all do-not-touch.
3. **MW-11 is already BLOCKED on precisely this.** Ledger `048bf90 — MW-11: BLOCKED —
   site shell needs the live design spec, DesignSync unreachable`; `HANDOFF.md` records
   that the DesignSync MCP was unreachable during MW-9 so
   `Maar World Design System.dc.html` could not be read; `OPERATING-RULES.md` forbids
   caching design values from an earlier session. **Get that MCP reachable before styling
   anything** — otherwise the next agent invents a design system, which the rules
   explicitly prohibit ("implement only what is settled and log the rest as BLOCKED. Do
   not invent the missing half.").

**Owner decision that sizes the job:** should the 141 legacy class names be *restyled*
(write CSS for `hero`, `swiper`, `grid`, `cell`… against the design tokens) or *replaced*
(rewrite the bodies in the migration to emit the new design system's markup)? The second
is more work but stops the dead theme's vocabulary becoming permanent. Design decision,
not an implementation one.

---

## Suggested next steps

1. **MW-11 has two halves.** The a11y / responsive sign-off is one; applying the design to
   the page bodies is the other, and it is blocked on the DesignSync MCP plus the
   restyle-vs-replace decision above. MW-10 and MW-12 are human-gated; do not start them.
2. Decide the ip-orchestra avatar question above.
3. Optionally, with the boundary widened: close the 49 by fixing
   `author-content-expectations.mjs` (exclude `<head>` from the production body measure;
   read `links` from the frozen manifest, not from `_site`) and `verify-content.mjs`
   (decode entities in `stripTags`), each with a selftest case.

## Suggested skills

- `ps-local-workflow` — before branching or committing, for the shared worktree/slot
  conventions in this repo family.
- `ship` — only once MW-11 signs off and work is genuinely finished; it verifies, merges,
  propagates and closes out in one pass.
- **NOT `ps-design-lib-first`.** An earlier revision of this file called that skill
  "binding" for the styling half of MW-11. That was wrong and is corrected here rather
  than deleted, because the mistake is an easy one to repeat: it pattern-matches on
  "Plantasia org + design".

  That skill is scoped to `orbiters`, `plantasia.space-root` and `entangled-worlds`, and
  its authority is the shared `plantasia.space-design` library. **maar-world is none of
  those, and adopting that library is explicitly rejected** — ARCHITECTURE-REVIEW-ADDENDUM
  D1: *"Do not adopt the Plantasia design library. Maar World is the experimental ground;
  Plantasia was derived from it. New work is born here and flows outward."* Following the
  skill here would invert the direction the whole design decision rests on.

  The binding authority for any UI in this repo is `Maar World Design System.dc.html`,
  read **live** via the DesignSync MCP each session, per `OPERATING-RULES.md` — it is
  actively edited and will have changed. `../mw-design-system/` is an empty directory and
  is not a source. If DesignSync is unreachable, append BLOCKED and stop; do not
  substitute another library.
