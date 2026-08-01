/**
 * Zod schemas for every content collection.
 *
 * Kept in a plain module rather than inline in content.config.ts so they can be
 * exercised directly by scripts/check-schemas.mjs — a schema that has never been
 * seen to reject anything is not evidence of validation.
 *
 * The card frontmatter carries ~20 fields with no validation on the legacy sites
 * and has already silently diverged between two repositories. These schemas are
 * the fix: divergence becomes a build failure instead of a discovery.
 */

import { z } from 'zod';

const url = z.string().url();

/**
 * An image a page renders on load, and therefore a first-party path.
 *
 * Every card image was a `www.dropbox.com/...?raw=1` URL: 2.35 MB behind a 302
 * chain, and 73 on-load requests to a third party across 71 pages — the single
 * thing failing `verify:links`, and the one thing the no-analytics /
 * no-cookie-banner posture depends on not happening. The owner approved
 * self-hosting on 2026-07-30 and the files now live in media/collect/img/cards/.
 *
 * This is a regex rather than a note because the note is what failed the first
 * time. `url` accepted any absolute URL, so the only thing standing between the
 * build and a reinstated hotlink was that nobody typed one. The migrated-page
 * schema below has always required first-party covers for exactly this reason;
 * the card records now hold the same line.
 */
const imagePath = z
  .string()
  .regex(/^\/(img|assets)\//, 'an on-load image must be a root-relative first-party /img or /assets path');

const permalink = z
  .string()
  .regex(/^\/[^\s]*$/, 'permalink must start with / and contain no spaces');

/**
 * Commerce URLs are banned from content records.
 *
 * 183 commerce links died at once on the legacy sites because every card file
 * hardcoded its own storefront URL. The destination now lives in exactly one
 * place — src/config/site.ts COMMERCE.storeUrl — so a move to Artizen is a
 * one-line change. Reintroducing a per-record commerce field is a build error,
 * not a code-review note.
 */
const BANNED_COMMERCE_FIELDS = ['ent_link', 'physical_link', 'digital_link', 'store_link', 'buy_link'];

const noCommerceFields = (value, ctx) => {
  for (const field of BANNED_COMMERCE_FIELDS) {
    if (value && Object.prototype.hasOwnProperty.call(value, field)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${field}" is not allowed on a content record — commerce destinations come from COMMERCE.storeUrl in src/config/site.ts, so a storefront move is a one-line change`,
      });
    }
  }
};

/**
 * The 35 NFC card records. Every one of these is reachable by tapping a physical
 * object, so `permalink` and `noindex` are load-bearing, not cosmetic.
 */
export const cardSchema = z
  .object({
    permalink,
    source: z.enum(['skysounds', 'stoney_way']),
    suit_title: z.string().min(1),
    card_title: z.string().min(1),
    card_description: z.string().min(1),
    cover: imagePath,
    card_image: imagePath,
    titles: z.record(z.string(), z.string()).optional(),
    key: z.string().optional(),

    player: url.optional(),
    player2: url.optional(),
    snip_player: url.optional(),
    download: url.optional(),
    download2: url.optional(),

    track_version: z.number().optional(),
    track_v2_id: z.string().optional(),
    track_v2_slug: z.string().optional(),

    // Card pages are noindex in production and must stay that way.
    noindex: z.literal(true),
  })
  .strict()
  .superRefine(noCommerceFields);

/**
 * Every non-card page: Maar pages, Lab articles, genesis codes, Collect pages,
 * Collect documentation, the Collect card catalogue, and Tree.
 *
 * `outputPath` is the load-bearing field — the dist-relative path **without**
 * `.html`, taken from the frozen route policy's `servedAt`. Because the host
 * serves `/x` and `/x.html` from the same `x.html` file, one emitted file
 * satisfies both spellings, so the 264 preserved paths collapse to ~95 files.
 *
 * Unlike the card schema this is `passthrough`, not `strict`: legacy page
 * frontmatter is genuinely heterogeneous across three sites and unknown keys are
 * carried rather than rejected. Cards stay strict because they are the contract.
 */
