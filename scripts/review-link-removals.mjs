#!/usr/bin/env node
/**
 * links:review-removals — record which baseline external links are allowed to
 * be gone from the build.
 *
 * The external-link baseline was a one-way ratchet: only links that appeared
 * were compared against it, so a build with ZERO external links reported
 * "PASS — no unreviewed external links introduced". Deleting every outbound
 * link on the site was invisible.
 *
 * Removals are often correct — the Google Fonts, unpkg and analytics links are
 * supposed to disappear, that is the whole point of the migration — so this is
 * not a check, it is the place where a human says so once. It prints every URL
 * it is about to bless, grouped by host, and writes them per URL so the diff is
 * reviewable. Anything that vanishes afterwards without being listed here fails
 * verify:links.
 *
 *     npm run links:review-removals            show what would be recorded
 *     npm run links:review-removals -- --write record it
 */

import { writeFileSync } from 'node:fs';
import { has, loadJson } from './lib/artifacts.mjs';
import { REMOVALS_PATH, REMOVALS_REL, loadReviewedRemovals, scanBuild, thirdPartyOnly } from './verify-links.mjs';

/**
 * Hosts whose disappearance is required by the invariants, not a regression:
 * no analytics, no third-party fonts, no CDN scripts, and none of the comment
 * widgets and badge services that came with the legacy blog theme. A link to
 * one of these vanishing is the migration working.
 */
const INTENDED_REMOVAL_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.fontawesome.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdn.bootcdn.net',
  'cdnjs.cloudflare.com',
  'analytics.google.com',
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'disqus.com',
  'www.addthis.com',
  'www.addtoany.com',
  'travis-ci.org',
  'img.shields.io',
  'gitalk.github.io',
  'valine.js.org',
  'leancloud.cn',
  'mermaidjs.github.io',
  'www.chartjs.org',
  'eep.io',
]);

const hostOf = (url) => {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
  } catch {
    return '(unparseable)';
  }
};

if (!has('dist')) {
  console.error('links:review-removals — no dist/ to compare against; run npm run build first');
  process.exit(1);
}
if (!has('linkBaseline')) {
  console.error('links:review-removals — no external link baseline (MW-4) to compare against');
  process.exit(1);
}

const write = process.argv.includes('--write');
const { external } = scanBuild();
const baseline = loadJson('linkBaseline');
const baselineThirdParty = thirdPartyOnly(baseline.urls || []);
const disappeared = baselineThirdParty.filter((u) => !external.has(u)).sort();

const previous = loadReviewedRemovals();
const previouslyBlessed = new Set((previous && previous.removed) || []);
const newlyGone = disappeared.filter((u) => !previouslyBlessed.has(u));
const back = [...previouslyBlessed].filter((u) => external.has(u)).sort();

const byHost = new Map();
for (const u of disappeared) {
  const h = hostOf(u);
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(u);
}

console.log('\nlinks:review-removals');
console.log('-'.repeat(64));
console.log(`  baseline third-party links : ${baselineThirdParty.length}`);
console.log(`  present in the build       : ${baselineThirdParty.length - disappeared.length}`);
console.log(`  absent from the build      : ${disappeared.length}`);
console.log(`  already reviewed           : ${disappeared.length - newlyGone.length}`);
console.log(`  NEW this run               : ${newlyGone.length}`);
if (back.length) console.log(`  recorded as removed but back in the build: ${back.length}`);

console.log('\n  absent, by host:');
for (const [host, urls] of [...byHost.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const isNew = urls.filter((u) => !previouslyBlessed.has(u)).length;
  console.log(`    ${String(urls.length).padStart(4)}  ${host}${isNew ? `  (${isNew} new)` : ''}`);
}

if (newlyGone.length) {
  console.log('\n  new this run:');
  for (const u of newlyGone.slice(0, 40)) console.log(`    - ${u}`);
  if (newlyGone.length > 40) console.log(`    - ... ${newlyGone.length - 40} more`);
}

if (!write) {
  console.log(
    `\n  nothing written. Re-run with --write to record these as reviewed removals in ${REMOVALS_REL}.` +
      '\n  Every URL listed above is a link a visitor could follow in production today and will not' +
      '\n  be able to follow after launch. Read the list before recording it.\n',
  );
  process.exit(0);
}

writeFileSync(
  REMOVALS_PATH,
  `${JSON.stringify(
    {
      note:
        'Baseline external links that are deliberately absent from the build. Reviewed by a human ' +
        'via npm run links:review-removals -- --write. verify:links fails on any baseline link that ' +
        'disappears without being listed here, which is what stops the external-link baseline from ' +
        'being a one-way ratchet.',
      reviewedAt: new Date().toISOString(),
      generator: 'scripts/review-link-removals.mjs',
      basedOn: 'verify/external-links-baseline.json',
      removedCount: disappeared.length,
      byHost: Object.fromEntries(
        [...byHost.entries()].sort((a, b) => b[1].length - a[1].length).map(([h, u]) => [h, u.length]),
      ),
      pendingHumanReviewNote:
        'Removals on hosts the invariants require to disappear (analytics, third-party fonts, CDN ' +
        'scripts, legacy blog-theme widgets) are settled. The hosts below carry content — a track, a ' +
        'paper, a profile — and their absence is recorded here so it is visible, not because anyone ' +
        'has confirmed the content was meant to go. Confirming them belongs to MW-9.',
      pendingHumanReview: Object.fromEntries(
        [...byHost.entries()]
          .filter(([h]) => !INTENDED_REMOVAL_HOSTS.has(h))
          .sort((a, b) => b[1].length - a[1].length)
          .map(([h, u]) => [h, u.length]),
      ),
      removed: disappeared,
    },
    null,
    2,
  )}\n`,
);

console.log(`\n  wrote ${REMOVALS_REL} — ${disappeared.length} reviewed removals\n`);
