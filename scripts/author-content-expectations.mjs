#!/usr/bin/env node
/**
 * Author verify/content-expectations.json (MW-7 / MW-8).
 *
 * The design is new, so visual diffing against production is meaningless. This
 * is what replaces it: per page, the headings, the body length, the images, the
 * embeds and the external links that must still be there. "The page exists but
 * half the content vanished" is the failure mode it exists to catch.
 *
 * ── Why this script was rewritten ─────────────────────────────────────────────
 *
 * The previous version filtered every candidate heading through the build:
 *
 *     if (builtText.includes(h)) headings.push(h); else missed.push(...)
 *
 * A heading absent from the build was therefore absent from the expectation
 * file, so verify:content could not fail on it. The assertion set was filtered
 * by the thing it asserts. 55 of 95 pages ended up asserting zero headings —
 * every Collect card page, /lab, /tree, /resume, /eng-feedback, /helix-diagram
 * among them — and `minTextLength` was 90% of the *build*, a floor under the
 * migrated page rather than the production one, so it could never detect that
 * the migration had lost text. Multiple content regressions shipped green.
 *
 * Nothing in this file now reads dist/ to decide what to assert. dist/ is read
 * only at the end, to print an audit of which assertions the current build does
 * not satisfy. Deleting dist/ changes the audit output and not one expectation.
 *
 * ── Where the expectations come from ──────────────────────────────────────────
 *
 * `routes/manifest.production.json` carries a real fingerprint per production
 * route: headings, imageCount, iframeCount, outboundLinks, textLength,
 * textSha256. That is the authority.
 *
 * The manifest fingerprint is whole-page, though: it includes the legacy theme's
 * header, nav, sidebar, footer, Disqus section and cookie banner, none of which
 * was ported. Asserting it verbatim would assert chrome. So the read-only legacy
 * `_site/` builds one directory up are used as a secondary baseline: they
 * reproduce production's `textSha256` exactly for 275 of the 307 production page
 * routes, which makes them production's own HTML for those pages. The chrome
 * regions are removed from that HTML by name — see CHROME below — and the
 * fingerprint is recomputed on what is left. Every page records which regions
 * were removed and why, so a reader can see what is not being asserted.
 *
 * Where the legacy build does not reproduce production byte-for-byte the page is
 * still used, and marked `legacy-site-approximate` with both lengths recorded.
 * Where no legacy file exists at all the page falls back to the whole-page
 * manifest fingerprint, marked `manifest-whole-page`, and says so.
 *
 * ── The only things deliberately not asserted ─────────────────────────────────
 *
 * 1. CHROME — the theme regions listed below, per page, by name.
 * 2. NORMALISATIONS — the three text rules in `normaliseHeading`, applied to
 *    every page and stated in the file.
 * 3. PER-PAGE EXCLUSIONS — the explicit table in EXCLUSIONS, each with a reason
 *    and the ledger entry that decided it. Nothing is filtered out silently:
 *    an exclusion that stops applying is reported as a stale exclusion.
 *
 * `minTextLength` is TEXT_FRACTION of production's *body* length. It is not a
 * floor under the build.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';
import { mainContent } from './verify-content.mjs';

const PAGES = join(ROOT, 'src/content/pages');

/** Read-only legacy checkouts. Never written to. */
const LEGACY_SITE = {
  'maar.world': join(ROOT, '..', 'maar.world-site', '_site'),
  'collect.maar.world': join(ROOT, '..', 'collect.maar.world', '_site'),
  'tree.maar.world': join(ROOT, '..', 'tree.maar.world', '_site'),
};

/** Body text must be at least this share of production's body text. */
const TEXT_FRACTION = 0.85;

/**
 * Legacy-theme chrome regions removed before fingerprinting production.
 *
 * Each is a whole element removed with its subtree. These are the parts of the
 * production page that were deliberately not ported, so asserting them would
 * assert a decision already taken rather than the content of the page.
 */
