#!/usr/bin/env node
/**
 * Author verify/content-expectations.json (MW-7 / MW-8).
 *
 * The design is new, so visual diffing against production is meaningless. This
 * is what replaces it: per page, the headings and the body length that must
 * still be there. "The page exists but half the content vanished" is the failure
 * mode it exists to catch.
 *
 * Expectations come from the **legacy source**, not from the build, because an
 * assertion derived from the thing it asserts proves nothing. Every candidate
 * heading is then checked against the current build here, and any that does not
 * appear is printed as a MISSED line rather than quietly dropped — that output
 * is the migration audit, and a clean run means every legacy heading survived.
 *
 * `minTextLength` is the one figure taken from the build, at 90%: it is a
 * regression floor for later work, not a claim about the migration.
 *
 * `images` is an exact count, and it is here because headings alone did not
 * catch the failure this file exists for. `/collect/documentation.html` renders
 * nine cover thumbnails in production; the migrated page kept both its headings
 * and shipped **zero images**, because the raw HTML block carrying them was
 * stripped. Every heading assertion passed. A count that has to match exactly
 * fails on the next such loss instead of a session later.
 *
 * Each page also carries `productionImages`, read from the frozen manifest.
 * verify:content ignores it — it is there so the file states, per page, whether
 * the count it asserts equals what production serves, and `imageGap` names every
 * page where it does not. A deliberate gap (a third-party image the on-load gate
 * forbids) stays visible rather than being rounded away.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const PAGES = join(ROOT, 'src/content/pages');
const SITES = {
  maar: join(ROOT, '..', 'maar.world-site'),
  collect: join(ROOT, '..', 'collect.maar.world'),
  tree: join(ROOT, '..', 'tree.maar.world'),
};

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();

/** Heading text a reader would see, from either markdown or raw HTML. */
function headingsOf(source) {
  // Material Symbols icon spans never reached a reader as text — with the font
  // they were a glyph, and the font is banned. migrate-pages drops them, so the
  // expectation must be written against the heading without them.
  const body = source.replace(/<span\b[^>]*material-symbols-outlined[^>]*>[\s\S]*?<\/span>\s*/gi, '');
  const out = [];
  for (const m of body.matchAll(/^#{1,3}[ \t]+(.+?)[ \t]*#*$/gm)) out.push(m[1]);
  for (const m of body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) out.push(m[1]);
  return out
    // `*` and backtick are markdown emphasis. `_` is not stripped: it is a real
    // character in the text of these pages and removing it invents a mismatch.
    .map((h) => stripTags(h).replace(/[*`]/g, '').replace(/\s+/g, ' ').trim())
    // Single words and fragments match by accident; 4+ characters is a signal.
    // Anything still carrying Liquid was resolved to nothing, exactly as Jekyll
    // resolved it, so it is not a heading that ever reached a reader.
    .filter((h) => h.length >= 4 && !/^[\d\W]+$/.test(h) && !/\{\{|\{%/.test(h));
}

/**
 * Merged-site URL -> the image count the frozen manifest recorded in production.
 *
 * Joined through the policy's `servedAt`, which is the only field that states
 * where a legacy URL is answered from now. Both spellings of a URL describe the
 * same page, so the higher count wins — a twin that the crawl reached by a
 * different route is the same document, not a smaller one.
 */
function productionImageCounts() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'routes/manifest.production.json'), 'utf8'));
  const policy = JSON.parse(readFileSync(join(ROOT, 'routes/policy.json'), 'utf8'));
  const byRoute = new Map(manifest.routes.map((r) => [`${r.origin}${r.url}`, r]));
  const out = new Map();

  for (const r of policy.routes) {
    if (r.policy !== 'preserve' || !r.servedAt) continue;
    const prod = byRoute.get(`${r.origin}${r.url}`);
    if (!prod || prod.kind !== 'page' || typeof prod.imageCount !== 'number') continue;
    const url = r.servedAt.replace(/\.html$/i, '').replace(/\/index$/, '') || '/';
    out.set(url, Math.max(out.get(url) ?? 0, prod.imageCount));
  }
  return out;
}

const prodImages = productionImageCounts();
const countMatches = (html, re) => (html.match(re) || []).length;

const { set } = indexDist();
const pages = [];
const missed = [];
const imageGap = [];
let noBuild = 0;

for (const name of readdirSync(PAGES).sort()) {
  if (!name.endsWith('.md') && !name.endsWith('.mdx')) continue;
  const raw = readFileSync(join(PAGES, name), 'utf8');
  const outputPath = (/^outputPath:\s*"(.*)"$/m.exec(raw) || [])[1];
  const area = (/^area:\s*"([a-z]+)"$/m.exec(raw) || [])[1];
  const source = (/^source:\s*"(.*)"$/m.exec(raw) || [])[1];
  if (!outputPath) continue;

  const url = `/${outputPath.replace(/(^|\/)index$/, '')}`.replace(/\/(?=$)/, '') || '/';
  const file = resolveRoute(url, set);
  if (!file) {
    noBuild += 1;
    console.log(`  ! ${url}: not in build output`);
    continue;
  }
  const builtHtml = readDistFile(file);
  const builtText = stripTags(builtHtml);

  let candidates = [];
  if (source) {
    const abs = join(SITES[area], source.replace(/^[^/]+\//, ''));
    try {
      const legacy = readFileSync(abs, 'utf8');
      const body = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(legacy)?.[1] ?? legacy;
      candidates = [...new Set(headingsOf(body))];
    } catch {
      /* source unreadable — fall back to length only */
    }
  }

  const headings = [];
  for (const h of candidates) {
    if (builtText.includes(h)) headings.push(h);
    else missed.push(`${url}: "${h.slice(0, 70)}"`);
  }

  const images = countMatches(builtHtml, /<img\b/gi);
  const production = prodImages.get(url);
  if (typeof production === 'number' && images < production) {
    imageGap.push(`${url}: ${images} images, production serves ${production}`);
  }

  pages.push({
    url,
    headings: headings.slice(0, 12),
    minTextLength: Math.floor(builtText.length * 0.9),
    images,
    ...(typeof production === 'number' ? { productionImages: production } : {}),
  });
}

writeFileSync(
  join(ROOT, 'verify/content-expectations.json'),
  `${JSON.stringify(
    {
      note:
        'Per-page content-presence assertions for the migrated pages (MW-7 / MW-8). ' +
        'Headings are taken from the legacy source, so they assert that migration preserved them. ' +
        'minTextLength is a regression floor at 90% of the build at authoring time. ' +
        'images is an exact count and must match: headings alone did not catch ' +
        '/collect/documentation.html shipping zero of its nine cover thumbnails. ' +
        'productionImages is the frozen manifest figure, carried for comparison only — ' +
        'verify:content does not read it. ' +
        'Regenerate with scripts/author-content-expectations.mjs after an intentional content change.',
      authoredAt: new Date().toISOString(),
      pageCount: pages.length,
      imagesAsserted: pages.reduce((n, p) => n + p.images, 0),
      pagesBelowProduction: imageGap.length,
      pages,
    },
    null,
    2,
  )}\n`,
);

const asserted = pages.reduce((n, p) => n + p.headings.length, 0);
const images = pages.reduce((n, p) => n + p.images, 0);
console.log(
  `content-expectations: ${pages.length} pages, ${asserted} headings and ${images} images asserted`,
);
if (noBuild) console.log(`${noBuild} page(s) absent from the build`);
if (imageGap.length) {
  console.log(`\nFEWER IMAGES THAN PRODUCTION (${imageGap.length}) — each needs a reason or a fix:`);
  for (const g of imageGap) console.log(`  ${g}`);
}
if (missed.length) {
  console.log(`\nMISSED — legacy headings not found in the build (${missed.length}):`);
  for (const m of missed) console.log(`  ${m}`);
}
