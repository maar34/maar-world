#!/usr/bin/env node
/**
 * Produce routes/seeds.json — the URLs a link crawler cannot discover.
 *
 * The manifest itself is frozen from a live crawl of production (MW-4 is explicit
 * that local `_site/` output is a fiction: GitHub Pages ignores the repo Gemfile
 * and builds with a different Jekyll). But some live URLs are linked from nowhere:
 * the NFC card codes are reached by tapping a physical object, `/resume` is
 * deliberately unlinked, and Tree's `/index.min.html` is an orphan.
 *
 * So the legacy checkouts are read — strictly read-only — to enumerate candidate
 * URLs, and every one of them is then verified against live HTTP by
 * freeze-routes.mjs. Source frontmatter proposes; production disposes.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const LEGACY = resolve(ROOT, '..');
const MAAR = join(LEGACY, 'maar.world-site');
const COLLECT = join(LEGACY, 'collect.maar.world');

const seeds = [];
const add = (origin, url, why) => seeds.push({ origin, url, why });

function permalinksIn(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const m = /^permalink:\s*(\S+)\s*$/m.exec(readFileSync(join(dir, file), 'utf8'));
    if (m) out.push(m[1]);
  }
  return out.sort();
}

// --- NFC card codes ------------------------------------------------------
// 34 from _skysounds plus ONE from _stoney_way. An inventory built by reading
// only _skysounds/ silently drops a real card that is printed and in use.
const skysounds = permalinksIn(join(MAAR, 'collections/_skysounds'));
const stoneyWay = permalinksIn(join(MAAR, 'collections/_stoney_way'));

for (const p of skysounds) {
  add('maar.world', p, 'nfc-card:skysounds');
  add('maar.world', `${p}.html`, 'nfc-card:skysounds');
}
for (const p of stoneyWay) {
  add('maar.world', p, 'nfc-card:stoney_way');
  add('maar.world', `${p}.html`, 'nfc-card:stoney_way');
}

// --- Genesis codes -------------------------------------------------------
for (const p of permalinksIn(join(MAAR, 'collections/_genesis'))) {
  add('maar.world', p, 'genesis-code');
}

// --- PDFs ----------------------------------------------------------------
const pdfDir = join(MAAR, 'img/pdf');
if (existsSync(pdfDir)) {
  for (const f of readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
    add('maar.world', `/img/pdf/${f}`, 'pdf');
  }
}

// --- Deliberately unlinked pages ----------------------------------------
add('maar.world', '/resume', 'unlinked-but-live');

// --- Collect card URLs ---------------------------------------------------
// No `permalink:` frontmatter, so Jekyll derives the URL from the filename.
// Filenames contain spaces, and one carries a trailing space before the
// extension, producing `/cards/032_-maar-sky-sounds.3-card%20X%20.html`.
const cardsDir = join(COLLECT, 'collections/_cards');
if (existsSync(cardsDir)) {
  for (const f of readdirSync(cardsDir).filter((f) => f.endsWith('.md')).sort()) {
    const base = f.slice(0, -3); // strip .md, preserving any trailing space
    add('collect.maar.world', `/cards/${encodeURI(base)}.html`, 'collect-card');
  }
}

// --- Tree orphan ---------------------------------------------------------
add('tree.maar.world', '/index.min.html', 'orphan');

// --- Write ---------------------------------------------------------------
const seen = new Set();
const unique = seeds.filter((s) => {
  const k = `${s.origin}${s.url}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const outPath = resolve(ROOT, 'routes/seeds.json');
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      note: 'Candidate URLs a link crawler cannot discover. Verified against live HTTP by freeze-routes.mjs — this file proposes, production disposes.',
      generatedFrom: ['maar.world-site', 'collect.maar.world (read-only legacy checkouts)'],
      counts: {
        nfcCardCodes: skysounds.length + stoneyWay.length,
        nfcUrlForms: (skysounds.length + stoneyWay.length) * 2,
        total: unique.length,
      },
      seeds: unique,
    },
    null,
    2,
  )}\n`,
);

// --- Frozen NFC card inventory ------------------------------------------
// The canonical list of physical-card codes, with the collection each came from.
// verify:cards asserts the 34 + 1 split explicitly, because an inventory built
// from _skysounds alone silently drops STW3344 — a real card, already printed.
const cardRecords = [
  ...skysounds.map((p) => ({ code: p.slice(1), source: 'skysounds', permalink: p })),
  ...stoneyWay.map((p) => ({ code: p.slice(1), source: 'stoney_way', permalink: p })),
].sort((a, b) => a.code.localeCompare(b.code));

writeFileSync(
  resolve(ROOT, 'routes/nfc-cards.json'),
  `${JSON.stringify(
    {
      note: 'The 35 NFC card codes printed on physical cards. Each resolves as both /CODE and /CODE.html — 70 URLs — never redirected, byte-for-byte stable in spelling and casing. Changing anything here breaks physical objects already in people’s hands.',
      generatedFrom: 'maar.world-site/collections/{_skysounds,_stoney_way} (read-only), verified against live HTTP',
      cardCount: cardRecords.length,
      urlFormCount: cardRecords.length * 2,
      cards: cardRecords,
    },
    null,
    2,
  )}\n`,
);

console.log(`seeds: ${unique.length}`);
console.log(`  nfc codes: ${skysounds.length} skysounds + ${stoneyWay.length} stoney_way = ${skysounds.length + stoneyWay.length}`);
console.log(`  nfc url forms: ${(skysounds.length + stoneyWay.length) * 2}`);
console.log(`  written to routes/seeds.json`);

if (skysounds.length + stoneyWay.length !== 35) {
  console.error(`\nREFUSING: expected 35 NFC codes, found ${skysounds.length + stoneyWay.length}`);
  process.exit(1);
}