const CHROME = [
  ['site-header', 'div', /<div\b[^>]*class="[^"]*\bpage__header\b[^"]*"[^>]*>/gi,
    'site header and primary nav — BaseLayout ships no nav; the page shell is MW-11'],
  ['site-footer', 'div', /<div\b[^>]*class="[^"]*\bpage__footer\b[^"]*"[^>]*>/gi,
    'site footer — same MW-11 shell decision'],
  ['sidebar-toc', 'div', /<div\b[^>]*class="[^"]*\bpage__sidebar\b[^"]*"[^>]*>/gi,
    'theme sidebar table of contents — navigation, generated from the headings it lists'],
  ['sidebar-toggle', 'div', /<div\b[^>]*class="[^"]*\bpage__actions\b[^"]*"[^>]*>/gi,
    'the sidebar open/close button — a control, and its label is a Material Symbols glyph'],
  ['aside-toc', 'div', /<div\b[^>]*class="[^"]*\bcol-aside\b[^"]*"[^>]*>/gi,
    'in-article table of contents column — navigation generated from the headings'],
  ['disqus', 'section', /<section\b[^>]*class="[^"]*\bpage__comments\b[^"]*"[^>]*>/gi,
    'Disqus comments mount — a third-party embed the on-load gate forbids'],
  ['cookie-banner', 'div', /<div\b[^>]*id="cookie-notice"[^>]*>/gi,
    'cookie banner and consent panel — their absence is the design (OPERATING-RULES invariant)'],
  ['search-modal', 'div', /<div\b[^>]*class="[^"]*\bpage__search-modal\b[^"]*"[^>]*>/gi,
    'theme search modal — application JavaScript, allowed only in the helix island'],
  ['prev-next', 'div', /<div\b[^>]*class="[^"]*\barticle__section-navigator\b[^"]*"[^>]*>/gi,
    'previous/next article navigator — navigation chrome'],
  ['article-meta', 'div', /<div\b[^>]*class="[^"]*\barticle__info\b[^"]*"[^>]*>/gi,
    'the date and tag chips the theme printed under every title — theme metadata, not page content'],
  ['article-footer-div', 'div', /<div\b[^>]*class="[^"]*\barticle__footer\b[^"]*"[^>]*>/gi,
    'the theme Learn_/Collect_ button pair printed under every article'],
  ['article-footer-el', 'footer', /<footer\b[^>]*class="[^"]*\barticle__footer\b[^"]*"[^>]*>/gi,
    'the theme article footer element — licence and updated-at line'],
];

/**
 * Elements hidden with an inline `display:none`. The theme printed the Jekyll
 * auto-title into `<header style="display:none;"><h1>001_ Maar Sky Sounds.1
 * Card i</h1></header>` on many pages. No reader ever saw it, so it is not
 * content the migration was obliged to keep.
 */
