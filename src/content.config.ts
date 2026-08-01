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
 * .agents/decisions/0001-one-pages-collection.md so it is not re-invented.
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
   * Every non-card page, filed by LANGUAGE.
   *
   *   src/content/pages/en/**   85 English pages
   *   src/content/pages/es/**   72 Spanish pages
   *
   * One rule, and you can infer it: language, then area, then page. A page and
   * its translation sit at the same path under different language roots —
   * `en/lab/dadada.md` and `es/lab/dadada.md` — so finding a page's other half
   * is looking at the same path, not grepping 157 records.
   *
   * This replaced a `migrated/` and `authored/` split, which sorted pages by
   * how they ARRIVED — 2023 migration versus written by hand afterwards. That
   * is history, it is the one thing a reader cannot infer by looking, and
   * language cut across it at random: `migrated/` held 84 English records and
   * 11 Spanish ones. Provenance now lives in the required `origin` field, where
   * it is stated per record. See
   * .agents/decisions/0004-content-tree-by-language.md.
   *
   * One collection, one schema, one route: `[...page].astro` cannot tell a
   * migrated page from an authored one, or an English one from a Spanish one,
   * which is the point. `outputPath` decides the URL in every case — the tree
   * was rearranged without moving a single URL, because nothing in `src/` reads
   * a file's path.
   */
  pages: defineCollection({
    loader: glob({ pattern: `{en,es}/${pattern}`, base: './src/content/pages' }),
    schema: SCHEMAS.pages,
  }),
};
