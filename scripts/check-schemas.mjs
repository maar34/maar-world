#!/usr/bin/env node
/**
 * Exercise the content schemas directly.
 *
 * MW-5 acceptance: "Content schemas reject a card record with a missing
 * required field." A schema that has never been seen to reject anything is not
 * evidence of validation, so this asserts both directions — a good record is
 * accepted, and each specific defect is caught.
 *
 * The card frontmatter has ~20 fields with no validation on the legacy sites and
 * has already silently diverged between two repositories. These are the cases
 * that turn that class of bug into a build failure.
 */

import { SCHEMAS } from '../src/content/schemas.mjs';

const validCard = {
  permalink: '/EBT5599',
  source: 'skysounds',
  suit_title: 'SkySounds.1',
  card_title: 'Card I',
  card_description: 'The north of Maar World is a place where the ground and water sing in harmony.',
  cover: '/img/cards/Thumb_SkySounds_1_1.webp',
  card_image: '/img/cards/SkySounds_1_1.webp',
  player: 'https://play.maar.world/?g=334&s=0&c=1',
  track_v2_id: '6919a2fad44c12045386f4c7',
  noindex: true,
};

const cases = [
  ['accepts a complete card record', 'cards', validCard, true],

  [
    'rejects a card missing a required field (card_title)',
    'cards',
    (() => {
      const c = { ...validCard };
      delete c.card_title;
      return c;
    })(),
    false,
  ],
  [
    'rejects a card missing permalink — the URL is the physical contract',
    'cards',
    (() => {
      const c = { ...validCard };
      delete c.permalink;
      return c;
    })(),
    false,
  ],
  [
    'rejects a card whose noindex is not true',
    'cards',
    { ...validCard, noindex: false },
    false,
  ],
  /**
   * The two cases below are what the self-hosting change is worth keeping.
   * Every card carried a www.dropbox.com card_image until 2026-07-30 — 73
   * on-load third-party requests, the sole verify:links failure. The files are
   * self-hosted now, and these assert that a hotlink cannot come back by
   * someone pasting a URL into frontmatter the way every one of them arrived.
   */
  [
    'rejects a third-party card_image — on-load images are first-party only',
    'cards',
    { ...validCard, card_image: 'https://www.dropbox.com/s/qfzath7lo2pisex/SkySounds_1_1.png?raw=1' },
    false,
  ],
  [
    'rejects a third-party cover — same rule, same reason',
    'cards',
    { ...validCard, cover: 'https://www.dropbox.com/s/annm9o8t07jxrzs/Thumb_SkySounds_1_1.png?raw=1' },
    false,
  ],
  [
    'rejects a hardcoded commerce link on a card',
    'cards',
    { ...validCard, ent_link: 'https://maarworld.gumroad.com/' },
    false,
  ],
  [
    'rejects an unknown field (the divergence that went unnoticed)',
    'cards',
    { ...validCard, mystery_field: 'appeared in one repo only' },
    false,
  ],
  [
    'rejects a permalink containing a space',
    'cards',
    { ...validCard, permalink: '/EBT 5599' },
    false,
  ],
  [
    'rejects an unknown source collection',
    'cards',
    { ...validCard, source: 'somewhere_else' },
    false,
  ],
  // The `genesis`, `lab` and `docs` collections are gone — see
  // .agents/decisions/0001-one-pages-collection.md. A Lab article is a `pages` record
  // with `kind: 'lab'`, and these two cases assert that shape instead.
  [
    'rejects a page without a language',
    'pages',
    { outputPath: 'lab/en/x', title: 'interplanetary players', area: 'maar', kind: 'lab', origin: 'migrated' },
    false,
  ],
  // `origin` decides whether a record authorises its own URL — see
  // authoredRoutes() in verify-routes.mjs. A record that omits it must not
  // build, for the same reason one that omits `lang` must not.
  [
    'rejects a page without an origin',
    'pages',
    { outputPath: 'lab/en/x', title: 'interplanetary players', area: 'maar', kind: 'lab', lang: 'en' },
    false,
  ],
  [
    'rejects an origin that is neither migrated nor authored',
    'pages',
    { outputPath: 'lab/en/x', title: 'x', area: 'maar', kind: 'lab', lang: 'en', origin: 'hand-written' },
    false,
  ],
  [
    'accepts a lab article as a page record',
    'pages',
    { outputPath: 'lab/en/x', title: 'interplanetary players', area: 'maar', kind: 'lab', lang: 'en', origin: 'migrated', tags: ['EN'] },
    true,
  ],
  [
    'accepts a page carrying a translationKey',
    'pages',
    {
      outputPath: 'lab/es/cultura-compartida',
      title: 'cultura compartida',
      area: 'maar',
      kind: 'lab',
      lang: 'es',
      origin: 'migrated',
      translationKey: '2026-01-07-music-access-human-mind',
    },
    true,
  ],
  [
    'rejects a page in an unknown area',
    'pages',
    { title: 'about', area: 'elsewhere' },
    false,
  ],
  /**
   * MW-19: a family that draws the whole page from a field must have the field.
   *
   * Without this the record builds, publishes and renders EMPTY — the family
   * takes it out of the route's default branch and then has nothing to draw.
   * Both directions, because a conditional rule that fires on everything is as
   * broken as one that fires on nothing: the 156 records that declare no family
   * must stay valid without carrying the copy.
   */
  [
    'rejects a collect-family page with no collect copy',
    'pages',
    { outputPath: 'collect/index', title: 'collect', area: 'collect', kind: 'index', lang: 'en', origin: 'migrated', family: 'collect' },
    false,
  ],
  [
    'accepts a collect-family page that carries its copy',
    'pages',
    {
      outputPath: 'collect/index',
      title: 'collect',
      area: 'collect',
      kind: 'index',
      lang: 'en',
      origin: 'migrated',
      family: 'collect',
      collect: {
        pitch: { title: 'a', body: 'b', cta: 'c' },
        orbiters: { label: 'd' },
        journey: { title: 'e', carouselLabel: 'f', slides: [{ step: 'I', caption: 'g' }] },
      },
    },
    true,
  ],
  [
    'a page declaring no family needs no collect copy',
    'pages',
    { outputPath: 'about', title: 'about', area: 'maar', kind: 'page', lang: 'en', origin: 'migrated' },
    true,
  ],
];

let failed = 0;
console.log('\ncontent schema checks\n');

for (const [name, collection, value, shouldPass] of cases) {
  const result = SCHEMAS[collection].safeParse(value);
  const ok = result.success === shouldPass;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    const detail = result.success
      ? 'expected rejection, was accepted'
      : `expected acceptance, was rejected: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

const widthDefault = SCHEMAS.pages.safeParse({
  outputPath: 'layout-contract-proof',
  title: 'layout contract proof',
  area: 'maar',
  kind: 'page',
  lang: 'en',
  origin: 'authored',
});
if (widthDefault.success && widthDefault.data.contentWidth === 'standard') {
  console.log('  PASS  defaults every page to the shared standard content width');
} else {
  failed += 1;
  console.log('  FAIL  defaults every page to the shared standard content width');
}

console.log(`\n  ${cases.length + 1 - failed}/${cases.length + 1} schema cases passed\n`);
process.exit(failed ? 1 : 0);
