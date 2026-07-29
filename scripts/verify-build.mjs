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

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, ROOT, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { bodyText, dropCode } from './lib/html-text.mjs';

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

  checkProseCoverage(report, pages);
}

/**
 * Elements that appear in a rendered body and correctly have no rhythm rule.
 *
 * Every entry is a decision with a reason, which is the point: the assertion
 * below is that no element reaches a reader's page without someone having made
 * one. Adding a tag here is allowed and is not a way of silencing the check —
 * it is the other half of it.
 */
const PROSE_EXEMPT = new Map([
  // Phrasing content. It flows inside a block that already carries the rhythm;
  // giving it margins of its own would break the line, not space it.
  ['a', 'inline'], ['span', 'inline'], ['strong', 'inline'], ['em', 'inline'],
  ['b', 'inline'], ['i', 'inline'], ['small', 'inline'], ['sub', 'inline'],
  ['sup', 'inline'], ['abbr', 'inline'], ['cite', 'inline'], ['time', 'inline'],
  ['br', 'inline'], ['wbr', 'inline'], ['u', 'inline'], ['s', 'inline'],
  ['del', 'inline'], ['ins', 'inline'], ['mark', 'inline'], ['q', 'inline'],
  ['bdi', 'inline'], ['bdo', 'inline'], ['kbd', 'inline'], ['samp', 'inline'],
  ['var', 'inline'], ['dfn', 'inline'], ['ruby', 'inline'], ['rt', 'inline'],
  ['rp', 'inline'], ['picture', 'inline'], ['source', 'inline'],
  // Grouping boxes that carry no rhythm of their own: their children do. Giving
  // a bare <div> a margin would double every gap in a nested legacy body.
  ['div', 'transparent container'], ['section', 'transparent container'],
  ['article', 'transparent container'], ['header', 'transparent container'],
  ['footer', 'transparent container'], ['main', 'transparent container'],
  ['aside', 'transparent container'], ['nav', 'transparent container'],
  ['tbody', 'table internals'], ['thead', 'table internals'],
  ['tfoot', 'table internals'], ['tr', 'table internals'],
  ['colgroup', 'table internals'], ['col', 'table internals'],
  ['caption', 'table internals'], ['template', 'never rendered'],
  ['noscript', 'never rendered when scripting is on'],
  // Drawn elsewhere, deliberately, and named here so "no rule in prose.css" is
  // not mistaken for "no rule anywhere".
  ['button', 'styles/button.css'], ['input', 'styles/button.css'],
  ['textarea', 'styles/button.css'], ['select', 'styles/button.css'],
  ['label', 'styles/button.css'], ['form', 'styles/button.css'],
  ['fieldset', 'styles/button.css'], ['legend', 'styles/button.css'],
  ['option', 'styles/button.css'], ['optgroup', 'styles/button.css'],
  ['svg', 'vector, sized by its own attributes'], ['path', 'inside <svg>'],
  ['g', 'inside <svg>'], ['circle', 'inside <svg>'], ['ellipse', 'inside <svg>'],
  ['rect', 'inside <svg>'], ['line', 'inside <svg>'], ['polygon', 'inside <svg>'],
  ['polyline', 'inside <svg>'], ['defs', 'inside <svg>'], ['use', 'inside <svg>'],
  ['title', 'inside <svg>'], ['desc', 'inside <svg>'], ['text', 'inside <svg>'],
  ['tspan', 'inside <svg>'], ['clippath', 'inside <svg>'], ['mask', 'inside <svg>'],
  ['lineargradient', 'inside <svg>'], ['stop', 'inside <svg>'],
  ['meta', 'not rendered'], ['link', 'not rendered'], ['script', 'not rendered'],
  ['style', 'not rendered'], ['param', 'not rendered'], ['track', 'not rendered'],
  ['embed', 'legacy media, contained by the object/iframe rule'],
  // The one approved island's hydration wrapper. It is a zero-size custom
  // element around markup that IS styled, not a box of its own.
  ['astro-island', 'Astro hydration wrapper for the Helix island'],
  ['astro-slot', 'Astro hydration wrapper for the Helix island'],
  ['summary', 'no accordion ships yet — add a rule with one'],
  ['details', 'no accordion ships yet — add a rule with one'],
]);

