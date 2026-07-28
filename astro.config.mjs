// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import { readFileSync } from 'node:fs';

/**
 * Pages carrying noindex must never appear in the sitemap.
 *
 * Production today is self-contradictory: all 34 Sky Sounds card pages emit
 * <meta name="robots" content="noindex"> AND are listed in sitemap.xml. The
 * card codes are read from the frozen inventory so this filter cannot drift
 * away from the cards it is meant to exclude.
 */
const NOINDEX = new Set([
  ...JSON.parse(readFileSync(new URL('./routes/nfc-cards.json', import.meta.url), 'utf8'))
    .cards.flatMap(({ code }) => [`/${code}`, `/${code}.html`]),
  '/ZZZ0000', '/ZZZ0000.html',
  // A deprecated address production serves as a 200 with a meta refresh to
  // /orbiters. MW-7 settles that orbiters.md owns /orbiters; listing its old
  // address too would put the same page in the sitemap twice, which is the
  // duplicate the issue exists to remove.
  '/interplanetary-players', '/interplanetary-players.html',
]);

/**
 * Two settings here are not negotiable, because 35 physical NFC cards depend
 * on them:
 *
 *   build.format: 'file'   emits `EBT5599.html` at the output root. The
 *                          extensionless `/EBT5599` is then served by the
 *                          host's `.html` fallback — exactly as GitHub Pages
 *                          does today. 'directory' would emit
 *                          `EBT5599/index.html` and change the URL shape.
 *
 *   trailingSlash: 'never' matches current behaviour.
 *
 * Both forms of all 35 codes must keep working, byte-for-byte, never
 * redirected. See routes/nfc-cards.json and `npm run verify:cards`.
 */
export default defineConfig({
  site: 'https://maar.world',
  output: 'static',
  publicDir: '.public',
  build: {
    format: 'file',
    // Assets keep a stable directory so /img/** paths in the frozen route
    // manifest are never disturbed by hashed-asset placement.
    assets: '_assets',
  },
  trailingSlash: 'never',
  // No analytics, no third-party anything. Prefetch is same-origin only.
  prefetch: false,
  devToolbar: { enabled: false },
  integrations: [
    /**
     * React exists in this build for exactly one island: the Helix diagram at
     * /helix-diagram.html. That page was React 18 + ReactDOM + @babel/standalone
     * pulled from unpkg.com and transpiled in the visitor's browser — three
     * third-party requests and a compiler, on page load. The island is built
     * here instead, so the only page that ships application JavaScript is the
     * one page whose content *is* an application.
     *
     * Astro ships zero JavaScript for a page with no island, so adding this
     * integration does not put React on any other page. If a second island ever
     * appears, that is a decision to take deliberately, not a side effect.
     */
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        if (NOINDEX.has(path)) return false;
        // Route-shape proofs are build scaffolding, not content.
        if (path.startsWith('/route-proof/')) return false;
        return true;
      },
    }),
  ],
});
