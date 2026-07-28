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
    cover: url,
    card_image: url,
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

export const genesisSchema = z
  .object({
    permalink,
    titles: z.record(z.string(), z.string()).optional(),
    key: z.string().optional(),
    show_title: z.boolean().optional(),
    noindex: z.boolean().optional(),
  })
  .strict()
  .superRefine(noCommerceFields);

export const labSchema = z
  .object({
    title: z.string().min(1),
    lang: z.enum(['en', 'es']),
    permalink: permalink.optional(),
    date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().optional(),
    cover: url.optional(),
    noindex: z.boolean().optional(),
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
    lang: z.enum(['en', 'es']).optional(),
    permalink: permalink.optional(),
    surface: z.enum(['dark', 'paper']).default('dark'),
    noindex: z.boolean().optional(),
    inNav: z.boolean().default(false),
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
     * `/interplanetary-players` is a deprecated address that production serves
     * as a meta-refresh stub, not an HTTP redirect. Preserved exactly, because
     * the route policy says preserve and a 200 is what is live.
     */
    redirectTo: z.string().optional(),

    // Carried verbatim on the retired Collect card catalogue pages. Commerce
    // URLs are absent by design — noCommerceFields rejects them.
    suit_title: z.string().optional(),
    card_title: z.string().optional(),
    card_image: url.optional(),
    card_description: z.string().optional(),
    snip_player: url.optional(),
  })
  .passthrough()
  .superRefine(noCommerceFields);

export const docSchema = z
  .object({
    title: z.string().min(1),
    permalink: permalink.optional(),
    surface: z.enum(['dark', 'paper']).default('paper'),
    noindex: z.boolean().optional(),
  })
  .strict()
  .superRefine(noCommerceFields);

export const SCHEMAS = {
  cards: cardSchema,
  genesis: genesisSchema,
  lab: labSchema,
  pages: pageSchema,
  docs: docSchema,
};