const HIDDEN_OPEN = /<(div|header|section|span|p|ul|ol|nav|aside|figure)\b[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>/i;

const HIDDEN_REASON =
  'elements with an inline display:none — chiefly the theme\'s hidden Jekyll auto-title <h1>, ' +
  'which no reader ever saw';

/**
 * Per-page exclusions. Each states what is not asserted, how much of it, and
 * why. Applied only where it still bites: an exclusion that no longer changes
 * the expectation is printed as stale, so this table cannot rot into a filter
 * that quietly suppresses a new regression.
 */
const EXCLUSIONS = [
  {
    url: '/collect/cards',
    kind: 'images',
    count: 34,
    reason:
      'production renders 34 card thumbnails and every one is a www.dropbox.com URL. ' +
      'Restoring them takes the on-load third-party reference count verify:links reports ' +
      'from 75 to 109. Ledger MW-8 collect/cards-covers (BLOCKED): self-host the 34 ' +
      'thumbnails or accept the exception.',
  },
  {
    url: '/lab/en/ip-orchestra',
    kind: 'images',
    count: 1,
    reason:
      '/img/about/Bruna.jpeg is referenced by production and exists in no read-only ' +
      'checkout — it is a broken image in production too. Ledger MW-7 pages/dead-legacy-img.',
  },
  {
    url: '/lab/es/ip-orchestra',
    kind: 'images',
    count: 1,
    reason:
      '/img/about/Bruna.jpeg is referenced by production and exists in no read-only ' +
      'checkout — it is a broken image in production too. Ledger MW-7 pages/dead-legacy-img.',
  },
  {
    url: '/radio',
    kind: 'images',
    count: 1,
    reason:
      'the Mailchimp eep.io logo. Serving it fires a third-party request on page load, ' +
      'which the no-analytics / no-cookie-banner invariant forbids.',
  },
  {
    url: '/subscribe',
    kind: 'images',
    count: 1,
    reason:
      'the Mailchimp eep.io logo. Serving it fires a third-party request on page load, ' +
      'which the no-analytics / no-cookie-banner invariant forbids.',
  },
  {
    url: '/tree',
    kind: 'images',
    count: 1,
    reason:
      'the Tree hub image is hotlinked from herbarium.plantasia.space — a third-party ' +
      'request on page load — and the asset is in no read-only checkout, so it cannot be ' +
      'self-hosted here. Ledger MW-8 tree/sunflower-image (BLOCKED): needs the file or an ' +
      'exception.',
  },
  {
    url: '/collect/cards/034_-maar-sky-sounds-wild-card',
    kind: 'embeds',
    count: 1,
    reason:
      'production\'s only iframe on the wild card is <iframe src=""> — an empty player ' +
      'that loads nothing. There is no embed to preserve.',
  },
];

// ── HTML helpers ─────────────────────────────────────────────────────────────

/** Same text extraction verify:content and freeze-routes.mjs use. */
const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const decodeEntities = (s) =>
  s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/');

/**
 * Remove every element matching `openRe`, with its subtree, by counting
 * open/close tags of `tagName`. A regex cannot match balanced tags, and a
 * non-greedy `[\s\S]*?</div>` would stop at the first nested close and leave
 * the rest of the chrome behind — which is how chrome text leaks into a
 * "body-only" figure and quietly inflates the length being asserted.
 */
function stripElement(html, openRe, tagName) {
  let out = html;
  for (let guard = 0; guard < 200; guard += 1) {
    const re = new RegExp(openRe.source, 'gi');
    const open = re.exec(out);
    if (!open) return out;

    const scan = new RegExp(`<(/?)${tagName}\\b`, 'gi');
    scan.lastIndex = open.index + open[0].length;
    let depth = 1;
    let end = out.length;
    let m;
    while ((m = scan.exec(out))) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        const close = out.indexOf('>', m.index);
        end = close === -1 ? out.length : close + 1;
        break;
      }
    }
    out = `${out.slice(0, open.index)} ${out.slice(end)}`;
  }
  return out;
}

/** Remove every inline-hidden element. Returns [html, removedCount]. */
function stripHidden(html) {
  let out = html;
  let removed = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const m = HIDDEN_OPEN.exec(out);
    if (!m) break;
    const before = out.length;
    out = stripElement(out, new RegExp(escapeRe(m[0]), 'g'), m[1]);
    if (out.length >= before) break;
    removed += 1;
  }
  return [out, removed];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The three text rules applied to every production heading, and the only ones.
 *
 * 1. Material Symbols spans. `<h1><span class="material-symbols-outlined">
 *    speaker_group</span> Bookings</h1>` reached a reader as a glyph plus
 *    "Bookings". The font is banned here, so "speaker_group Bookings" is not a
 *    string any reader ever saw. Handled before tag stripping.
 * 2. Markdown emphasis marks left in raw headings.
 * 3. A trailing colon. Production's "Card I:" and the migrated "Card I" are the
 *    same heading; the colon is punctuation joining it to the text below.
 */
const NORMALISATIONS = [
  'material-symbols icon spans removed — they rendered as a glyph, and the font is banned here',
  'markdown emphasis marks (* and `) removed',
  'a single trailing colon removed',
];

function normaliseHeading(inner) {
  const withoutIcons = inner.replace(
    /<span\b[^>]*material-symbols[^>]*>[\s\S]*?<\/span>/gi,
    ' ',
  );
  return stripTags(withoutIcons)
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')
    .trim();
}

