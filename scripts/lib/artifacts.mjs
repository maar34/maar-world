/**
 * Locations of the artifacts the verify suite reads, and which Linear issue
 * produces each one. A check whose input is missing reports SKIP naming the
 * issue, so an incomplete run can never read as a complete one.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, sep } from 'node:path';

/**
 * Repo root. `MW_VERIFY_ROOT` redirects every artifact lookup at a fixture
 * directory instead, which is how scripts/selftest.mjs proves the suite really
 * fails on a broken build without touching the real repo.
 */
export const ROOT = process.env.MW_VERIFY_ROOT
  ? resolve(process.env.MW_VERIFY_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ARTIFACTS = {
  manifest: {
    path: resolve(ROOT, 'routes/manifest.production.json'),
    rel: 'routes/manifest.production.json',
    issue: 'MW-4',
    what: 'frozen production route manifest',
  },
  policy: {
    path: resolve(ROOT, 'routes/policy.json'),
    rel: 'routes/policy.json',
    issue: 'MW-4',
    what: 'preserve/redirect/drop policy for every production route',
  },
  cards: {
    path: resolve(ROOT, 'routes/nfc-cards.json'),
    rel: 'routes/nfc-cards.json',
    issue: 'MW-4',
    what: 'the 35 frozen NFC card codes',
  },
  contentExpectations: {
    path: resolve(ROOT, 'verify/content-expectations.json'),
    rel: 'verify/content-expectations.json',
    issue: 'MW-7 / MW-8',
    what: 'per-page content-presence assertions',
  },
  linkBaseline: {
    path: resolve(ROOT, 'verify/external-links-baseline.json'),
    rel: 'verify/external-links-baseline.json',
    issue: 'MW-4',
    what: 'external link baseline',
  },
  hostCanary: {
    path: resolve(ROOT, 'verify/host-canary.json'),
    rel: 'verify/host-canary.json',
    issue: 'MW-10',
    what: 'host extensionless-fallback canary result',
  },
  dist: {
    path: resolve(ROOT, 'dist'),
    rel: 'dist/',
    issue: 'MW-5',
    what: 'production build output',
  },
};

export function has(key) {
  return existsSync(ARTIFACTS[key].path);
}

export function loadJson(key) {
  return JSON.parse(readFileSync(ARTIFACTS[key].path, 'utf8'));
}

/**
 * Every file in dist/, as POSIX-style paths relative to dist/.
 *
 * Returned as an array plus a Set so callers can do exact, case-sensitive
 * membership tests. macOS filesystems are case-insensitive, so existsSync()
 * would happily confirm `/ebt5599.html` for a file named `EBT5599.html` — which
 * is precisely the class of bug that would brick a physical card.
 */
export function indexDist(distPath = ARTIFACTS.dist.path) {
  const files = [];
  if (!existsSync(distPath)) return { files, set: new Set() };

  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else files.push(relative(distPath, abs).split(sep).join('/'));
    }
  };
  walk(distPath);
  return { files, set: new Set(files) };
}

export function readDistFile(relPath, distPath = ARTIFACTS.dist.path) {
  return readFileSync(join(distPath, relPath), 'utf8');
}
