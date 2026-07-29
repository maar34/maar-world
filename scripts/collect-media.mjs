#!/usr/bin/env node
/**
 * Copy the legacy assets the migrated pages actually reference into media/.
 *
 * The three legacy `img/` trees total 93 MB, most of it unreferenced by any
 * surviving page. Copying wholesale would put dead weight in git forever, so
 * this walks the migrated content, resolves every `/img/**` and `/assets/**`
 * reference it finds, and copies exactly those — plus the four PDFs, which are
 * routes in the frozen manifest whether or not a page links to them.
 *
 * Paths are copied verbatim into media/<area>/, which scripts/assemble-public
 * then layers into .public/. `/img/**` must survive byte-identically because
 * those paths appear in the frozen route manifest.
 *
 * Legacy checkouts are read-only source material. Nothing here writes to them.
 */

import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const LEGACY = join(ROOT, '..');
const SITE_DIR = {
  maar: join(LEGACY, 'maar.world-site'),
  collect: join(LEGACY, 'collect.maar.world'),
  tree: join(LEGACY, 'tree.maar.world'),
};
const PAGES = join(ROOT, 'src/content/migrated');
const MEDIA = join(ROOT, 'media');

/** Routes in the frozen manifest, so they ship whether or not a page links them. */
const CONTRACT_ASSETS = [
  ['maar', '/img/pdf/02_Bruna-Resume.pdf'],
  ['maar', '/img/pdf/03_Bruna-Portfolio.pdf'],
  ['maar', '/img/pdf/English-EPK_Bruna_Guarnieri.pdf'],
  ['maar', '/img/pdf/WAC25-Orbits-and-Bodies-Bruna-Gabriel.pdf'],
];

/** path -> Set<area> */
const wanted = new Map();
const want = (area, path) => {
  if (!wanted.has(path)) wanted.set(path, new Set());
  wanted.get(path).add(area);
};

for (const [area, path] of CONTRACT_ASSETS) want(area, path);

const REF_RE = /["'(](\/?(?:img|assets)\/[^"')\s>]+)/g;

/** Every migrated record, at any depth — the pages source is a tree now. */
function walkRecords(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walkRecords(abs));
    else if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(abs);
  }
  return out;
}

for (const abs of walkRecords(PAGES)) {
  const raw = readFileSync(abs, 'utf8');
  const area = (/^area:\s*"([a-z]+)"/m.exec(raw) || [])[1];
  if (!area) continue;

  for (const m of raw.matchAll(REF_RE)) {
    let p = m[1].split('#')[0].split('?')[0];
    if (!p.startsWith('/')) p = `/${p}`; // a few legacy urls are page-relative
    try {
      p = decodeURIComponent(p);
    } catch {
      /* malformed escape — copy literally */
    }
    want(area, p);
  }
}

const copied = [];
const missing = [];
let bytes = 0;

for (const [path, areas] of [...wanted].sort()) {
  for (const area of areas) {
    const src = join(SITE_DIR[area], path.replace(/^\//, ''));
    if (!existsSync(src) || statSync(src).isDirectory()) {
      missing.push(`${area}${path}`);
      continue;
    }
    const dest = join(MEDIA, area, path.replace(/^\//, ''));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    bytes += statSync(src).size;
    copied.push(`${area}${path}`);
  }
}

console.log(`collect-media: ${copied.length} files, ${(bytes / 1e6).toFixed(1)} MB -> media/`);
if (missing.length) {
  console.log(`\nreferenced but absent from the legacy checkout (${missing.length}):`);
  for (const m of missing) console.log(`  ! ${m}`);
}