/** Fingerprint one page's body — chrome removed, comments removed. */
function bodyFingerprint(html) {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const regions = [];

  for (const [name, tag, re] of CHROME) {
    const before = out.length;
    out = stripElement(out, re, tag);
    if (out.length !== before && !regions.includes(name)) regions.push(name);
  }

  const [visible, hiddenCount] = stripHidden(out);
  out = visible;
  if (hiddenCount) regions.push(`hidden-elements x${hiddenCount}`);

  const headings = [];
  for (const m of out.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const h = normaliseHeading(m[2]);
    if (h && !headings.includes(h)) headings.push(h);
  }

  const links = new Set();
  for (const m of out.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1].trim()).split('#')[0];
    if (/^https?:\/\//i.test(href)) links.add(href);
  }

  const text = stripTags(out);
  return {
    headings,
    images: (out.match(/<img\b/gi) || []).length,
    embeds: (out.match(/<iframe\b/gi) || []).length,
    links: [...links].sort(),
    textLength: text.length,
    excludedRegions: regions,
  };
}

/**
 * Links on the same property. The migration rewrote every one of them to a
 * merged-site path, so the production spelling is not a string the build can
 * contain, and asserting it would assert the merge had not happened.
 */
const OWN_PROPERTY = /^https?:\/\/([a-z0-9-]+\.)*(maar\.world)(\/|$)/i;

// ── Production baseline ──────────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(ROOT, 'routes/manifest.production.json'), 'utf8'));
const policy = JSON.parse(readFileSync(join(ROOT, 'routes/policy.json'), 'utf8'));
const byRoute = new Map(manifest.routes.map((r) => [`${r.origin}${r.url}`, r]));

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Merged-site URL -> the production route that answers it today.
 *
 * Joined through the policy's `servedAt`, percent-decoded on both sides: the
 * Collect card URLs are recorded as `/cards/001_-...card%20I` in the policy and
 * as `.../card I` in the page frontmatter, and the un-decoded join silently
 * missed all 34 of them. Both spellings of a URL are the same document, so the
 * larger fingerprint wins.
 */
const production = new Map();
for (const r of policy.routes) {
  if (r.policy !== 'preserve' || !r.servedAt) continue;
  const prod = byRoute.get(`${r.origin}${r.url}`);
  if (!prod || prod.kind !== 'page' || prod.status !== 200) continue;
  const url = decode(r.servedAt.replace(/\.html$/i, '').replace(/\/index$/, '')) || '/';
  const prev = production.get(url);
  if (!prev || prod.textLength > prev.route.textLength) {
    production.set(url, { route: prod, origin: r.origin, legacyUrl: r.url });
  }
}

/** The legacy build file that answers a production URL, or null. */
function legacyFile(origin, url) {
  const base = LEGACY_SITE[origin];
  if (!base) return null;
  const p = decode(url.split('?')[0].split('#')[0]);
  const candidates =
    p === '/' ? ['index.html'] : p.endsWith('/') ? [`${p.slice(1)}index.html`]
      : [p.slice(1), `${p.slice(1)}.html`, `${p.slice(1)}/index.html`];
  for (const c of candidates) {
    const f = join(base, c);
    try {
      if (statSync(f).isFile()) return f;
    } catch { /* not this candidate */ }
  }
  return null;
}

const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── Author ───────────────────────────────────────────────────────────────────

const usedExclusions = new Set();
const pages = [];

/**
 * The page set is PRODUCTION's, not the migration's.
 *
 * Deriving it from src/content/pages meant a page the migration never wrote had
 * no expectation and therefore could not fail — the same shape of hole as
 * filtering headings through the build. Every URL the policy says is preserved
 * and that production answers with a page gets an entry here, whether or not
 * anything in this repo currently produces it. That is what put the 35 NFC card
 * pages under this check: they are generated from routes/nfc-cards.json rather
 * than from src/content/pages, so a file-driven page set skipped all of them.
 */
