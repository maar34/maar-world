import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { SCHEMAS } from './content/schemas.mjs';

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
  genesis: defineCollection({
    loader: glob({ pattern, base: './src/content/genesis' }),
    schema: SCHEMAS.genesis,
  }),
  lab: defineCollection({
    loader: glob({ pattern, base: './src/content/lab' }),
    schema: SCHEMAS.lab,
  }),
  /**
   * Every non-card page, from BOTH of its sources.
   *
   *   src/content/migrated/**  written by scripts/migrate-pages.mjs, and wiped
   *                            by it on every run. Never hand-edit — the next
   *                            migration undoes it.
   *   src/content/authored/**  written by a person. No script touches it, ever.
   *                            This is where a new Lab post goes.
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
  docs: defineCollection({
    loader: glob({ pattern, base: './src/content/docs' }),
    schema: SCHEMAS.docs,
  }),
};
