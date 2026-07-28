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

import { createHash } from 'node:crypto';

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { cardUrlForms } from './lib/routes.mjs';

const EXPECTED_TOTAL = 35;
const EXPECTED_BY_SOURCE = { skysounds: 34, stoney_way: 1 };
const NOINDEX_RE = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i;

const PLAYER_URL_RE = /https:\/\/play\.maar\.world\/[^\s"'<>)]+/g;
const DOWNLOAD_URL_RE = /https:\/\/dl\.dropboxusercontent\.com\/[^\s"'<>)]+/g;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const DESCRIPTION_RE = /<p class="description"[^>]*>([\s\S]*?)<\/p>/i;
const IFRAME_TITLE_RE = /<iframe[^>]*\stitle="([^"]*)"/gi;
const DOWNLOAD_LIST_RE = /<ul[^>]*class="download-list"[^>]*>([\s\S]*?)<\/ul>/i;
const ANCHOR_TEXT_RE = /<a[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * HTML entity decode, enough for built markup.
 *
 * Astro escapes `&` in URLs as `&#38;` in attributes and `&amp;` in text, so a
 * frozen `?g=334&s=0&c=1` never matches the raw page byte-for-byte. Decoding
 * first is what makes the frozen baseline comparable to what is served.
 * `&amp;` must be last, or `&amp;#38;` would double-decode.
 */
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const fingerprint = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
const uniqueSorted = (xs) => [...new Set(xs)].sort();
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const onlyIn = (a, b) => a.filter((x) => !b.includes(x));

/**
 * Does `haystack` carry `needle` as a whole title, allowing a site-name suffix
 * or prefix around it?
 *
 * A plain `includes` is not enough here and the failure is silent: "SkySounds.1
 * Card II" contains "SkySounds.1 Card I", so a card showing its neighbour's
 * title would pass. Requiring a non-alphanumeric boundary on both sides keeps
 * the check tolerant of " — Maar World" decoration and intolerant of roman
 * numerals that nest.
 */
function carriesTitle(haystack, needle) {
  if (haystack === needle) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack);
}

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

  // --- Per-card content: each page carries ITS OWN card -------------------
  // "Not empty" is not a content check. 35 pages of plausible size, all with
  // noindex, would stay green if two cards' descriptions were swapped or if
  // every page shipped EBT5599's player. These URLs are printed on physical
  // objects: a card that plays another card's track cannot be recalled.
  //
  // routes/nfc-cards.json freezes, per code, the title, a description
  // fingerprint, the play.maar.world players and the downloads, taken from the
  // legacy source and confirmed against live production. This asserts the built
  // page against its OWN frozen record.
  const withExpectations = cards.filter((c) => c.expect);
  const haveExpectations = withExpectations.length > 0;

  if (!haveExpectations) {
    report.skip(
      'every card has frozen content expectations',
      `${ARTIFACTS.cards.rel} carries no per-card "expect" block (regenerate: node scripts/collect-seeds.mjs)`,
      ARTIFACTS.cards.issue,
    );
  } else if (withExpectations.length !== cards.length) {
    report.fail(
      'every card has frozen content expectations',
      `${cards.length - withExpectations.length} without — regenerate with node scripts/collect-seeds.mjs`,
    );
  } else {
    report.pass('every card has frozen content expectations', `${withExpectations.length} cards`);
  }

  const titleWrong = [];
  const descWrong = [];
  const playersWrong = [];
  const downloadsWrong = [];
  const noJsMissing = [];
  const labelsNotDistinct = [];
  const builtTitles = new Map();

  for (const card of cards) {
    const file = `${card.code}.html`;
    if (!set.has(file)) continue;
    let raw = '';
    try {
      raw = readDistFile(file);
    } catch {
      continue;
    }
    const html = decodeEntities(raw);
    const expect = card.expect || {};

    // Title. Not compared for equality, so a later change to the shared
    // layout's site-name decoration does not turn this into a false alarm — but
    // matched on word boundaries, so "Card II" never satisfies "Card I".
    const titleMatch = TITLE_RE.exec(html);
    const builtTitle = titleMatch ? titleMatch[1].trim() : '';
    builtTitles.set(card.code, builtTitle);
    if (expect.title && !carriesTitle(builtTitle, expect.title)) {
      titleWrong.push(`${card.code}: "${builtTitle}" does not carry "${expect.title}"`);
    }

    // Description.
    const descMatch = DESCRIPTION_RE.exec(html);
    const builtDesc = descMatch ? descMatch[1].trim() : '';
    if (expect.descriptionSha256 && fingerprint(builtDesc) !== expect.descriptionSha256) {
      descWrong.push(card.code);
    }

    // play.maar.world players — MW-6's "matches the frozen manifest baseline".
    const builtPlayers = uniqueSorted(html.match(PLAYER_URL_RE) || []);
    const frozenPlayers = uniqueSorted(expect.players || []);
    if (expect.players && !sameSet(builtPlayers, frozenPlayers)) {
      playersWrong.push(`${card.code}: [${builtPlayers.join(' ')}] != [${frozenPlayers.join(' ')}]`);
    }

    // Downloads.
    const builtDownloads = uniqueSorted(html.match(DOWNLOAD_URL_RE) || []);
    const frozenDownloads = uniqueSorted(expect.downloads || []);
    if (expect.downloads && !sameSet(builtDownloads, frozenDownloads)) {
      const extra = onlyIn(builtDownloads, frozenDownloads);
      const absent = onlyIn(frozenDownloads, builtDownloads);
      downloadsWrong.push(
        `${card.code}: ${extra.length ? `unexpected ${extra.join(' ')}` : ''}${extra.length && absent.length ? ' / ' : ''}${absent.length ? `missing ${absent.join(' ')}` : ''}`,
      );
    }

    // The no-JavaScript route to the Orbiter. The 300ms forward is only half of
    // production's behaviour: it also renders a real anchor and a <noscript>
    // note, which is the ONLY route to the track when JavaScript is restricted
    // (Lockdown Mode, a locked-down in-app webview, a content blocker). A card
    // that forwards must also offer that anchor.
    if (card.orbiterTrackId) {
      const anchor = `href="https://orbiter.plantasia.space/?trackId=${card.orbiterTrackId}"`;
      const reasons = [];
      if (!html.includes(anchor)) reasons.push('no anchor');
      if (!/<noscript>/i.test(html)) reasons.push('no <noscript>');
      if (reasons.length) noJsMissing.push(`${card.code} (${reasons.join(', ')})`);
    }

    // Player and download labels must tell one thing from another. Two iframes
    // sharing a title, or two links both reading "wav", are indistinguishable
    // to a sighted reader and a screen reader alike.
    const iframeTitles = [...html.matchAll(IFRAME_TITLE_RE)].map((m) => m[1].trim());
    if (new Set(iframeTitles).size !== iframeTitles.length) {
      labelsNotDistinct.push(`${card.code}: duplicate iframe titles`);
    }
    const list = DOWNLOAD_LIST_RE.exec(html);
    if (list) {
      const labels = [...list[1].matchAll(ANCHOR_TEXT_RE)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
      if (labels.some((l) => !l)) labelsNotDistinct.push(`${card.code}: an unlabelled download`);
      else if (new Set(labels).size !== labels.length) {
        labelsNotDistinct.push(`${card.code}: duplicate download labels (${labels.join(', ')})`);
      }
    }
  }

  // An assertion that cannot see a frozen expectation has not run. It reports
  // SKIP naming the artifact, never PASS — a green run must never be mistaken
  // for a complete one.
  const reportFrozen = (label, wrong, detailPrefix, sample = 3) => {
    if (!haveExpectations) {
      report.skip(label, `${ARTIFACTS.cards.rel} carries no per-card "expect" block`, ARTIFACTS.cards.issue);
    } else if (wrong.length) {
      report.fail(label, `${wrong.length} ${detailPrefix}: ${wrong.slice(0, sample).join('; ')}`);
    } else {
      report.pass(label, `${withExpectations.length} cards`);
    }
  };

  const reportBuilt = (label, wrong, detailPrefix, sample = 3) => {
    if (wrong.length) report.fail(label, `${wrong.length} ${detailPrefix}: ${wrong.slice(0, sample).join('; ')}`);
    else report.pass(label, `${cards.length} cards`);
  };

  reportFrozen('every card page carries its own title', titleWrong, 'wrong');
  reportFrozen('every card page carries its own description', descWrong, 'wrong', 5);
  reportFrozen('every card page links its own play.maar.world players', playersWrong, 'wrong');
  reportFrozen('every card page links its own downloads', downloadsWrong, 'wrong');

  // These two read the built page alone, so they run with or without a frozen
  // baseline.
  reportBuilt('every forwarding card offers a no-JavaScript route to the Orbiter', noJsMissing, 'without', 5);
  reportBuilt('player and download labels are distinct within a card page', labelsNotDistinct, 'ambiguous');

  const titleValues = [...builtTitles.values()];
  const dupeTitles = titleValues.filter((t, i) => titleValues.indexOf(t) !== i);
  if (dupeTitles.length) {
    report.fail(
      'all 35 card titles are distinct',
      `shared by more than one card: ${[...new Set(dupeTitles)].slice(0, 3).join(' | ')}`,
    );
  } else {
    report.pass('all 35 card titles are distinct', `${titleValues.length} titles`);
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
