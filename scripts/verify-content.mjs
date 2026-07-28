#!/usr/bin/env node
/**
 * verify:content — per-page content-presence assertions.
 *
 * The design is new, so visual diffing against production is meaningless: every
 * page is *supposed* to look different. This check replaces what visual diffing
 * used to catch for free — "the page exists but half the content vanished".
 *
 * The expectations live in verify/content-expectations.json and are authored by
 * scripts/author-content-expectations.mjs from routes/manifest.production.json.
 *
 * ── Why this file also checks the expectations ────────────────────────────────
 *
 * The first version of the authoring script filtered every candidate heading
 * through the build and kept only the ones that were already present. The
 * assertion set was therefore a subset of what it asserted, and verify:content
 * was structurally incapable of failing — 55 of 95 pages asserted zero headings,
 * `images`, `embeds`, `links` and `contains` were written on no page at all, and
 * several content regressions shipped green.
 *
 * A check whose input can be silently hollowed out is not a check, so the
 * assertions below run against the expectation file itself as well as against
 * the build: it has to say it came from production, every page has to carry a
 * production baseline, and a page whose production fingerprint has headings may
 * not assert none of them. Those three would all have failed on the old file.
 */

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const stripTags = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countMatches = (html, re) => (html.match(re) || []).length;

/** Print at most `n` lines, then say how many were withheld. */
function list(problems, n = 12) {
  for (const p of problems.slice(0, n)) console.log(`      ${p}`);
  if (problems.length > n) console.log(`      … and ${problems.length - n} more`);
}

