#!/usr/bin/env node
/**
 * verify:cards — the physical-card contract.
 *
 * 35 NFC codes are printed on physical cards already in people's hands. Each must
 * resolve as BOTH `/CODE` and `/CODE.html` — 70 URLs — with correct content,
 * `noindex` intact, never redirected, byte-for-byte stable in spelling and casing.
 *
 * If something can only pass by changing one of these URLs, the answer is no.
 *
 * Two subtleties this check exists to catch:
 *
 *  1. 34 codes come from `_skysounds`, but a 35th (`STW3344`) comes from
 *     `_stoney_way`. An inventory built by reading only `_skysounds/` silently
 *     drops a real card.
 *  2. macOS filesystems are case-insensitive. `existsSync('/ebt5599.html')` is
 *     true for a file named `EBT5599.html`, so casing is compared against an
 *     exact directory listing instead.
 */

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { cardUrlForms } from './lib/routes.mjs';

const EXPECTED_TOTAL = 35;
const EXPECTED_BY_SOURCE = { skysounds: 34, stoney_way: 1 };
const NOINDEX_RE = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i;

export async function checkCards(report) {
  if (!has('cards')) {
    return report.skip('35 NFC card codes frozen', ARTIFACTS.cards.rel, ARTIFACTS.cards.issue);
  }

  const data = loadJson('cards');
  const cards = data.cards || [];
  const codes = cards.map((c) => c.code);

  // --- Inventory ---------------------------------------------------------
  if (cards.length !== EXPECTED_TOTAL) {
    report.fail(`exactly ${EXPECTED_TOTAL} card codes`, `found ${cards.length}`);
  } else {
    report.pass(`exactly ${EXPECTED_TOTAL} card codes`);
  }

  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupes.length) report.fail('card codes are unique', `duplicates: ${[...new Set(dupes)].join(', ')}`);
  else report.pass('card codes are unique');

  for (const [source, expected] of Object.entries(EXPECTED_BY_SOURCE)) {
    const actual = cards.filter((c) => c.source === source).length;
    if (actual !== expected) {
      report.fail(`${expected} card(s) from ${source}`, `found ${actual}`);
    } else {
      report.pass(`${expected} card(s) from ${source}`);
    }
  }

  if (!codes.includes('STW3344')) {
    report.fail('STW3344 present', 'the _stoney_way card is missing — inventory was built from _skysounds only');
  } else {
    report.pass('STW3344 present');
  }

  // --- All 70 URL forms enumerated in the manifest, never redirected ------
  if (!has('manifest') || !has('policy')) {
    report.skip('all 70 card URL forms enumerated + never redirected', ARTIFACTS.manifest.rel, ARTIFACTS.manifest.issue);
  } else {
    const routes = loadJson('manifest').routes || [];
    const policies = loadJson('policy').routes || [];
    const liveOnMaar = new Set(routes.filter((r) => r.origin === 'maar.world' && r.status === 200).map((r) => r.url));
    const policyByUrl = new Map(policies.filter((p) => p.origin === 'maar.world').map((p) => [p.url, p]));
    const missing = [];
    const redirected = [];

    for (const code of codes) {
      for (const url of cardUrlForms(code)) {
        const policy = policyByUrl.get(url);
        if (!liveOnMaar.has(url) || !policy) missing.push(url);
        else if (policy.policy !== 'preserve') redirected.push(`${url} -> ${policy.policy}`);
        else if (policy.servedAt !== url) redirected.push(`${url} servedAt ${policy.servedAt}`);
      }
    }

    const expectedForms = codes.length * 2;
    if (missing.length) {
      report.fail(
        `all ${expectedForms} card URL forms enumerated in manifest`,
        `${missing.length} missing — first 5: ${missing.slice(0, 5).join(', ')}`,
      );
    } else {
      report.pass(`all ${expectedForms} card URL forms enumerated in manifest`);
    }

    if (redirected.length) {
      report.fail(
        'no card URL is redirected',
        `${redirected.length} non-preserve — first 5: ${redirected.slice(0, 5).join(', ')}`,
      );
    } else {
      report.pass('no card URL is redirected');
    }
  }

  // --- Build output ------------------------------------------------------
  if (!has('dist')) {
    return report.skip('card pages emitted with exact casing + noindex', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set, files } = indexDist();
  const lowerIndex = new Map();
  for (const f of files) {
    const k = f.toLowerCase();
    if (!lowerIndex.has(k)) lowerIndex.set(k, []);
    lowerIndex.get(k).push(f);
  }

  const notEmitted = [];
  const wrongCase = [];
  const noNoindex = [];
  const empty = [];

  for (const code of codes) {
    const expected = `${code}.html`;
    if (set.has(expected)) {
      let html = '';
      try {
        html = readDistFile(expected);
      } catch {
        /* handled by the empty check below */
      }
      if (html.trim().length < 200) empty.push(expected);
      if (!NOINDEX_RE.test(html)) noNoindex.push(expected);
    } else {
      const variants = lowerIndex.get(expected.toLowerCase()) || [];
      if (variants.length) wrongCase.push(`${expected} emitted as ${variants.join('/')}`);
      else notEmitted.push(expected);
    }
  }

  if (notEmitted.length) {
    report.fail(
      'every card code emits <CODE>.html',
      `${notEmitted.length} missing — first 5: ${notEmitted.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('every card code emits <CODE>.html', `${codes.length} files`);
  }

  if (wrongCase.length) {
    report.fail(
      'card filenames are byte-for-byte case-stable',
      `${wrongCase.length} wrong — first 3: ${wrongCase.slice(0, 3).join('; ')}`,
    );
  } else {
    report.pass('card filenames are byte-for-byte case-stable');
  }

  if (empty.length) {
    report.fail('card pages have content', `${empty.length} suspiciously small — first 5: ${empty.slice(0, 5).join(', ')}`);
  } else if (notEmitted.length === 0) {
    report.pass('card pages have content');
  }

  if (noNoindex.length) {
    report.fail(
      'every card page keeps <meta name="robots" content="noindex">',
      `${noNoindex.length} without — first 5: ${noNoindex.slice(0, 5).join(', ')}`,
    );
  } else if (notEmitted.length === 0) {
    report.pass('every card page keeps <meta name="robots" content="noindex">');
  }

  // --- Orbiter forward ---------------------------------------------------
  // Production card pages return 200 and then forward to the Orbiter listening
  // experience via window.location. That is what a physical card scan actually
  // does, and a crawler never sees it because it does not run JavaScript.
  // Exactly the cards carrying a track id forward.
  const forwardWrong = [];
  const forwardMissing = [];
  const forwardUnexpected = [];

  for (const card of cards) {
    const file = `${card.code}.html`;
    if (!set.has(file)) continue;
    let html = '';
    try {
      html = readDistFile(file);
    } catch {
      continue;
    }

    const found = /https:\/\/orbiter\.plantasia\.space\/\?trackId=([a-z0-9]+)/i.exec(html);

    if (card.orbiterTrackId) {
      if (!found) forwardMissing.push(card.code);
      else if (found[1] !== card.orbiterTrackId) {
        forwardWrong.push(`${card.code}: ${found[1]} != ${card.orbiterTrackId}`);
      }
    } else if (found) {
      forwardUnexpected.push(`${card.code} forwards but has no track id`);
    }
  }

  const expectedForwards = cards.filter((c) => c.orbiterTrackId).length;

  if (forwardMissing.length || forwardWrong.length || forwardUnexpected.length) {
    report.fail(
      `${expectedForwards} card pages forward to the correct Orbiter track`,
      [
        forwardMissing.length ? `${forwardMissing.length} missing (${forwardMissing.slice(0, 4).join(', ')})` : '',
        forwardWrong.length ? `${forwardWrong.length} wrong id (${forwardWrong.slice(0, 3).join('; ')})` : '',
        forwardUnexpected.length ? `${forwardUnexpected.length} unexpected (${forwardUnexpected.slice(0, 3).join('; ')})` : '',
      ]
        .filter(Boolean)
        .join(' — '),
    );
  } else {
    report.pass(
      `${expectedForwards} card pages forward to the correct Orbiter track`,
      `${cards.length - expectedForwards} correctly do not forward (no track)`,
    );
  }

  // --- Host fallback -----------------------------------------------------
  // format:'file' emits only CODE.html. The extensionless form is served by the
  // host, so it cannot be proved from build output alone — only by a canary
  // deployed to the real host (MW-10).
  if (!has('hostCanary')) {
    report.skip(
      'extensionless /CODE served by host fallback',
      ARTIFACTS.hostCanary.rel,
      ARTIFACTS.hostCanary.issue,
    );
  } else {
    const canary = loadJson('hostCanary');
    if (canary.extensionlessFallback === true) {
      report.pass('extensionless /CODE served by host fallback', `verified on ${canary.host || 'host'} at ${canary.verifiedAt || 'unknown date'}`);
    } else {
      report.fail(
        'extensionless /CODE served by host fallback',
        'canary says the host does NOT serve /CODE without .html — 35 physical cards would break',
      );
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-cards.mjs')) {
  runStandalone('verify:cards', checkCards);
}
