#!/usr/bin/env node
/**
 * verify:content — per-page content-presence assertions.
 *
 * The design is new, so visual diffing against production is meaningless: every
 * page is *supposed* to look different. This check replaces what visual diffing
 * used to catch for free — "the page exists but half the content vanished".
 *
 * Expectations are recorded per page as the page is migrated (MW-7 / MW-8).
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

  const pages = loadJson('contentExpectations').pages || [];
  if (pages.length === 0) {
    return report.skip(
      'per-page content presence',
      'verify/content-expectations.json has zero pages',
      ARTIFACTS.contentExpectations.issue,
    );
  }

  const { set } = indexDist();
  const problems = [];
  let checked = 0;

  for (const page of pages) {
    const file = resolveRoute(page.url, set);
    if (!file) {
      problems.push(`${page.url}: not in build output`);
      continue;
    }

    const html = readDistFile(file);
    const text = stripTags(html);
    checked += 1;

    for (const heading of page.headings || []) {
      if (!text.includes(heading)) problems.push(`${page.url}: missing heading "${heading}"`);
    }

    for (const needle of page.contains || []) {
      if (!text.includes(needle)) problems.push(`${page.url}: missing text "${needle.slice(0, 40)}"`);
    }

    if (typeof page.minTextLength === 'number' && text.length < page.minTextLength) {
      problems.push(`${page.url}: text ${text.length} chars < expected ${page.minTextLength}`);
    }

    if (typeof page.images === 'number') {
      const actual = countMatches(html, /<img\b/gi);
      if (actual !== page.images) problems.push(`${page.url}: ${actual} images, expected ${page.images}`);
    }

    if (typeof page.embeds === 'number') {
      const actual = countMatches(html, /<iframe\b/gi) + countMatches(html, /data-embed-facade/gi);
      if (actual !== page.embeds) problems.push(`${page.url}: ${actual} embeds, expected ${page.embeds}`);
    }

    for (const href of page.links || []) {
      if (!html.includes(href)) problems.push(`${page.url}: missing link ${href}`);
    }
  }

  if (problems.length) {
    report.fail(
      'content survived migration',
      `${problems.length} problems across ${pages.length} pages — first 5: ${problems.slice(0, 5).join(' | ')}`,
    );
  } else {
    report.pass('content survived migration', `${checked} pages asserted`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-content.mjs')) {
  runStandalone('verify:content', checkContent);
}