export async function checkContent(report) {
  if (!has('contentExpectations')) {
    return report.skip(
      'per-page content presence',
      ARTIFACTS.contentExpectations.rel,
      ARTIFACTS.contentExpectations.issue,
    );
  }
  if (!has('dist')) {
    return report.skip('per-page content presence', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const expectations = loadJson('contentExpectations');
  const pages = expectations.pages || [];
  if (pages.length === 0) {
    return report.skip(
      'per-page content presence',
      'verify/content-expectations.json has zero pages',
      ARTIFACTS.contentExpectations.issue,
    );
  }

  // ── The expectation file must be derived from production ───────────────────

  if (expectations.derivedFrom === ARTIFACTS.manifest.rel) {
    report.pass('expectations derive from production', `derivedFrom: ${expectations.derivedFrom}`);
  } else {
    report.fail(
      'expectations derive from production',
      `derivedFrom is ${JSON.stringify(expectations.derivedFrom)}, expected ` +
        `"${ARTIFACTS.manifest.rel}". An expectation set taken from the build asserts nothing.`,
    );
  }

  const withoutBaseline = pages.filter((p) => !p.production).map((p) => p.url);
  if (withoutBaseline.length) {
    report.fail(
      'every page has a production baseline',
      `${withoutBaseline.length} page(s) assert against nothing: ${withoutBaseline.slice(0, 8).join(', ')}`,
    );
  } else {
    report.pass('every page has a production baseline', `${pages.length} pages`);
  }

  /**
   * Every heading production's body carries must be asserted — not a subset.
   *
   * This is the exact shape of the defect. `bodyHeadings` is the count the
   * authoring script measured on production's own HTML with the named chrome
   * removed; `headings` is the list it wrote. If the two ever differ, something
   * dropped assertions between measuring and writing, which is what filtering
   * each heading through the build did. On the old file 55 of 95 pages asserted
   * zero headings and nothing said so.
   */
  const short = pages
    .filter((p) => p.production && (p.headings || []).length !== p.production.bodyHeadings)
    .map((p) => `${p.url} (asserts ${(p.headings || []).length} of ${p.production.bodyHeadings})`);
  if (short.length) {
    report.fail(
      'every production body heading is asserted',
      `${short.length} page(s) assert fewer headings than production's body carries: ` +
        short.slice(0, 8).join(', '),
    );
  } else {
    report.pass(
      'every production body heading is asserted',
      `${pages.reduce((n, p) => n + (p.headings || []).length, 0)} headings across ${pages.length} pages`,
    );
  }

  /**
   * minTextLength must be a fraction of PRODUCTION body text. If it is ever a
   * fraction of the build again it stops being a floor under the migration and
   * becomes a floor under whatever the migration happened to produce.
   */
  const fraction = expectations.textFraction;
  const wrongFloor = pages.filter((p) => {
    if (!p.production || typeof p.minTextLength !== 'number') return false;
    const expected = Math.floor(p.production.bodyTextLength * fraction);
    return p.minTextLength !== expected;
  });
  if (typeof fraction !== 'number' || fraction <= 0 || fraction > 1) {
    report.fail('minTextLength is a fraction of production body text', `textFraction is ${fraction}`);
  } else if (wrongFloor.length) {
    report.fail(
      'minTextLength is a fraction of production body text',
      `${wrongFloor.length} page(s) do not match ${fraction} × production body length: ` +
        wrongFloor.slice(0, 5).map((p) => p.url).join(', '),
    );
  } else {
    report.pass(
      'minTextLength is a fraction of production body text',
      `${fraction} × production body length on ${pages.length} pages`,
    );
  }

  // ── The build must satisfy them ────────────────────────────────────────────

  const { set } = indexDist();
  const problems = [];
  const byKind = { absent: [], headings: [], text: [], images: [], embeds: [], links: [], contains: [] };
  let checked = 0;

  for (const page of pages) {
    const file = resolveRoute(page.url, set);
    if (!file) {
      const p = `${page.url}: not in build output`;
      problems.push(p);
      byKind.absent.push(p);
      continue;
    }

    const html = readDistFile(file);
    const text = stripTags(html);
    checked += 1;

    for (const heading of page.headings || []) {
      if (!text.includes(heading)) {
        const p = `${page.url}: missing heading "${heading}"`;
        problems.push(p);
        byKind.headings.push(p);
      }
    }

    for (const needle of page.contains || []) {
      if (!text.includes(needle)) {
        const p = `${page.url}: missing text "${needle.slice(0, 40)}"`;
        problems.push(p);
        byKind.contains.push(p);
      }
    }

    if (typeof page.minTextLength === 'number' && text.length < page.minTextLength) {
      const p = `${page.url}: text ${text.length} chars < expected ${page.minTextLength}`;
      problems.push(p);
      byKind.text.push(p);
    }

    if (typeof page.images === 'number') {
      const actual = countMatches(html, /<img\b/gi);
      if (actual !== page.images) {
        const p = `${page.url}: ${actual} images, expected ${page.images}`;
        problems.push(p);
        byKind.images.push(p);
      }
    }

    if (typeof page.embeds === 'number') {
      const actual = countMatches(html, /<iframe\b/gi) + countMatches(html, /data-embed-facade/gi);
      if (actual !== page.embeds) {
        const p = `${page.url}: ${actual} embeds, expected ${page.embeds}`;
        problems.push(p);
        byKind.embeds.push(p);
      }
    }

    for (const href of page.links || []) {
      if (!html.includes(href)) {
        const p = `${page.url}: missing link ${href}`;
        problems.push(p);
        byKind.links.push(p);
      }
    }
  }

  if (problems.length) {
    const pagesAffected = new Set(problems.map((p) => p.split(':')[0])).size;
    const summary = Object.entries(byKind)
      .filter(([, v]) => v.length)
      .map(([k, v]) => `${v.length} ${k}`)
      .join(', ');
    report.fail(
      'content survived migration',
      `${problems.length} problems across ${pagesAffected} of ${pages.length} pages — ${summary}`,
    );
    console.log('    assertions the build does not satisfy:');
    for (const [kind, items] of Object.entries(byKind)) {
      if (!items.length) continue;
      console.log(`    ${kind} (${items.length}):`);
      list(items);
    }
    console.log(
      '    full list: node scripts/author-content-expectations.mjs — it prints every one.',
    );
  } else {
    report.pass('content survived migration', `${checked} pages asserted`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-content.mjs')) {
  runStandalone('verify:content', checkContent);
}
