import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { SCHEMAS } from './content/schemas.mjs';

/**
 * TWO collections, not five.
 *
 * `genesis`, `lab` and `docs` were declared here with schemas and empty
 * directories, and were read by nothing — `getCollection` is called for exactly
 * `cards` and `pages`. They are the shape the repo was designed with before the
 * migration, and the migration went another way for a stated reason: one flat
 * `pages` collection keyed by `outputPath` is what lets 264 preserved
 * production URLs collapse onto ~95 records, and what a Lab article IS is
 * carried by the `kind` discriminator instead.
 *
 * They cost three `[glob-loader] No files found` warnings on every build and
 * read to a newcomer as unfinished work. Removed, with the reasoning in
 * docs/adr/0001-one-pages-collection.md so it is not re-invented.
 */

/**
 * Typed content collections.
 *
 * Content files are `.md` by default and `.mdx` only where a component is
 * genuinely required. This is not a style preference: the content is full of
 * raw HTML (`<div class="...">`, bare `<br>`, `<img class=...>`), and MDX
 * requires JSX-valid markup. Defaulting to MDX would force edits across ~50
 * files for no benefit and risk silent breakage. Plain `.md` passes raw HTML
 * through untouched.
 *
 * Schemas live in ./content/schemas.mjs so they can be tested directly.
 */

const pattern = '**/*.{md,mdx}';

export const collections = {
  cards: defineCollection({
    loader: glob({ pattern, base: './src/content/cards' }),
    schema: SCHEMAS.cards,
  }),
  /**
   * Every non-card page, from BOTH of its sources.
   *
   *   src/content/migrated/**  came out of the migration originally. NOTHING
   *                            REGENERATES IT NOW — scripts/migrate-pages.mjs was
   *                            deleted on 2026-07-31 because it had fallen behind
   *                            the content and its "regeneration" had become a
   *                            revert. Hand-edit freely; see docs/AUTHORING.md.
   *   src/content/authored/**  written by a person. No script touches it, ever.
   *                            This is where a new Lab post goes.
   *
   * The split is now historical rather than operational: both are hand-maintained
   * and the loader treats them identically. `migrated/` records where a page came
   * from, not who may edit it.
   *
   * One collection, one schema, one route: a migrated page and an authored one
   * are the same kind of record, and `[...page].astro` cannot tell them apart —
   * which is the point. `outputPath` still decides the URL in both cases.
   *
   * Two sources rather than one is what makes this a real seam. With only the
   * migration writing here there was no way to publish anything the legacy
   * sites did not already serve.
   */
  pages: defineCollection({
    loader: glob({ pattern: `{migrated,authored}/${pattern}`, base: './src/content' }),
    schema: SCHEMAS.pages,
  }),
};