for (const url of [...production.keys()].sort()) {
  const prod = production.get(url);
  const file = legacyFile(prod.origin, prod.legacyUrl);
  let baseline = 'manifest-whole-page';
  let fp = null;
  let legacyTextLength = null;

  if (file) {
    const html = readFileSync(file, 'utf8');
    legacyTextLength = stripTags(html).length;
    baseline =
      sha16(stripTags(html)) === prod.route.textSha256
        ? 'legacy-site-exact'
        : 'legacy-site-approximate';
    fp = bodyFingerprint(html);
  }

  const excl = EXCLUSIONS.filter((e) => e.url === url);
  const applied = [];
  const take = (kind, value) => {
    const e = excl.find((x) => x.kind === kind);
    if (!e) return value;
    usedExclusions.add(`${e.url}|${e.kind}`);
    applied.push({ kind, count: e.count, reason: e.reason });
    return Math.max(0, value - e.count);
  };

  const headings = fp ? fp.headings : prod.route.headings.map((h) => normaliseHeading(h)).filter(Boolean);
  const rawLinks = fp ? fp.links : prod.route.outboundLinks || [];
  const links = rawLinks.filter((l) => !OWN_PROPERTY.test(l));
  const bodyTextLength = fp ? fp.textLength : prod.route.textLength;

  pages.push({
    url,
    production: {
      origin: prod.origin,
      url: prod.legacyUrl,
      baseline,
      textLength: prod.route.textLength,
      textSha256: prod.route.textSha256,
      ...(legacyTextLength !== null && baseline === 'legacy-site-approximate'
        ? { legacySiteTextLength: legacyTextLength }
        : {}),
      bodyTextLength,
      headings: prod.route.headings.length,
      bodyHeadings: headings.length,
      imageCount: prod.route.imageCount,
      iframeCount: prod.route.iframeCount,
      outboundLinks: (prod.route.outboundLinks || []).length,
    },
    excludedRegions: fp ? fp.excludedRegions : [],
    excludedPerPage: applied,
    ownPropertyLinksNotAsserted: rawLinks.length - links.length,
    headings,
    minTextLength: Math.floor(bodyTextLength * TEXT_FRACTION),
    images: take('images', fp ? fp.images : prod.route.imageCount),
    embeds: take('embeds', fp ? fp.embeds : prod.route.iframeCount),
    links,
  });
}

/**
 * Migrated pages that no preserved production route serves. Reported, not
 * asserted: there is no production fingerprint to assert them against. A page
 * appearing here is either a new page or a broken servedAt join, and both are
 * worth a human look.
 */
const withoutProduction = [];
for (const name of readdirSync(PAGES).sort()) {
  if (!name.endsWith('.md') && !name.endsWith('.mdx')) continue;
  const outputPath =
    (/^outputPath:\s*"(.*)"$/m.exec(readFileSync(join(PAGES, name), 'utf8')) || [])[1];
  if (!outputPath) continue;
  const url = `/${outputPath.replace(/(^|\/)index$/, '')}`.replace(/\/(?=$)/, '') || '/';
  if (!production.has(url)) withoutProduction.push(url);
}

const stale = EXCLUSIONS.filter((e) => !usedExclusions.has(`${e.url}|${e.kind}`));

const headingsAsserted = pages.reduce((n, p) => n + p.headings.length, 0);
const imagesAsserted = pages.reduce((n, p) => n + (p.images || 0), 0);
const embedsAsserted = pages.reduce((n, p) => n + (p.embeds || 0), 0);
const linksAsserted = pages.reduce((n, p) => n + (p.links || []).length, 0);

const baselines = {};
for (const p of pages) {
  const k = p.production ? p.production.baseline : 'none';
  baselines[k] = (baselines[k] ?? 0) + 1;
}

