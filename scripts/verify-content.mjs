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
import { plainText, mainOf, comparable } from './lib/html-text.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const stripTags = plainText;

const countMatches = (html, re) => (html.match(re) || []).length;

/**
 * The built page's own content region.
 *
 * The production side of every assertion has the legacy theme's header, nav,
 * footer, sidebar and cookie banner removed by name — otherwise the check would
 * assert chrome that was deliberately not ported. The build side has to be
 * measured the same way or the comparison is not like for like: once the site
 * shell landed, its skip link, brand, area nav and footer added text and links
 * to all 133 pages, which raises every page over its minTextLength floor and
 * would mask exactly the body collapse this check exists to catch.
 *
 * `<main>` is the landmark the shell already uses. A page without one is
 * measured whole, which is what every page did before the shell existed.
 */
/** Re-exported so existing importers keep working; the body lives in lib. */
export const mainContent = mainOf;

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
  const excludedText = (page) =>
    (page.excludedPerPage || [])
      .filter((exclusion) => exclusion.kind === 'text')
      .reduce((sum, exclusion) => sum + exclusion.count, 0);
  const wrongFloor = pages.filter((p) => {
    if (!p.production || typeof p.minTextLength !== 'number') return false;
    const expected = Math.floor(Math.max(0, p.production.bodyTextLength - excludedText(p)) * fraction);
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
      `${fraction} × production body length (after explicit text exclusions) on ${pages.length} pages`,
    );
  }

  // ── The build must satisfy them ────────────────────────────────────────────

  const { set } = indexDist();
  const problems = [];
  const byKind = { absent: [], headings: [], text: [], images: [], embeds: [], links: [], contains: [] };
  let checked = 0;

  /**
   * The production strings this rebuild deliberately re-cased — MW-23.
   *
   * Production served these under `text-transform: lowercase` on `body`, or in
   * all caps. The transform is gone and the copy carries its own casing now, so
   * the baseline and the build differ in capitals and in nothing else:
   *
   *   soundscapes & music   → Soundscapes & music    the 33 NFC card pages
   *   spoken word           → Spoken word            the 33 NFC card pages
   *   TERMS AND CONDITIONS  → Terms and Conditions   /collect/docs/mw/terms
   *   MAX BERLIN NETWORK    → Max Berlin Network     /tree/max-network-berlin
   *
   * CLOSED: it may shrink, never grow. Adding a line is the bypass this list
   * exists to make visible.
   */
  const CASING_MIGRATIONS = new Set([
    'soundscapes & music',
    'spoken word',
    'TERMS AND CONDITIONS',
    'MAX BERLIN NETWORK',
  ]);
  /**
   * `casingSeen` is what makes the staleness verdict honest, and it is not the
   * same as "every entry in the list".
   *
   * `verify:selftest` runs this checker against single-page fixtures that
   * assert none of these four strings. Judging an entry stale because THIS run
   * never used it failed those fixtures for a reason that had nothing to do
   * with them. An entry is stale only when a page in this run actually asserted
   * it and matched WITHOUT needing the exception; an entry no page asserted is
   * simply not exercised, and gets no verdict.
   */
  const casingSeen = new Set();
  const casingUsed = new Set();

  for (const page of pages) {
    const file = resolveRoute(page.url, set);
    if (!file) {
      const p = `${page.url}: not in build output`;
      problems.push(p);
      byKind.absent.push(p);
      continue;
    }

    const html = mainContent(readDistFile(file));
    const text = stripTags(html);
    /**
     * The same text with entities decoded, for the two assertions that compare
     * STRINGS rather than lengths. `text` stays the fingerprint form because
     * `minTextLength` is a length taken from production with `plainText`, and
     * decoding would move it. See `comparable` in lib/html-text.mjs.
     */
    const readable = comparable(html);
    checked += 1;

    /**
     * MATCHING IS CASE-SENSITIVE, and the four exceptions are named.
     *
     * MW-23 removed `text-transform: lowercase` from `body` and restored normal
     * casing to the copy, so four strings in the production baseline are now
     * spelled differently in the build. They are listed in CASING_MIGRATIONS
     * above and nowhere else.
     *
     * The list exists instead of folding case globally, which was the first fix
     * and was too blunt: it would have accepted `NFC` → `nfc`, `Helix` → `helix`
     * and every future casing regression in silence — on a branch whose entire
     * subject is casing. A named list makes each intended change reviewable and
     * leaves every unnamed one an error.
     *
     * It is CLOSED, the same way `STRUCTURED_ES` is: it may shrink, never grow.
     * An entry that stops being needed is reported below as stale, so the
     * deletion happens in the same diff as the change that made it unnecessary.
     */
    const matches = (expected) => {
      const c = comparable(expected);
      if (CASING_MIGRATIONS.has(expected)) casingSeen.add(expected);
      if (readable.includes(c)) return true;
      if (!CASING_MIGRATIONS.has(expected)) return false;
      if (!readable.toLowerCase().includes(c.toLowerCase())) return false;
      casingUsed.add(expected);
      return true;
    };

    for (const heading of page.headings || []) {
      if (!matches(heading)) {
        const p = `${page.url}: missing heading "${heading}"`;
        problems.push(p);
        byKind.headings.push(p);
      }
    }

    for (const needle of page.contains || []) {
      if (!matches(needle)) {
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
      // Production supplies a floor: an image disappearing is a content loss;
      // additional first-party artwork is an intentional design addition, not
      // evidence that production content vanished.
      if (actual < page.images) {
        const p = `${page.url}: ${actual} images, expected at least ${page.images}`;
        problems.push(p);
        byKind.images.push(p);
      }
    }

    if (typeof page.embeds === 'number') {
      const actual = countMatches(html, /<iframe\b/gi) + countMatches(html, /data-embed-facade/gi);
      /**
       * A floor, for the same reason images are one, and it was an exact count
       * for no reason anyone wrote down.
       *
       * The question this check asks is "did production content vanish", and a
       * page with MORE embeds than production is not evidence that it did. The
       * owner asked for three videos in MW-9 `content/videos-added` — two Vimeo
       * on /landings, one YouTube on /lab/en and /lab/es/orbits-and-bodies —
       * and all three were reported here as content loss on pages that had
       * gained content.
       *
       * Nothing is given up. An embed DISAPPEARING still fails, which is the
       * regression this exists to catch. The other thing an exact count could
       * be read as guarding — an extra third-party request firing on page load
       * — is verify:links' job, and it polices it by ORIGIN, which is the
       * property that actually matters; a count cannot tell a self-hosted embed
       * from a tracker.
       */
      if (actual < page.embeds) {
        const p = `${page.url}: ${actual} embeds, expected at least ${page.embeds}`;
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

  /**
   * The casing list is reported, not enforced — and the reason is worth stating
   * so nobody "fixes" it into an assertion again.
   *
   * A stale entry is one no page needs any more, and proving that requires the
   * WHOLE expectation set. `verify:selftest` runs this checker against
   * single-page fixtures, one of which asserts "soundscapes & music" in
   * production casing on purpose. Under any automatic staleness rule that
   * fixture declares three of the four entries dead, because its world has one
   * page in it. The rule was written, it failed exactly that way, and it is not
   * worth a page-count heuristic to keep.
   *
   * So the counts are printed on every run instead. The list stays closed by
   * review — the same way `LEGACY_ES` is — and this line is where a reader sees
   * that four permitted exceptions are still four.
   */
  report.pass(
    'casing migrations are declared, not assumed',
    `${casingUsed.size} used, ${casingSeen.size} exercised, ${CASING_MIGRATIONS.size} permitted — ` +
      'closed list: it may shrink, never grow',
  );
}

if (process.argv[1] && process.argv[1].endsWith('verify-content.mjs')) {
  runStandalone('verify:content', checkContent);
}
