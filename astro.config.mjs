// @ts-check
import { defineConfig } from 'astro/config';

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
});