/** Tags that `src/styles/prose.css` writes a `.prose <tag>` rule for. */
export function proseStyledTags(css) {
  const tags = new Set();
  for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const sel of rule[1].split(',')) {
      const m = /\.prose\s+([a-z][a-z0-9]*)\b/i.exec(sel.trim());
      if (m) tags.add(m[1].toLowerCase());
    }
  }
  return tags;
}

/** Every tag rendered inside a `.prose` body, mapped to a page that has it. */
export function proseTagsInBuild(pages, read) {
  const found = new Map();
  for (const page of pages) {
    const html = read(page);
    const open = /<div class="prose"[^>]*>/i.exec(html);
    if (!open) continue;
    // Script and style CONTENTS are not markup: Astro's hydration runtime
    // contains the literal string "<unknown>", which is not an element on the
    // page. Same definition the text helpers use, imported rather than repeated.
    const body = dropCode(html.slice(open.index + open[0].length));
    // Hyphens included, so a custom element is reported as `astro-island` and
    // not truncated to `astro` — a truncated name cannot be looked up honestly.
    for (const m of body.matchAll(/<([a-z][a-z0-9-]*)\b/gi)) {
      const tag = m[1].toLowerCase();
      if (!found.has(tag)) found.set(tag, page);
    }
  }
  return found;
}

/**
 * THE CHECK THAT EXISTS BECAUSE OF THE h1 BUG.
 *
 * `styles/prose.css` gives every page body its vertical rhythm, and it was
 * written as a hand-kept list of elements. `h1` was left off it. 61 page titles
 * shipped with `margin: 0` on both sides, and on a display face set below 1.0
 * the descenders of the last line fell into the paragraph underneath.
 *
 * Nothing could have caught that, because nothing compared the list to what the
 * bodies actually contain. This does: every element rendered inside `.prose`
 * must either have a rule in prose.css or an entry in PROSE_EXEMPT giving the
 * reason it does not need one. Delete the `h1` rule and this fails.
 *
 * It is deliberately about COVERAGE and not about values — it cannot know that
 * --s-12 is the right space under a title. What it guarantees is that the
 * decision was made at all, which is the failure mode that actually happened.
 */
function checkProseCoverage(report, pages) {
  const found = proseTagsInBuild(pages, readDistFile);

  /**
   * Nothing rendered a body, so there is nothing to have decided about. This is
   * a SKIP and not a pass: the assertion did not run, and `npm run verify`
   * prints skips separately precisely so that is not read as completeness. In
   * this repo it never fires — every build emits 96 of them — but a fixture
   * exercising other assertions should not have to carry a stylesheet.
   */
  if (found.size === 0) {
    return report.skip('every element in a body has a rhythm decision', 'no .prose body in the build', 'n/a');
  }

  const cssPath = resolve(ROOT, 'src/styles/prose.css');
  if (!existsSync(cssPath)) {
    return report.fail(
      'every element in a body has a rhythm decision',
      `${found.size} distinct elements are rendered in .prose bodies and src/styles/prose.css is missing`,
    );
  }
  const styled = proseStyledTags(readFileSync(cssPath, 'utf8'));

  const undecided = [...found].filter(([tag]) => !styled.has(tag) && !PROSE_EXEMPT.has(tag));

  if (undecided.length) {
    report.fail(
      'every element in a body has a rhythm decision',
      `${undecided.length} undecided: ` +
        undecided.slice(0, 6).map(([tag, page]) => `<${tag}> (${page})`).join(', ') +
        ' — give it a rule in src/styles/prose.css, or an entry in PROSE_EXEMPT saying why it needs none',
    );
    return;
  }

  report.pass(
    'every element in a body has a rhythm decision',
    `${found.size} distinct elements across ${pages.length} pages — ` +
      `${[...found.keys()].filter((t) => styled.has(t)).length} styled, ` +
      `${[...found.keys()].filter((t) => PROSE_EXEMPT.has(t)).length} exempt with a stated reason`,
  );
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