writeFileSync(
  join(ROOT, 'verify/content-expectations.json'),
  `${JSON.stringify(
    {
      note:
        'Per-page content-presence assertions for the migrated pages (MW-7 / MW-8). ' +
        'Every figure here is derived from PRODUCTION — routes/manifest.production.json, ' +
        'refined by the read-only legacy _site builds that reproduce its textSha256 — and ' +
        'never from dist/. An earlier version filtered each candidate heading through the ' +
        'build and kept only the ones that survived, which made verify:content structurally ' +
        'incapable of failing; regenerating this file must never consult the build again. ' +
        'headings, images, embeds and links are what production serves, minus the legacy ' +
        'theme chrome named per page in excludedRegions and minus the per-page exclusions ' +
        'named in excludedPerPage. minTextLength is a fraction of PRODUCTION body text, ' +
        'not of the build. Regenerate with scripts/author-content-expectations.mjs.',
      authoredAt: new Date().toISOString(),
      derivedFrom: 'routes/manifest.production.json',
      legacyBaseline:
        'the read-only _site builds in ../maar.world-site, ../collect.maar.world and ' +
        '../tree.maar.world, used only where they reproduce the frozen production ' +
        'fingerprint; each page records which, under production.baseline',
      textFraction: TEXT_FRACTION,
      headingNormalisations: NORMALISATIONS,
      chromeExcluded: [
        ...CHROME.map(([region, , , reason]) => ({ region, reason })),
        { region: 'hidden-elements', reason: HIDDEN_REASON },
        { region: 'html-comments', reason:
          'HTML comments. The theme shipped a commented-out <iframe> example on every ' +
          'page, which the whole-page manifest fingerprint counts as a real embed.' },
      ],
      chromeExcludedNote:
        'Each page lists, under excludedRegions, which of these regions its production ' +
        'HTML actually carried and this file therefore does not assert.',
      ownPropertyLinkNote:
        'Links to *.maar.world are not asserted: the migration rewrote them to merged-site ' +
        'paths, so the production spelling cannot appear in the build. Every page records ' +
        'how many it had under ownPropertyLinksNotAsserted.',
      pageCount: pages.length,
      migratedPagesWithoutProduction: withoutProduction.length,
      baselines,
      headingsAsserted,
      imagesAsserted,
      embedsAsserted,
      linksAsserted,
      pages,
    },
    null,
    2,
  )}\n`,
);

// ── Audit against the current build (assertions above do not depend on this) ──

console.log(
  `content-expectations: ${pages.length} pages — ${headingsAsserted} headings, ` +
    `${imagesAsserted} images, ${embedsAsserted} embeds, ${linksAsserted} links asserted`,
);
console.log(`baselines: ${JSON.stringify(baselines)}`);

if (withoutProduction.length) {
  console.log(
    `\nMIGRATED PAGES WITH NO PRODUCTION BASELINE (${withoutProduction.length}) — ` +
      'nothing asserts these:',
  );
  for (const u of withoutProduction) console.log(`  ${u}`);
}
if (stale.length) {
  console.log(`\nSTALE PER-PAGE EXCLUSIONS (${stale.length}) — no longer bite, delete them:`);
  for (const e of stale) console.log(`  ${e.url} (${e.kind})`);
}

const { set } = indexDist();
const failures = [];
for (const page of pages) {
  const file = resolveRoute(page.url, set);
  if (!file) {
    failures.push(`${page.url}: not in build output`);
    continue;
  }
  const html = mainContent(readDistFile(file));
  const text = stripTags(html);
  for (const h of page.headings) if (!text.includes(h)) failures.push(`${page.url}: missing heading "${h}"`);
  if (typeof page.minTextLength === 'number' && text.length < page.minTextLength) {
    failures.push(`${page.url}: text ${text.length} chars < ${page.minTextLength} required`);
  }
  if (typeof page.images === 'number') {
    const n = (html.match(/<img\b/gi) || []).length;
    if (n !== page.images) failures.push(`${page.url}: ${n} images, expected ${page.images}`);
  }
  if (typeof page.embeds === 'number') {
    const n = (html.match(/<iframe\b/gi) || []).length + (html.match(/data-embed-facade/gi) || []).length;
    if (n !== page.embeds) failures.push(`${page.url}: ${n} embeds, expected ${page.embeds}`);
  }
  for (const href of page.links || []) if (!html.includes(href)) failures.push(`${page.url}: missing link ${href}`);
}

if (failures.length) {
  console.log(`\nTHE CURRENT BUILD DOES NOT SATISFY ${failures.length} OF THESE ASSERTIONS:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(
    '\nThese are the expectations, not the build. Fix the migration, or record a reasoned ' +
      'per-page exclusion in EXCLUSIONS — never drop the assertion.',
  );
} else {
  console.log('\nthe current build satisfies every assertion');
}
