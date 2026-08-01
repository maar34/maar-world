// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * LOCAL DEV RUNS ON https://local.maar.world:4321 — see docs/LOCAL-DEVELOPMENT.md.
 *
 * Development happens in worktree slots (`maar-world.worktrees/wt-N`), not in
 * the primary checkout. Two consequences are handled here:
 *
 *   1. `.certs/` is gitignored, so it does not exist in a fresh worktree — the
 *      slot creator symlinks it from the primary. Resolving it via
 *      `git rev-parse --git-common-dir` finds the primary checkout from any
 *      slot, so the certs are found even if that symlink is ever absent.
 *
 *   2. `node_modules` is likewise symlinked to the primary, so imports resolve
 *      to real paths OUTSIDE this worktree. Vite's filesystem guard denies
 *      those by default, so the shared parent of both checkouts is allowed
 *      below. Without it, dev in a slot fails on the first dependency asset.
 *
 * Certs are the switch: with them, dev serves HTTPS on the real hostname (which
 * needs `127.0.0.1 local.maar.world` in /etc/hosts). Without them — a fresh
 * clone, someone who has not run the setup — dev still boots on plain-HTTP
 * localhost so the site is explorable out of the box.
 */
function mainWorktreeDir() {
  try {
    const raw = execSync('git rev-parse --git-common-dir', {
      cwd: dirname(new URL(import.meta.url).pathname),
      encoding: 'utf8',
    }).trim();
    const abs = raw.startsWith('/') ? raw : resolve(dirname(new URL(import.meta.url).pathname), raw);
    return dirname(abs);
  } catch {
    return dirname(new URL(import.meta.url).pathname);
  }
}

const SELF_DIR = dirname(new URL(import.meta.url).pathname);
const CERTS_DIR = join(mainWorktreeDir(), '.certs');
const CERT_KEY = join(CERTS_DIR, 'local.maar.world-key.pem');
const CERT_PEM = join(CERTS_DIR, 'local.maar.world.pem');
const HAS_CERTS = existsSync(CERT_KEY) && existsSync(CERT_PEM);
const DEV_HOST = 'local.maar.world';
const DEV_PORT = 4321;

if (!HAS_CERTS) {
  console.warn(
    `[maar-world] no local TLS certs in .certs/ — serving plain HTTP on localhost:${DEV_PORT}.\n` +
    '[maar-world] For the https://local.maar.world dev origin, see README "Local development".'
  );
}

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
  // Retired 2026-07-30 by the owner: the newsletter sign-up. Redirect stub to /.
  '/subscribe', '/subscribe.html',
  // Retired 2026-07-30 by the owner: both were a Google Form and the content was
  // out of date. They are redirect stubs to /bookings now, and a redirect has no
  // business in a sitemap — the same reasoning as the line above.
  '/eng-feedback', '/eng-feedback.html',
  '/esp-feedback', '/esp-feedback.html',
]);

/**
 * MAKE `npm run dev` SERVE THE URLS THE HOST SERVES.
 *
 * `build.format: 'file'` emits a page whose `outputPath` is `collect/index` as
 * `collect/index.html`, and a static host — GitHub Pages today, `astro preview`
 * locally — resolves `/collect` to it. Astro's dev server matches route params
 * literally, so in dev only `/collect/index` answered and `/collect` was a 404.
 *
 * Three pages have that shape: `index`, `collect/index`, `tree/index` — the
 * home page and the two area hubs, which is to say the three most linked URLs
 * on the site. In dev, every one of them 404'd.
 *
 * This was in HANDOFF.md as a documented trap, and a documented footgun is a
 * patch: it cost the owner real time — "it gives 404 all the time and I need to
 * restart the server, sometimes works sometimes not". It was never intermittent.
 * It was 404 on `dev` and 200 on `preview`, every time, and which one you had
 * running decided which you saw.
 *
 * DEV ONLY, BY CONSTRUCTION. This is a Vite dev-server middleware. It cannot
 * run at build time, so it cannot add, remove or rename a single route: the
 * frozen manifest and `verify:contract` are untouchable from here. What it does
 * is make dev *wrong in the same way production is right* — an internal rewrite,
 * never a redirect, so the URL in the address bar stays exactly what the visitor
 * typed and `trailingSlash: 'never'` still holds.
 *
 * The list is derived from the content records rather than hardcoded, so a
 * fourth hub added later needs no edit here.
 */
function directoryIndexPages(root = new URL('./src/content/', import.meta.url).pathname) {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md') || entry.endsWith('.mdx')) {
        const m = /^outputPath:\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(p, 'utf8'));
        if (m && /(^|\/)index$/.test(m[1].trim())) found.add(`/${m[1].trim()}`);
      }
    }
  };
  try { walk(root); } catch { /* no content yet — dev has nothing to rewrite */ }
  return found;
}