export const pageSchema = z
  .object({
    outputPath: z
      .string()
      .min(1)
      .refine((s) => !s.startsWith('/') && !s.endsWith('.html'), {
        message: 'outputPath must be dist-relative and carry no .html extension',
      }),
    title: z.string().min(1),
    area: z.enum(['maar', 'collect', 'tree']),
    kind: z.enum(['page', 'lab', 'genesis', 'doc', 'collect-card', 'index']),
    /**
     * REQUIRED, and deliberately so.
     *
     * It used to be optional, and `BaseLayout` defaulted a missing value to
     * 'en'. That default was invisible — it lived in a layout, not in the
     * record — and it made `verify:a11y`'s "every page declares its own
     * language" assertion unfalsifiable: every page emitted a lang attribute
     * whether or not anyone had decided what it should be. 75 of 95 pages had
     * no language, /esp-feedback among them, and the check was green.
     *
     * Requiring it moves the decision into the data, where it is reviewable in
     * a diff and changeable per page. A record without it fails the build.
     */
    lang: z.enum(['en', 'es']),

    /**
     * Where this page CAME FROM. Not where it lives, and not who may edit it.
     *
     * REQUIRED, for the reason `lang` above is required: it decides something
     * load-bearing, so it belongs in the record where a diff shows it, not in a
     * directory name where it is inferred.
     *
     * It carries the one job the `migrated/` vs `authored/` folder split was
     * still doing. `verify-routes.mjs` reads it to decide which URLs are allowed
     * to exist: an 'authored' page authorises itself by existing, a 'migrated'
     * one must appear in the frozen policy. That rule used to be a directory
     * lookup, which is why the folders could not be reorganised without moving
     * a security decision by accident.
     *
     * 'migrated' — came out of the 2023 migration of the three legacy sites.
     *              Its URL is in routes/manifest.production.json and frozen.
     * 'authored' — written by hand afterwards. Was never on a legacy site, and
     *              is not supposed to appear in the manifest.
     *
     * Both are hand-maintained now; scripts/migrate-pages.mjs was deleted on
     * 2026-07-31. So this records history and authorisation, nothing about
     * editing. See .agents/decisions/0004-content-tree-by-language.md.
     */
    origin: z.enum(['migrated', 'authored']),

    /**
     * Which pages are the same page in another language.
     *
     * A relation, not a scalar — and it is stored rather than derived because
     * it cannot be derived reliably: of the ten Lab pairs, three have slugs
     * that are translations of each other rather than copies
     * (`shared-culture` ↔ `cultura-compartida`), so a path-based rule silently
     * finds 70% of them and reports nothing about the rest.
     *
     * Pages sharing a `translationKey` are alternates of one another. A page
     * with no translation simply omits it.
     */
    translationKey: z.string().min(1).optional(),

    /**
     * The `outputPath` of the page THIS record translates.
     *
     * A second way to say the same relation. It exists for a structural reason
     * that has since expired, and is kept for a different one.
     *
     * THE ORIGINAL REASON: `translationKey` has to be on BOTH halves of a pair,
     * and for every page outside the Lab the English half was a MIGRATED
     * record — a directory `scripts/migrate-pages.mjs` wiped and rewrote on
     * every run, so a key hand-added there lasted until the next migration and
     * no longer. Pairing the ten Lab articles was possible without this only
     * because both halves were migrated and the migration computed both keys at
     * once. That script was deleted on 2026-07-31; nothing rewrites a record
     * now, so a `translationKey` would survive on either half.
     *
     * WHY IT STAYS: 61 records use it, and it is the better form regardless —
     * the relation lives entirely in the one file that publishes it, so adding
     * a translation touches exactly one file and its English half is untouched.
     *
     * DIRECTIONAL, AND ONLY EVER SET ON THE TRANSLATION SIDE. It names a page; it
     * is not a group name. `translationKey` remains the grouping form and the
     * two are resolved into one set by src/lib/translations.mjs, so nothing
     * downstream has to know which form a given pair used.
     *
     * A value naming no existing page fails the build — see validateTranslations
     * in src/lib/translations.mjs, called from the page route. A dangling
     * relation would otherwise render as "this page has no translation", which
     * is the silent-failure shape translationKey was stored to avoid.
     */
    translationOf: z.string().min(1).optional(),

    permalink: permalink.optional(),
    /**
     * The shared shell-width contract. Standard is deliberately the default
     * for every route; a narrower reading page must name that exceptional
     * choice in its record, then BaseLayout carries it to both shells.
     */
    contentWidth: z.enum(['standard', 'reading']).default('standard'),
    noindex: z.boolean().optional(),
    tags: z.array(z.string()).default([]),
    source: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),

    /**
     * A Jekyll `{% include article-list.html %}` became this. The route renders
     * the named list from the collection instead of shipping a literal include
     * that Astro would never resolve.
     */
    indexOf: z.enum(['lab', 'collect-cards', 'collect-docs']).optional(),

    /**
     * Whether that list renders each entry's cover image. The legacy include
     * took `type='grid'` (covers) or `show_cover=false` (none), and losing the
     * distinction is what shipped `/collect/documentation.html` with none of its
     * nine thumbnails.
     */
    indexCovers: z.boolean().optional(),

    /**
     * What those covers ARE, which decides the shape the grid frames them in.
     * Passed through to `coverShape` on patterns/card — see the prop there.
     *
     * A page-level declaration and not a per-entry one, because a grid whose
     * cells were different shapes would not be a grid; and declared rather than
     * inferred from `indexOf === 'collect-cards'`, because dispatch in this
     * build is a schema value, never a string comparison against a URL or a
     * collection name.
     */
    indexCoverShape: z.enum(['band', 'card']).optional(),

    /**
     * Whether that grid is a scattered DECK — resting at an angle and squaring
     * up on hover — or the default, which rests square and leans on hover.
     * Passed through to `scatter` on patterns/card.
     *
     * Separate from `indexCoverShape` rather than implied by it, because they
     * answer different questions: one is what the picture is, the other is how
     * the page arranges it. A future index could well want card-shaped covers
     * laid out straight, and it should not have to lie about the first field to
     * get the second.
     */
    indexScatter: z.boolean().optional(),

    /**
     * Membership of a legacy Jekyll output collection, and the position in it.
     *
     * `site.documentation` is a directory, not a URL prefix: `/privacy.html`
     * belongs to it while living at the site root. Deriving the list from `kind`
     * — which is derived from the URL — silently dropped it. `indexOrder` is the
     * collection-relative source path, which is the order Jekyll rendered.
     */
    indexGroup: z.enum(['lab', 'collect-cards', 'collect-docs']).optional(),
    indexOrder: z.string().optional(),

    /**
     * A first-party cover image, root-relative. Only covers that exist in a
     * read-only legacy checkout are carried, because only those can be
     * self-hosted out of media/; an absolute URL here would be a third-party
     * request on page load.
     */
    cover: z
      .string()
      .regex(/^\/(img|assets)\//, 'cover must be a root-relative first-party /img or /assets path')
      .optional(),

    /**
     * WHICH PAGE FAMILY RENDERS THIS RECORD — §08, "ten skeletons. every route
     * resolves to one of these."
     *
     * An enum, and today an enum of exactly one value, for the reason `island`
     * is: a family is a layout the route has to implement, so a new one is
     * added by writing a component and naming it here, never by typing a string
     * into a content file.
     *
     * Absent means family 03, entry — a single 66ch measure. That is the right
     * default because it is what a document is, and it is what every migrated
     * page except this one wants. `/` carrying no family is precisely the bug
     * this field fixes: the home page was rendering as an article because
     * "article" was the only thing the route knew how to be.
     */
    family: z.enum(['home', 'tree', 'collect']).optional(),

    /**
     * ── family 01 only ──────────────────────────────────────────────────────
     *
     * Written by scripts/lib/home-family.mjs, which reads them out of the dead
     * theme's markup and removes those regions from the body so nothing renders
     * twice. They are fields rather than markup because `patterns/card` takes
     * props: the alternative is a script emitting `card__cover` and `card__title`
     * by hand, which is the component's anatomy transcribed into a second file.
     */
    /** The `<h1>`'s inner HTML — it already carries its type mark. */
    headingHtml: z.string().min(1).optional(),
    /** The statement under the title. One measure, no marks. */
    lede: z.string().min(1).optional(),
    /** The label the entry cards sit under, and the same word in other tongues. */
    tonguesLabel: z.string().min(1).optional(),
    tongues: z.array(z.string().min(1)).optional(),

    /** card.feature — "one per page, full measure". */
    feature: z
      .object({
        title: z.string().min(1),
        excerpt: z.string().min(1),
        href: z.string().min(1),
        meta: z.string().min(1).optional(),
        cover: z
          .string()
          .regex(/^\/(img|assets)\//, 'a feature cover must be a root-relative first-party path')
          .optional(),
      })
      .optional(),

    /**
     * card.entry × 3. Exactly three, because the family is "one feature card,
     * then THREE entry cards" — a skeleton that accepts any number is not one.
     */
    entries: z
      .array(
        z.object({
          title: z.string().min(1),
          excerpt: z.string().min(1),
          href: z.string().min(1),
          meta: z.string().min(1).optional(),
        }),
      )
      .length(3)
      .optional(),

    /**
     * `/interplanetary-players` is a deprecated address that production serves
     * as a meta-refresh stub, not an HTTP redirect. Preserved exactly, because
     * the route policy says preserve and a 200 is what is live.
     */
    redirectTo: z.string().optional(),

    /**
     * The one page whose content is an application, and therefore the one page
     * allowed to ship application JavaScript. This is an enum of exactly one
     * value on purpose: a second island cannot be added by writing a string in
     * a content file, only by changing this list — which makes it a decision,
     * not a habit. `/helix-diagram.html` is the sole holder.
     */
    island: z.enum(['helix']).optional(),

    // Carried verbatim on the retired Collect card catalogue pages. Commerce
    // URLs are absent by design — noCommerceFields rejects them.
    suit_title: z.string().optional(),
    card_title: z.string().optional(),
    // Self-hosted since 2026-07-30, same rule as `cover` above and as the card
    // records — an image a page renders on load is first-party or it is nothing.
    card_image: imagePath.optional(),
    card_description: z.string().optional(),
    snip_player: url.optional(),
  })
  .passthrough()
  .superRefine(noCommerceFields);

export const SCHEMAS = {
  cards: cardSchema,
  pages: pageSchema,
};
