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
  cover: 'https://www.dropbox.com/s/annm9o8t07jxrzs/Thumb_SkySounds_1_1.png?raw=1',
  card_image: 'https://www.dropbox.com/s/qfzath7lo2pisex/SkySounds_1_1.png?raw=1',
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
  ['accepts a genesis record', 'genesis', { permalink: '/skyl0', key: 'genesis' }, true],
  [
    'rejects a lab article without a language',
    'lab',
    { title: 'interplanetary players', tags: [] },
    false,
  ],
  ['accepts a lab article', 'lab', { title: 'interplanetary players', lang: 'en', tags: ['EN'] }, true],
  [
    'rejects a page in an unknown area',
    'pages',
    { title: 'about', area: 'elsewhere' },
    false,
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

console.log(`\n  ${cases.length - failed}/${cases.length} schema cases passed\n`);
process.exit(failed ? 1 : 0);
