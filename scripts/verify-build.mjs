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

  checkInteractiveMarkupIsDriven(report, pages);

  checkProseCoverage(report, pages);
  checkComponentClassCoverage(report, pages);
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
  ['marker', 'arrowhead definition inside <svg>'],
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
/**
 * MARKUP THAT NEEDS A SCRIPT MUST SHIP THE SCRIPT — MW-19.
 *
 * ── The failure this exists to catch ─────────────────────────────────────────
 *
 * `[...page].astro` decides which pages load `ui/CarouselScript` and
 * `ui/EmbedConsentScript`, and it decided by matching `class="carousel"` and
 * `data-embed-provider` against the record's BODY. That was sound while every
 * carousel and facade on the site was raw HTML inside a body. It stopped being
 * sound the moment MW-19 started moving markup into components: a converted body
 * says `<Carousel />`, which those patterns do not match, so the page emitted a
 * carousel and no script to drive it.
 *
 * IT HAPPENED TWICE IN ONE ISSUE. First when `collect/index` moved into a page
 * family, then again when `ip-orchestra` became `.mdx` — two dead carousels,
 * both language halves, and the whole suite green both times. A track that does
 * not move looks exactly like a track waiting to be swiped.
 *
 * ── Why the assertion is here and not a better regex ─────────────────────────
 *
 * The detector in the route was widened both times, and would need widening
 * again for the next way of writing a carousel. That is a list of spellings, and
 * a list of spellings is what has now failed twice. This asserts the PROPERTY
 * instead — if the built HTML contains the markup, the built HTML must reference
 * the script — so the next new spelling fails loudly on the page that used it,
 * whatever it is called.
 *
 * ── How a script is looked for ───────────────────────────────────────────────
 *
 * NOT by filename, and the reason is worth stating because the first cut of this
 * check got it wrong and reported sixteen false failures. Astro emits a script
 * one of two ways depending on its size: `ui/CarouselScript` is big enough to
 * become `/_assets/CarouselScript.<hash>.js`, so its module name survives in the
 * `src`; `ui/EmbedConsentScript` is small enough that Astro INLINES it, and then
 * no filename exists anywhere on the page.
 *
 * So each rule names a string that is in the script's own SOURCE and survives
 * minification — a class name the script writes, or an attribute it reads — and
 * the check looks for it inside `<script>` blocks and `src` attributes alike.
 * That works whichever way Astro decides to emit it, and it keeps working when
 * a bundle crosses the inlining threshold, which is not a decision this repo
 * makes or can see.
 */
const DRIVEN_MARKUP = [
  {
    what: 'a carousel',
    /* The root selector `ui/CarouselScript` queries. */
    markup: /class="carousel"/,
    /* Emitted as a separate bundle today; `carousel__viewport` is the element it
       creates, and would still be found if it were ever inlined. */
    script: /CarouselScript|carousel__viewport/,
    /**
     * A carousel of one is not driven, deliberately: the script skips a track
     * with fewer than two slides, so a page holding one would fail an assertion
     * that took no notice. There are none today; the rule is stated so that one
     * does not read as a defect later.
     */
    skip: (html) => (html.match(/carousel__slide/g) || []).length < 2,
  },
  {
    what: 'an embed facade the consent gate opens',
    /**
     * ONLY the facades the gate actually handles.
     *
     * Not every facade is gated, and that is deliberate: `ui/EmbedConsentScript`
     * skips a provider it does not know — "forms, calendar and the radio stream
     * stay click-out" — so `/radio`'s `provider="external"` facade is a plain
     * link by design and correctly ships nothing. An assertion that ignored the
     * provider reported both radio pages as broken.
     *
     * The provider list is READ OUT OF THE GATE'S OWN SOURCE rather than copied
     * here, because a copied list is the defect this whole issue is about. See
     * `gatedProviders()`.
     */
    markup: () => {
      const providers = gatedProviders();
      /* No gate in this tree — a fixture. Match nothing rather than everything. */
      return providers ? new RegExp(`data-embed-provider="(?:${providers.join('|')})"`) : /(?!)/;
    },
    /* Inlined by Astro, so there is no filename. `embed-facade__poster` is the
       class the gate puts on the button it builds — a string from the script's
       own source, not from the page's markup. */
    script: /EmbedConsentScript|embed-facade__poster/,
  },
  {
    what: 'a version switch whose closed panel holds a frame',
    /**
     * The fieldset `ui/VersionSwitchScript` queries. A switch WITHOUT a frame in
     * either panel would need no script at all — but there is no such switch, and
     * asserting the simple thing is what catches the page that grows one. The
     * failure this guards is silent: a closed panel's iframe loads at 0×0 and
     * stays that size when the panel opens, which looks like a broken app rather
     * than like a missing script.
     */
    markup: /class="version-switch"/,
    /* Inlined by Astro, so there is no filename to match. `parkedSrc` is the
       dataset key the script writes — a string from its own source, and not one
       that appears in any markup. */
    script: /VersionSwitchScript|parkedSrc/,
  },
  {
    what: 'a PDF embed the reader upgrades',
    /**
     * THE ONE DRIVEN THING ON THIS SITE THAT HAD NO ASSERTION BEHIND IT.
     *
     * `ui/PdfViewerScript` queries `.pdf-embed` and replaces the authored
     * `<object>` with a PDF.js reader. `[...page].astro` decided which pages
     * load it by matching the class against the record BODY — the identical
     * arrangement that shipped two dead carousels, and it was still standing
     * here after both of those were fixed, simply because no page had moved its
     * PDF into a component yet. `media/PdfEmbed` is the first, so the rule is
     * added with it rather than after the third failure.
     *
     * The authored `<object>` is a real fallback, so a page missing the script
     * is not blank — it is the legacy strip-of-document rendering that
     * `prose.css` describes, which is exactly the kind of failure that looks
     * fine in a screenshot and is why this is asserted rather than eyeballed.
     */
    markup: /class="[^"]*\bpdf-embed\b/,
    /* pdfjs-dist is far past the inlining threshold, so the module name is in a
       `src`. `pdf-viewer__control` is a class the script writes and would still
       be found if it ever were inlined. */
    script: /PdfViewerScript|pdf-viewer__control/,
  },
];

