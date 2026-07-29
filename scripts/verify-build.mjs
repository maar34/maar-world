#!/usr/bin/env node
/**
 * verify:build — a clean production build that actually produced pages.
 *
 * Runs the real Astro build rather than trusting a previous dist/. If the app
 * does not exist yet (MW-5), this reports SKIP rather than inventing a pass.
 *
 * The exit code and the warning count are not enough on their own. A dist/ in
 * which every page was `<html><head></head><body></body></html>` passed routes,
 * cards, links AND build: four of five checks green on a site with no content
 * anywhere, because nothing looked inside the files. Those assertions are below.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, ROOT, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { bodyText } from './lib/html-text.mjs';

const WARNING_THRESHOLD = 0;

/** A build emitting fewer pages than this is not this site, whatever it built. */
const MIN_HTML_PAGES = 10;

/** Fraction of the frozen preserved paths that must show up as emitted pages. */
const MIN_PAGE_COVERAGE = 0.33;

/** Half the pages must carry at least this much text, or the build is hollow. */
const MIN_MEDIAN_BODY_TEXT = 200;

/** And no more than this share of pages may be near-empty. */
const MAX_THIN_PAGE_SHARE = 0.25;
const THIN_BODY_TEXT = 100;

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
/**
 * Re-exported from lib so the selftest keeps its import. The body of it lives
 * in scripts/lib/html-text.mjs alongside the two other forms, where the ways
 * they differ are written down rather than left to be rediscovered.
 */
export { bodyText };

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Assertions about what the build actually emitted, as opposed to how the build
 * process behaved. Exported so it can be exercised directly.
 */
export function checkBuildOutput(report) {
  if (!has('dist')) {
    return report.fail('the build emitted pages', 'no dist/ after a successful build');
  }

  const { files } = indexDist();
  const pages = files.filter((f) => f.endsWith('.html'));

  if (pages.length < MIN_HTML_PAGES) {
    report.fail('the build emitted a plausible number of pages', `${pages.length} HTML pages (floor ${MIN_HTML_PAGES})`);
  } else if (has('manifest') && has('policy')) {
    const preserved = new Set(
      (loadJson('policy').routes || []).filter((p) => p.policy === 'preserve' && p.servedAt).map((p) => p.servedAt),
    );
    const floor = Math.max(MIN_HTML_PAGES, Math.ceil(preserved.size * MIN_PAGE_COVERAGE));
    if (pages.length < floor) {
      report.fail(
        'the build emitted a plausible number of pages',
        `${pages.length} HTML pages for ${preserved.size} preserved routes (floor ${floor})`,
      );
    } else {
      report.pass(
        'the build emitted a plausible number of pages',
        `${pages.length} HTML pages for ${preserved.size} preserved routes`,
      );
    }
  } else {
    report.pass('the build emitted a plausible number of pages', `${pages.length} HTML pages`);
  }

  const untitled = [];
  const blank = [];
  const lengths = [];

  for (const page of pages) {
    let html = '';
    try {
      html = readDistFile(page);
    } catch {
      blank.push(page);
      continue;
    }
    const title = (TITLE_RE.exec(html) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
    if (!title) untitled.push(page);
    const text = bodyText(html);
    lengths.push(text.length);
    if (text.length === 0) blank.push(page);
  }

  if (untitled.length) {
    report.fail(
      'every emitted page has a non-empty <title>',
      `${untitled.length} of ${pages.length} without — first 5: ${untitled.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('every emitted page has a non-empty <title>', `${pages.length} pages`);
  }

  if (blank.length) {
    report.fail(
      'no emitted page is hollow',
      `${blank.length} of ${pages.length} render no body text at all — first 5: ${blank.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('no emitted page is hollow', `${pages.length} pages render body text`);
  }

  const med = median(lengths);
  const thin = lengths.filter((n) => n < THIN_BODY_TEXT).length;
  const thinShare = pages.length ? thin / pages.length : 1;

  if (med < MIN_MEDIAN_BODY_TEXT || thinShare > MAX_THIN_PAGE_SHARE) {
    report.fail(
      'emitted pages carry a substantive amount of text',
      `median ${med} chars (floor ${MIN_MEDIAN_BODY_TEXT}), ` +
        `${thin} of ${pages.length} pages under ${THIN_BODY_TEXT} chars ` +
        `(${Math.round(thinShare * 100)}%, ceiling ${Math.round(MAX_THIN_PAGE_SHARE * 100)}%)`,
    );
  } else {
    const thinnest = pages
      .map((p, i) => [p, lengths[i]])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([p, n]) => `${p} (${n})`);
    report.pass(
      'emitted pages carry a substantive amount of text',
      `median ${med} chars; thinnest: ${thinnest.join(', ')}`,
    );
  }
}

const CONFIGS = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'];

export async function checkBuild(report) {
  const config = CONFIGS.find((f) => existsSync(resolve(ROOT, f)));
  if (!config) {
    return report.skip('production build is clean', 'astro.config.mjs', 'MW-5');
  }
  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    return report.skip('production build is clean', 'node_modules (run npm install)', 'MW-5');
  }

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status !== 0) {
    const tail = output.trim().split('\n').slice(-6).join(' / ');
    return report.fail('production build succeeds', `astro build exited ${result.status}: ${tail}`);
  }
  report.pass('production build succeeds');

  /**
   * Warnings that are correct for the current point in the programme.
   *
   * A collection whose directory is still empty is expected until MW-6/7/8 fill
   * it — the schema is defined, the content has not been migrated yet. This
   * allowlist self-resolves: once content lands the warning stops being emitted,
   * and nothing has to be un-suppressed. Anything not listed here fails.
   */
  const EXPECTED_WARNINGS = [
    /\[glob-loader\].*No files found matching/i,
  ];

  const warnings = output
    .split('\n')
    .filter((l) => /\[WARN\]|\bwarning\b/i.test(l))
    .filter((l) => !/0 warnings/i.test(l))
    .filter((l) => !EXPECTED_WARNINGS.some((re) => re.test(l)));

  if (warnings.length > WARNING_THRESHOLD) {
    report.fail(
      `build warnings at or below ${WARNING_THRESHOLD}`,
      `${warnings.length} warnings — first: ${warnings[0].trim().slice(0, 120)}`,
    );
  } else {
    report.pass(`build warnings at or below ${WARNING_THRESHOLD}`);
  }

  // "It exited 0" is not "it built the site".
  checkBuildOutput(report);
}

if (process.argv[1] && process.argv[1].endsWith('verify-build.mjs')) {
  runStandalone('verify:build', checkBuild);
}
