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
import { createHash } from 'node:crypto';
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

/**
 * `track_v2_id` per permalink.
 *
 * This is what drives the Orbiter forward: production card pages return 200 and
 * then send the visitor to `orbiter.plantasia.space/?trackId=<track_v2_id>`.
 * Exactly the cards carrying a track id forward; the wild card and STW3344 do
 * not. Freezing the ids here makes that behaviour checkable against the build
 * instead of trusted.
 */
function trackIdsIn(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(join(dir, file), 'utf8');
    const p = /^permalink:\s*(\S+)\s*$/m.exec(raw);
    const t = /^track_v2_id:\s*(\S+)\s*$/m.exec(raw);
    if (p && t) out.set(p[1], t[1]);
  }
  return out;
}

/**
 * Per-card content expectations, frozen from the legacy source.
 *
 * Emitting 35 files with `noindex` and a plausible byte count proves nothing
 * about WHICH card is on which URL. Swapping two cards' descriptions, or
 * pointing EBT5599 at DJX9483's player, is invisible to a size check — and a
 * card page whose media belongs to another card is exactly the failure a
 * physical, unchangeable URL cannot recover from.
 *
 * So freeze, per code:
 *
 *  - `title`        `suit_title` + `card_title`. Jekyll derived the document
 *                   title from the filename ("001_ Maar Sky Sounds.1 Card_i"),
 *                   which is ugly but distinct per card; this is the same
 *                   distinction in readable form. Deliberately NOT `titles.en`,
 *                   which _stoney_way carries as a copy of EBT5599's.
 *  - `players`      every play.maar.world URL in the source file, deduped.
 *  - `downloads`    every dl.dropboxusercontent.com URL in the source file.
 *  - `descriptionSha256`  a fingerprint of `card_description`, so the text can
 *                   be asserted without duplicating a 1200-character paragraph
 *                   into a route contract.
 *
 * URLs are scanned across the WHOLE file, not just frontmatter: most records
 * are rendered by `_layouts/card.html` from frontmatter, but the wild card and
 * the Stoney Way card carry literal media links in their bodies. Scanning the
 * whole file captures what the page actually renders in both shapes.
 *
 * MW-6's acceptance criterion — "every card's play.maar.world link matches the
 * frozen manifest baseline" — is this file plus the assertions in
 * verify-cards.mjs that read it.
 */
const MEDIA_URL_RE = /https:\/\/(?:play\.maar\.world|dl\.dropboxusercontent\.com)\/[^\s"'<>)]+/g;

function fingerprint(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
}

function cardExpectationsIn(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(join(dir, file), 'utf8');

    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const head = fm ? fm[1] : '';
    // Single-line scalars, unquoted, sometimes with stray trailing whitespace
    // (`player: https://play.maar.world/?g=400&s=0&c=0 `). Take the rest of the
    // line and trim; an empty value means the field is absent, which is how
    // the wild card spells "no download".
    const field = (key) => {
      const m = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(head);
      return m && m[1] ? m[1] : undefined;
    };

    const permalink = field('permalink');
    if (!permalink) continue;

    const urls = [...new Set(raw.match(MEDIA_URL_RE) || [])];
    const suit = field('suit_title');
    const cardTitle = field('card_title');
    const description = field('card_description');

    out.set(permalink, {
      title: suit && cardTitle ? `${suit} ${cardTitle}` : undefined,
      descriptionSha256: description ? fingerprint(description) : undefined,
      players: urls.filter((u) => u.startsWith('https://play.maar.world/')).sort(),
      downloads: urls.filter((u) => u.startsWith('https://dl.dropboxusercontent.com/')).sort(),
    });
  }

  return out;
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
const trackIds = new Map([
  ...trackIdsIn(join(MAAR, 'collections/_skysounds')),
  ...trackIdsIn(join(MAAR, 'collections/_stoney_way')),
]);

const expectations = new Map([
  ...cardExpectationsIn(join(MAAR, 'collections/_skysounds')),
  ...cardExpectationsIn(join(MAAR, 'collections/_stoney_way')),
]);

const cardRecords = [
  ...skysounds.map((p) => ({ code: p.slice(1), source: 'skysounds', permalink: p })),
  ...stoneyWay.map((p) => ({ code: p.slice(1), source: 'stoney_way', permalink: p })),
]
  .map((c) => (trackIds.has(c.permalink) ? { ...c, orbiterTrackId: trackIds.get(c.permalink) } : c))
  .map((c) => (expectations.has(c.permalink) ? { ...c, expect: expectations.get(c.permalink) } : c))
  .sort((a, b) => a.code.localeCompare(b.code));

// A frozen expectation that is identical for two codes cannot detect a swap
// between them — the whole point of freezing. Titles must be distinct.
const frozenTitles = cardRecords.map((c) => c.expect?.title).filter(Boolean);
const duplicateTitles = frozenTitles.filter((t, i) => frozenTitles.indexOf(t) !== i);

writeFileSync(
  resolve(ROOT, 'routes/nfc-cards.json'),
  `${JSON.stringify(
    {
      note: 'The 35 NFC card codes printed on physical cards. Each resolves as both /CODE and /CODE.html — 70 URLs — never redirected, byte-for-byte stable in spelling and casing. Changing anything here breaks physical objects already in people’s hands.',
      generatedFrom: 'maar.world-site/collections/{_skysounds,_stoney_way} (read-only), verified against live HTTP',
      cardCount: cardRecords.length,
      orbiterForwardCount: cardRecords.filter((c) => c.orbiterTrackId).length,
      urlFormCount: cardRecords.length * 2,
      expectNote:
        'Per-card content frozen from the legacy source so verify:cards can assert that each built page carries ITS OWN card — its title, its description, its play.maar.world players and its downloads — not merely that some content exists. descriptionSha256 is sha256(card_description) truncated to 32 hex chars.',
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

console.log(`  nfc expectations: ${cardRecords.filter((c) => c.expect).length} cards with frozen content`);

if (skysounds.length + stoneyWay.length !== 35) {
  console.error(`\nREFUSING: expected 35 NFC codes, found ${skysounds.length + stoneyWay.length}`);
  process.exit(1);
}

if (cardRecords.some((c) => !c.expect?.title || !c.expect?.descriptionSha256)) {
  const bad = cardRecords.filter((c) => !c.expect?.title || !c.expect?.descriptionSha256);
  console.error(`\nREFUSING: ${bad.length} card(s) have no frozen title/description: ${bad.map((c) => c.code).join(', ')}`);
  process.exit(1);
}

if (duplicateTitles.length) {
  console.error(`\nREFUSING: frozen card titles are not distinct: ${[...new Set(duplicateTitles)].join(', ')}`);
  process.exit(1);
}