/**
 * The providers `ui/EmbedConsentScript` knows how to open, read from that file.
 *
 * Derived, never copied: the route decides which pages load the gate using the
 * same list, and a third handwritten copy here would be exactly the "one concept
 * spelled in several places" that MW-19 exists to remove.
 *
 * It THROWS if it parses nothing. A check whose input can quietly become empty
 * is a check that passes by asserting nothing — the failure verify:content
 * documents at length — and an empty list here would make the facade rule match
 * no page at all while still reporting a cheerful pass.
 */
let GATED_PROVIDERS = null;
function gatedProviders() {
  if (GATED_PROVIDERS) return GATED_PROVIDERS;
  const gate = resolve(ROOT, 'src/components/ui/EmbedConsentScript.astro');
  /**
   * ABSENT is not the same as UNPARSEABLE, and the two need opposite answers.
   *
   * A selftest fixture is a dist/ and a handful of files in a temp directory; it
   * has no `src/` at all, and the facade rule simply does not apply to it. A
   * missing gate therefore means "not this build", and the rule stands down.
   *
   * A gate that EXISTS and yields no providers is a broken parse in the real
   * repo, and that throws — see below. The distinction is the whole point: the
   * quiet failure to avoid is the rule matching nothing while reporting a pass.
   */
  if (!existsSync(gate)) return null;
  const src = readFileSync(gate, 'utf8');
  const block = /const PROVIDERS[^=]*=\s*\{([\s\S]*?)\n  \};/.exec(src);
  /* The quotes are optional and one key needs them: `'google-calendar'` is not a
     bare identifier. A pattern that assumed bare keys found three of the four
     and would have let a calendar page through ungated. */
  const names = block
    ? [...block[1].matchAll(/^ {4}'?([a-z][\w-]*)'?:\s*\{/gim)].map((m) => m[1])
    : [];
  if (!names.length) {
    throw new Error(
      'verify:build could not read the provider list out of ui/EmbedConsentScript.astro. ' +
        'The facade assertion depends on it; fix the parse rather than letting the check pass empty.',
    );
  }
  GATED_PROVIDERS = names;
  return names;
}

/** Everything the page executes: inline script bodies plus every script `src`. */
const scriptSurface = (html) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1] + m[2])
    .join('\n');

function checkInteractiveMarkupIsDriven(report, pages) {
  const undriven = [];
  let checked = 0;

  for (const page of pages) {
    let html;
    try {
      html = readDistFile(page);
    } catch {
      continue;
    }
    const scripts = scriptSurface(html);
    for (const rule of DRIVEN_MARKUP) {
      /* A rule's markup test may be a function, for the facade rule that has to
         read the gate's provider list rather than hardcode it. */
      const markup = typeof rule.markup === 'function' ? rule.markup() : rule.markup;
      if (!markup.test(html)) continue;
      if (rule.skip?.(html)) continue;
      checked += 1;
      /* Matched against the SCRIPT SURFACE and not the whole document, so a
         page cannot satisfy this with the marker appearing in its own markup. */
      if (!rule.script.test(scripts)) {
        undriven.push(`${page}: renders ${rule.what} and ships no script to drive it`);
      }
    }
  }

  if (undriven.length) {
    report.fail(
      'markup that needs a script ships the script',
      `${undriven.length}: ${undriven.slice(0, 6).join('; ')} — ` +
        'widen the test in src/pages/[...page].astro that decides which pages load it',
    );
  } else {
    report.pass(
      'markup that needs a script ships the script',
      `${checked} carousel/facade page(s) carry their driver`,
    );
  }
}

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

