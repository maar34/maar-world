# MW-18 — Astro 5 → 7, and the rest of the dependencies

**Status:** done on `wt/1-mw-18-upgrade-astro-7`, awaiting review and ship. `npm run verify`
= 100 passed, 0 failed, 0 skipped under Node 22.

## What moved

| package | from | to |
|---|---|---|
| astro | 5.18.2 | 7.3.1 |
| @astrojs/mdx | 4.3.14 | 8.0.0 |
| @astrojs/react | 5.0.0 | 6.0.5 |
| @astrojs/sitemap | 3.7.3 | 3.7.4 |
| @astrojs/markdown-remark | — | 7.3.0 (new, see below) |
| pdfjs-dist | 5.6.205 | 6.3.289 |
| @material-symbols/svg-400 | 0.45.7 | 0.47.1 (still pinned exact; all 24 icons in use still exist) |
| @types/react, @types/react-dom | 19.2.17 / 19.2.3 | 19.2.18 / 19.2.7 |

Unchanged because already current: react, react-dom, embla-carousel, the four fontsource faces.

**Node is now ≥ 22.12** (`engines`, both workflows). Astro 6 dropped 20. Locally: `nvm use 22`.

## The three things Astro 7 changed that this site had to answer

1. **Markdown processor.** Astro 7 defaults to Sätteri, which runs no rehype plugins — the
   image-size plugin would have been accepted and ignored. `markdown.processor` is now
   `unified({ rehypePlugins: [...] })` from `@astrojs/markdown-remark`, the pipeline Astro 5 ran.
2. **`compressHTML`** defaults to `'jsx'`; pinned to `true`, the Astro 5 behaviour the frozen
   fingerprints were taken under.
3. **Directory-index records.** Astro 7 strips `/index.html` and `.html` from every page request
   before looking up its static path, regardless of `build.format`, and reverts only if the
   route pattern stops matching — a catch-all always matches. So `collect/index` was requested as
   `collect` and all six `…/index` records failed the build. The route now keys them by the host
   path (`routeParamOf` in `lib/translations.mjs`) and `directoryIndexFiles` in `astro.config.mjs`
   renames `collect.html` → `collect/index.html` after the build. The dev-only request rewrite
   that used to fake this in `npm run dev` is gone; `/collect` matches directly now. The emitted
   file set was diffed against the Astro 5 build: identical — that is **names only**. One
   *content* difference came with it: the sitemap's `<loc>` for the six hubs is now
   `https://maar.world/collect` where Astro 5 wrote `https://maar.world/collect/index`. That is
   the canonical URL a reader is given and the one the route manifest holds, so it is an
   improvement rather than a regression, but it is a change and it is recorded here.

One check moved with the compiler: Astro 7 writes `&amp;` inside raw-HTML hrefs where Astro 5
passed `&` through. `verify:content` now compares links against attribute-decoded HTML as well,
using the same `decodeAttrEntities` the external-link baseline already uses.

## Not done, on purpose

- Bumping `zod` in `content/schemas.mjs` beyond what Astro brings (schemas import `zod` directly;
  Astro 7 ships zod 4 and the build passes).
- The Astro upstream issue for point 3. Worth filing: a rest param whose value ends in `/index`
  cannot be prerendered under `build.format: 'file'`.
