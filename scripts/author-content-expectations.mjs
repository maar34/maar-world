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

const { set } = indexDist();
const pages = [];
const missed = [];
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
  const builtText = stripTags(readDistFile(file));

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

  pages.push({
    url,
    headings: headings.slice(0, 12),
    minTextLength: Math.floor(builtText.length * 0.9),
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
        'Regenerate with scripts/author-content-expectations.mjs after an intentional content change.',
      authoredAt: new Date().toISOString(),
      pageCount: pages.length,
      pages,
    },
    null,
    2,
  )}\n`,
);

const asserted = pages.reduce((n, p) => n + p.headings.length, 0);
console.log(`content-expectations: ${pages.length} pages, ${asserted} headings asserted`);
if (noBuild) console.log(`${noBuild} page(s) absent from the build`);
if (missed.length) {
  console.log(`\nMISSED — legacy headings not found in the build (${missed.length}):`);
  for (const m of missed) console.log(`  ${m}`);
}
