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
  pages: defineCollection({
    loader: glob({ pattern, base: './src/content/pages' }),
    schema: SCHEMAS.pages,
  }),
  docs: defineCollection({
    loader: glob({ pattern, base: './src/content/docs' }),
    schema: SCHEMAS.docs,
  }),
};
