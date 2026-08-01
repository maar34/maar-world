# Task Plan

## Objective

`collect/index` only: move the page's STRUCTURE out of the two record bodies and
into `families/Collect.astro`, leaving the two records carrying nothing but
their own language's words. Step 1 of MW-19 — the proof the approach works
before it is applied to the other 15 pairs.

## Linear issue

MW-19 — [ARCH] Page structure is duplicated per language.
Read in full. The traps it names and the ones found while reading the code:

- No URL may move. `outputPath` is authoritative and hash-locked.
- Never `contract:relock` / `freeze:routes` to make a check pass — append BLOCKED.
- English is the source of truth for STRUCTURE. Where the two disagree, English wins.
- The ordering is fixed: `collect/index` alone, then the other 15, then the assertion.

## Relevant skills

`.agents/skills/maar-content-authoring/SKILL.md` — how a page record is written,
what `translationOf` means, and that a migrated body is now editable by hand.
Checked `references/local-dev-and-testing.md` for the worktree/trunk rule.

## Slot

`maar-world.worktrees/wt-1`, branch `wt/1-mw-19-separate-structure-from-copy`,
label "MW-19 separate structure from copy".

## Affected files

- `src/components/families/Collect.astro` — gains the page's whole structure
- `src/components/media/EmbedFacade.astro` — NEW, the click-to-load facade
- `src/components/media/Carousel.astro` — NEW, the spec §06 carousel markup
- `src/content/schemas.mjs` — the `collect` copy object
- `src/content/pages/en/collect/index.md` — body emptied, copy → frontmatter
- `src/content/pages/es/collect/index.md` — same, in Spanish
- `src/pages/[...page].astro` — passes the copy through; carousel/facade script
  detection can no longer read the body alone
- `src/config/site.ts` — the decorative band image, and the store URL already there

## Assumptions

- "Sky Sounds" is asserted by `verify:content` as a heading but is satisfied by
  the pitch paragraph, because the check tests `readable.includes(...)` over the
  whole main region rather than over `<h*>` elements. Verified by reading
  scripts/verify-content.mjs, not inferred.
- The carousel id prefix `carousel-<outputPath with / → ->` reproduces the ids
  the two bodies carry today (`carousel-collect-index-1-1`,
  `carousel-es-collect-index-1-1`), so `verify:a11y`'s unique-id and in-page-link
  assertions see no change. Derived from the existing strings, to be confirmed by
  the check.
- `/es/collect` carries no production baseline in
  `verify/content-expectations.json`, so only `/collect` is asserted there.

## Invariants in play

- **Frozen route manifest / contract lock** — no `outputPath` changes, so no
  route moves. Nothing is re-locked.
- **No third-party request on page load** — the YouTube embed stays a
  click-to-load facade; the component emits the same `data-embed-facade` markup
  the gate already understands.
- **Application JavaScript on exactly three things** — no fourth. The carousel
  keeps `ui/CarouselScript`, the facade keeps `ui/EmbedConsentScript`. But their
  inclusion test reads `entry.body`, and the body is about to stop holding the
  markup, so the test has to move with it or five pages silently lose their JS.
- **Commerce URLs are banned from content records** — the bandcamp link is NOT
  copied into the new frontmatter. It comes from `COMMERCE.storeUrl`.

## Risks

1. **The JS-inclusion regression above.** Highest risk in the change: it fails
   silently and no check currently names it. Mitigation: derive `hasCarousel` /
   `hasMediaEmbed` from the record's data as well as its body, and confirm the
   built page still ships the script.
2. **`verify:content` text floor** — `/collect` must keep ≥1144 chars of main
   text, ≥6 images, ≥1 embed, and the bandcamp link. Every word is carried over,
   so this should hold; the check decides.
3. **Losing the Spanish page's button icons.** The two halves disagree: the
   Spanish buttons carry an SVG icon and a different variant, the English ones do
   not. English wins per the issue, so the icons come off unless the owner says
   otherwise. Flagged rather than decided quietly — after this change it is one
   edit in one file to put them back for both languages, which is the point.
4. **The Spanish body repeats its own `description`** as a paragraph under the
   H1, where the English one does not — so `/es/collect` prints its opening
   sentence twice today (once in the collage statement, once in the body). Drops
   out with the body; noted so it is not mistaken for lost copy.

## Step-by-step plan

1. `media/EmbedFacade.astro` + `media/Carousel.astro`, emitting byte-comparable
   markup to what the bodies hold.
2. The `collect` copy object in `src/content/schemas.mjs`.
3. `Collect.astro` renders the whole page from that object.
4. Fill both records' frontmatter; empty both bodies.
5. Fix the script-inclusion test in `[...page].astro`.
6. `npm run build`, then `npm run verify`.

## Verification

Narrowest first: `npm run verify:content` (the per-page floors for `/collect`)
and `npm run verify:a11y` (ids, in-page links). Then the whole suite, because
this touches the route.

Baseline on this worktree, measured before any edit:
**86 passed, 0 failed, 1 skipped** (the skip is MW-10's host canary).
The issue quotes 85; `5b17ae8` added one. Anything below 86 passed, or any
failure, is a regression from this change.

## Ledger line

npm run ledger -- append MW-19 DONE arch/collect-structure-once "collect/index
renders from families/Collect.astro; both records carry copy only. ~45
duplicated structural elements → 0, 2 elements of drift → 0. See
src/components/families/Collect.astro."

## Skill update needed?

- [x] Yes — `maar-content-authoring` gains the rule that a translated page
      carries words, not markup, once step 3's assertion lands.
- [ ] No