/**
 * COMPONENT CLASSES THE CODE EMITS, AGAINST THE RULES THE STYLESHEET DEFINES.
 *
 * This is the third instance of one failure mode and the reason it is now one
 * mechanism rather than three checks. Twice this codebase has shipped a
 * correspondence held between two files by hand:
 *
 *   prose.css listed h2-h6 and skipped h1 — 61 titles with no space beneath.
 *   mark.mjs interpolates `mark--tilt-${n}`; mark.css defines 1-4 one at a time.
 *
 * Card.astro now does the same thing with `card--${variant}`, and the tilt set
 * is still an open owner decision, so the counts most likely to change are
 * exactly the ones nothing was watching. A component class that renders with no
 * rule is silent: the text is unchanged, no page is hollow, contrast passes.
 *
 * Each entry is a prefix and the stylesheet that owes it rules. Adding a
 * component means adding a line here, which is the point — the alternative is
 * remembering, and remembering is what failed twice.
 */
const COMPONENT_CLASSES = [
  { prefix: 'mark', css: 'src/styles/mark.css' },
  { prefix: 'card', css: 'src/styles/card.css' },
  { prefix: 'carousel', css: 'src/styles/carousel.css' },
  /* media/EmbedPlate. Drawn in legacy.css beside the facade rules it sits under,
     because it is only ever rendered under a facade — see the rule's own note. */
  { prefix: 'embed-plate', css: 'src/styles/legacy.css' },
  /**
   * patterns/VersionSwitch. Added late, and the delay is the argument for this
   * list: the component shipped with `version-switch__tab` restated at a
   * specificity `.prose label` beat, so the two tabs rendered as monospaced
   * captions through a build whose stylesheet read correctly. This check does
   * not catch that one — the class HAS a rule — but the sibling class that gets
   * a name and no rule is the same mistake one step further on, and the list's
   * whole point is that it is not remembered.
   */
  { prefix: 'version-switch', css: 'src/styles/version-switch.css' },
];

/**
 * Dead theme class names that collide with our component vocabulary.
 *
 * This list replaced a location test, and the reason is worth keeping. The
 * first version skipped `.prose` bodies entirely, on the theory that component
 * classes never appear inside content. That was wrong in both directions:
 * `mark--cut` and friends ARE written into bodies by migrate-pages.mjs — so 46
 * marked headings went unchecked — and ui/carousel is emitted into bodies too.
 * Location was a proxy for authorship, and it was the wrong proxy.
 *
 * Authorship is the real test, and the collision set is small, closed and
 * derivable: these are the only class names in `src/content/**` that match a
 * component prefix and are NOT written by us. Every one belongs to the dead
 * Jekyll theme, is drawn as nothing by legacy.css, and goes when that file does.
 */
const THEME_COLLISIONS = new Set([
  'card',            // collect/index.md — a bandcamp promo block
  'card--clickable', // collect/index.md
  'card__content',   // collect/docs/ent-cards.md and two others
  'card__header',    // collect/docs/ent-cards.md and one other
  'card__image',     // collect/docs/ent-cards.md and two others
]);

function checkComponentClassCoverage(report, pages) {
  const rendered = new Map();
  for (const page of pages) {
    const html = dropCode(readDistFile(page));
    for (const m of html.matchAll(/class="([^"]*)"/g)) {
      for (const cls of m[1].split(/\s+/)) {
        if (!cls) continue;
        const owner = COMPONENT_CLASSES.find(
          (c) => cls === c.prefix || cls.startsWith(`${c.prefix}--`) || cls.startsWith(`${c.prefix}__`),
        );
        if (owner && !THEME_COLLISIONS.has(cls) && !rendered.has(cls)) rendered.set(cls, { page, owner });
      }
    }
  }

  if (rendered.size === 0) {
    return report.skip('every component class rendered has a rule', 'none in the build', 'n/a');
  }

  const defined = new Map();
  for (const { css } of COMPONENT_CLASSES) {
    const abs = resolve(ROOT, css);
    if (!existsSync(abs)) continue;
    for (const m of readFileSync(abs, 'utf8').matchAll(/\.([A-Za-z][\w-]*)/g)) defined.set(m[1], css);
  }

  const orphans = [...rendered].filter(([cls]) => !defined.has(cls));
  if (orphans.length) {
    report.fail(
      'every component class rendered has a rule',
      `${orphans.length} rendered with no rule: ` +
        orphans.slice(0, 6).map(([c, { page, owner }]) => `.${c} (${page}, owed by ${owner.css})`).join(', ') +
        ' — the code emits it and the stylesheet does not draw it',
    );
    return;
  }

  report.pass(
    'every component class rendered has a rule',
    `${rendered.size} distinct classes across ${COMPONENT_CLASSES.length} components, all drawn`,
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