function devHostSemantics() {
  return {
    name: 'maar-dev-host-semantics',
    apply: 'serve',
    configureServer(server) {
      const pages = directoryIndexPages();
      server.middlewares.use((req, _res, next) => {
        const [path, query = ''] = (req.url || '/').split('?');
        // `/` is the one the host maps to `/index`; the rest map `/x` -> `/x/index`.
        const target = path === '/' ? '/index' : `${path.replace(/\/$/, '')}/index`;
        if (pages.has(target)) req.url = target + (query ? `?${query}` : '');
        next();
      });
    },
  };
}

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
  /**
   * THE HOST MUST BE SET HERE, NOT ONLY UNDER `vite.server`.
   *
   * Astro derives the dev server's host and port from its OWN top-level
   * `server` config and hands them to Vite, overriding `vite.server.host`.
   * Setting the host only under `vite` therefore looks correct and does
   * nothing: Vite's own defaults win and the server binds plain localhost,
   * which on this machine is IPv6 `[::1]`. The failure is quiet in the worst
   * way — the port is right and TLS is right, so `https://localhost:4321`
   * answers 200 while `https://local.maar.world:4321` cannot connect at all.
   *
   * Settings Astro does not model — `https`, `strictPort`, `allowedHosts`,
   * `fs.allow`, `hmr` — stay under `vite.server` below, where they are read.
   */
  server: HAS_CERTS ? { host: DEV_HOST, port: DEV_PORT } : { port: DEV_PORT },
  // Dev-only. `apply: 'serve'` means it never participates in a build.
  vite: {
    plugins: [devHostSemantics()],
    server: {
      // Slots symlink node_modules to the primary checkout, so dependency
      // assets resolve outside this root. Allow the parent holding both.
      fs: { allow: [SELF_DIR, resolve(SELF_DIR, '../..'), mainWorktreeDir()] },
      // Vite silently falls forward to the next free port when 4321 is taken.
      // The monitor advertises ONE fixed URL, so a silent drift to :4322 shows
      // as "the site is down" while a perfectly healthy server logs success on
      // a port nobody is looking at. Fail loudly instead.
      strictPort: true,
      ...(HAS_CERTS
        ? {
            host: DEV_HOST,
            port: DEV_PORT,
            https: {
              key: readFileSync(CERT_KEY),
              cert: readFileSync(CERT_PEM),
            },
            hmr: { host: DEV_HOST },
            allowedHosts: [DEV_HOST],
          }
        : { port: DEV_PORT }),
    },
  },
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
    /**
     * MDX exists so that a page's STRUCTURE can stop being written twice — MW-19.
     *
     * The owner approved the dependency on 2026-08-01, and the alternative it
     * was chosen over is worth recording. A translated article was a copy of the
     * whole article: prose and raw HTML fused in the body, then duplicated per
     * language, so `lab/en/ip-orchestra` and `lab/es/ip-orchestra` each carried
     * ~60 structural elements and had already drifted apart.
     *
     * Landing pages fixed that with a page family — `/collect` renders entirely
     * from `families/Collect.astro`. An ARTICLE cannot: its prose and its blocks
     * interleave, and a family with fixed slots would have to move every
     * carousel and embed to the end of the piece. The other option on the table
     * was exactly that, and it loses the article's own sequence.
     *
     * So an article body stays markdown and calls components where a block goes.
     * Structure lives once, in `src/components/**`; the record carries words.
     *
     * IT SHIPS NO JAVASCRIPT. MDX compiles to the same static HTML `.md` does —
     * the components below are `.astro`, rendered at build time — so the rule
     * that application JavaScript is allowed on exactly three things is
     * untouched. Adding a fourth is still a decision, not a side effect.
     *
     * `.md` REMAINS THE DEFAULT and `content.config.ts` still says so. MDX
     * requires JSX-valid markup, which the migrated bodies are not; a body is
     * converted to `.mdx` when its structure is being lifted out, not before.
     * Pinned to the v4 line because v5 requires Astro 6 and this build is on
     * Astro 5 — upgrading Astro is a much larger change than this one.
     */
    mdx(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        if (NOINDEX.has(path)) return false;
        // Route-shape proofs are build scaffolding, not content.
        if (path.startsWith('/route-proof/')) return false;
      // The error page is a real URL production serves, but it is not a
      // destination — listing it invites a crawler to index "page not found".
      if (path === '/404' || path === '/404.html') return false;
        return true;
      },
    }),
  ],
});
