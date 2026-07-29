#!/usr/bin/env node
/**
 * Migrate every non-card page from the three legacy sites (MW-7 + MW-8).
 *
 * Driven by the frozen route policy rather than by walking the sources: the
 * contract says which paths must exist, and this script's job is to find the
 * legacy file that serves each one. Anything it cannot match is reported as a
 * gap instead of being quietly skipped — a page missing from the build is a
 * broken URL, and the whole point of the manifest is that those get named.
 *
 * Because the host serves `/x` and `/x.html` from the same `x.html` file, one
 * emitted file satisfies both spellings. The 264 preserved paths therefore
 * collapse to 130 output files (35 of them owned by MW-6, 4 of them PDFs).
 *
 * URLs are never normalised. `/collect/cards/032_-maar-sky-sounds.3-card X `
 * keeps its space and its trailing space, because that is what is live.
 *
 * ── what this does to a legacy body ──────────────────────────────────────
 *
 * Jekyll resolved Liquid; Astro will not, so literal `{{ }}` / `{% %}` may
 * never ship. Every construct actually present in the sources is handled:
 *
 *   {% raw %}…{% endraw %}                unwrapped
 *   {% include extensions/youtube %}      → click-out embed facade
 *   {% include extensions/vimeo %}        → click-out embed facade
 *   {% include article-list.html %}       → `indexOf` frontmatter, rendered by
 *                                            the route from the collection
 *   {% include scripts/lib/swiper.js %}   inside a <script> that is removed
 *   {% assign %}/{% for %}/{% if %}       the home swiper loop, expanded
 *   {{ page.* }} / {{ site.baseurl }}     substituted as Jekyll did
 *
 * `<script>` blocks are dropped: MW-7 requires that no page in this block ships
 * application JavaScript except /helix-diagram.html. `<style>` blocks are
 * dropped with them — they style a theme that no longer exists and carry
 * gradients, blurs and off-palette hexes the design spec forbids outright.
 *
 * Third-party `<iframe>`/`<script>`/`<link>`/`<img>` to hosts outside
 * `*.maar.world` become click-out facades or are removed, because launching
 * with no cookie banner depends on nothing third-party firing on page load.
 * Dropbox card art is the one deliberate exception, inherited from MW-6, and is
 * recorded as BLOCKED in the ledger rather than silently resolved here.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';
import { normaliseHeadingLevels } from './lib/headings.mjs';
import { SCHEMAS } from '../src/content/schemas.mjs';

const LEGACY = join(ROOT, '..');
const SITES = {
  'maar.world': join(LEGACY, 'maar.world-site'),
  'collect.maar.world': join(LEGACY, 'collect.maar.world'),
  'tree.maar.world': join(LEGACY, 'tree.maar.world'),
};
const AREA = { 'maar.world': 'maar', 'collect.maar.world': 'collect', 'tree.maar.world': 'tree' };
const OUT = join(ROOT, 'src/content/pages');

const policy = JSON.parse(readFileSync(join(ROOT, 'routes/policy.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'routes/manifest.production.json'), 'utf8'));
const cardCodes = new Set(
  JSON.parse(readFileSync(join(ROOT, 'routes/nfc-cards.json'), 'utf8')).cards.map((c) => c.code),
);

// ── 1. what the contract requires ────────────────────────────────────────

const ASSET_RE = /\.(pdf|jpe?g|png|gif|mp4|svg|webp|ico|xml|txt|css|js)$/i;

/**
 * Collapse a `servedAt` URL to the page it identifies, plus whether that page
 * has to be emitted as `<dir>/index.html` rather than `<name>.html`.
 *
 * `/tree` and `/tree/index.html` are the same page, but only `tree/index.html`
 * satisfies both — `tree.html` would 404 the second. Getting this wrong emits
 * two files for one page, which is the duplicate the brief forbids.
 */
function pageKeyOf(servedAt) {
  let t = servedAt.replace(/\.html$/i, '');
  let indexForm = servedAt !== t && /(^|\/)index$/.test(t); // ".../index.html"
  if (t === '' || t === '/') return { key: 'index', indexForm: true };
  if (t.endsWith('/')) return { key: decodeURIComponent(t.slice(1, -1)) || 'index', indexForm: true };
  if (/(^|\/)index$/.test(t)) {
    const stem = t.slice(1).replace(/(^|\/)index$/, '');
    return { key: decodeURIComponent(stem.replace(/\/$/, '')) || 'index', indexForm: true };
  }
  return { key: decodeURIComponent(t.slice(1)), indexForm };
}

/** page key -> { origin, urls[], indexForm } */
const targets = new Map();
for (const r of policy.routes) {
  if (r.policy !== 'preserve' || !r.servedAt) continue;
  if (ASSET_RE.test(r.servedAt)) continue;
  if (cardCodes.has(r.servedAt.replace(/^\//, '').replace(/\.html$/i, ''))) continue; // MW-6 owns these

  const { key, indexForm } = pageKeyOf(r.servedAt);
  if (!targets.has(key)) targets.set(key, { origin: r.origin, urls: [], indexForm: false });
  const t = targets.get(key);
  t.urls.push(r.url);
  t.indexForm ||= indexForm;
}

// ── 2. index the legacy sources ──────────────────────────────────────────

/**
 * Minimal YAML-ish frontmatter reader. Legacy frontmatter uses anchors, nested
 * maps and locale blocks that a real parser would choke on less gracefully than
 * this does; only scalar top-level keys are ever needed here.
 */
function parse(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw.trim() };
  const data = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s/.test(line) || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_0-9-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim().replace(/\s+#.*$/, '');

    // Folded and literal block scalars — `excerpt: >` with the text indented
    // underneath. Several Collect pages carry their whole lead paragraph there.
    if (v === '>' || v === '|' || v === '>-' || v === '|-') {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) {
        i += 1;
        if (lines[i].trim()) block.push(lines[i].trim());
      }
      v = block.join(' ');
    }

    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    data[kv[1]] = v;
  }
  return { data, body: m[2].trim() };
}

const SKIP_DIRS = new Set([
  '_site', 'node_modules', '.git', '.jekyll-cache', 'docs', 'test', 'z', 'docker',
  'tools', 'assets', 'img', '_sass', '_includes', '_layouts', '_data', '.github', '.vscode',
]);
const SKIP_FILES = /^(README|README-zh|CHANGELOG|HOW_TO_RELEASE|LICENSE)\.md$|^(404|index\.min)\.html$/i;

/** Files that must never win a target, whatever they claim. */
const EXCLUDED_SOURCES = new Set([
  // Two files declare `permalink: /orbiters`; Jekyll silently discarded one and
  // /orbiters appears twice in the sitemap. MW-7 settles it: orbiters.md wins,
  // int-players.md is a deprecated old address and is not migrated.
  'maar.world/collections/_pages/int-players.md',
]);

/** origin -> [{ abs, rel, key }] where key is the URL path it serves, minus .html */
const sources = new Map();

/**
 * Never `.trim()` here. One legacy card file is literally named
 * `032_-maar-sky-sounds.3-card X .md` and is live at a URL ending `%20.html`;
 * trimming it loses the trailing space and silently breaks the URL.
 */
function urlKeyOf(url) {
  let t = decodeURIComponent(String(url)).replace(/\.html$/i, '');
  t = t.replace(/^\//, '').replace(/\/$/, '');
  return t.replace(/(^|\/)index$/, '') || 'index';
}

function walkSource(origin, dir, base) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walkSource(origin, abs, base);
      continue;
    }
    if (!/\.(md|html)$/i.test(name) || SKIP_FILES.test(name)) continue;

    const rel = relative(base, abs).split(sep).join('/');
    if (EXCLUDED_SOURCES.has(`${origin}/${rel}`)) continue;

    const raw = readFileSync(abs, 'utf8');
    const { data } = parse(raw);
    // Jekyll's default page permalink is /:path/:basename.html. An output
    // collection defaults to /:collection/:path — which is what puts the 34
    // Collect card records at /cards/001_… with no permalink of their own.
    const stem = rel.replace(/\.(md|html)$/i, '');
    const collectionKey = urlKeyOf(stem.replace(/^collections\/_/, ''));
    const bareKey = urlKeyOf(stem.replace(/^collections\/_[^/]+\//, ''));
    sources.get(origin).push({
      abs,
      rel,
      key: typeof data.permalink === 'string' ? urlKeyOf(data.permalink) : collectionKey,
      derivedKey: collectionKey,
      bareKey,
      hasPermalink: typeof data.permalink === 'string',
    });
  }
}

for (const [origin, dir] of Object.entries(SITES)) {
  sources.set(origin, []);
  if (existsSync(dir)) walkSource(origin, dir, dir);
}

// ── 3. match targets to sources ──────────────────────────────────────────

/** Recover the URL key the legacy site itself served, by dropping the new area prefix. */
function legacyKeyOf(key, origin) {
  if (origin === 'collect.maar.world') return key.replace(/^collect\/?/, '') || 'index';
  if (origin === 'tree.maar.world') return key.replace(/^tree\/?/, '') || 'index';
  return key;
}

const matched = [];
const unmatched = [];

for (const [key, meta] of targets) {
  const list = sources.get(meta.origin) || [];
  const want = legacyKeyOf(key, meta.origin);
  const hit =
    list.find((s) => s.hasPermalink && s.key === want) ||
    list.find((s) => s.key === want) ||
    list.find((s) => s.derivedKey === want) ||
    list.find((s) => s.bareKey === want);

  if (hit) matched.push({ key, meta, source: hit, legacyKey: want });
  else unmatched.push({ key, origin: meta.origin, want });
}

// ── 4. body transforms ───────────────────────────────────────────────────

/**
 * Merged-site paths of every route the policy drops, in both spellings.
 *
 * **Only `dropKind: 'decided'` counts.** `policy === 'drop'` is not one thing:
 * MW-4's second freeze grew the policy from 306 routes to 611 and, with it, the
 * drop set from 5 to 256 — but 254 of those carry `dropKind: 'unresolved'` and
 * an open decision. They are live 200s awaiting a human, not addresses that have
 * stopped existing, and ~250 of them are images.
 *
 * 192 of the undecided drops are image URLs and 4 more are the PDFs the resume
 * page offers for download. The rewrite below deletes the `<a>` around any
 * dropped path and keeps only its text, so every one of those was a live
 * reference this script was one link away from erasing — silently, because
 * unwrapping a link is reported as a routine problem line, not an error.
 *
 * Re-running with the whole set happens to be harmless *today*: the only dropped
 * URL any page still links is `/docs/ent-worlds/glossary.html`, which is decided
 * and already 404s. That is luck, not safety. Reading `dropKind` is what stops a
 * later re-run turning a question nobody has answered into a deletion.
 */
const AREA_PREFIX = { 'maar.world': '', 'collect.maar.world': '/collect', 'tree.maar.world': '/tree' };
const allDrops = policy.routes.filter((r) => r.policy === 'drop');
const decidedDrops = allDrops.filter((r) => r.dropKind === 'decided');
const undecidedDrops = allDrops.filter((r) => r.dropKind !== 'decided');
const DROPPED = new Set(
  decidedDrops.flatMap((r) => {
    const p = `${AREA_PREFIX[r.origin] ?? ''}${r.url}`;
    return [p, p.replace(/\.html$/i, ''), `${p.replace(/\.html$/i, '')}.html`];
  }),
);

/**
 * The `<title>` production served, per page key.
 *
 * `<title>` is the one string on a page that CSS cannot reach. The site-wide
 * lowercase is a CSS decision — `src/styles/reset.css` says source text keeps its
 * casing "so it stays correct when copied, quoted, read by a screen reader" —
 * but the migration lowercased the `title:` frontmatter as well and dropped the
 * brand, so all 133 browser tabs, search results, share cards and screen-reader
 * page announcements read `about` instead of `About - MAAR WORLD`. `<h1>` was
 * never affected, which is why this went unseen.
 *
 * Taken from the frozen manifest rather than reconstructed: it is the only
 * record of what each of the three origins actually sent, suffix included
 * (`MAAR WORLD`, `COLLECT.MAAR.WORLD`, `TREE.MAAR.WORLD`).
 */
const PRODUCTION_TITLE = new Map();
for (const r of manifest.routes) {
  if (r.status !== 200 || r.kind !== 'page' || typeof r.title !== 'string' || !r.title.trim()) continue;
  const { key } = pageKeyOf(`${AREA_PREFIX[r.origin] ?? ''}${r.url}`);
  if (!PRODUCTION_TITLE.has(key)) PRODUCTION_TITLE.set(key, r.title.trim());
}

/**
 * The headings production served, in order, per page key.
 *
 * Only the first one is used, and only to answer one question: did the legacy
 * theme print the page's own title as the first heading on the page? It did
 * that whenever `layout: article` was in force, from the `title:` frontmatter
 * and never from the body — so a body that opens with some *other* heading
 * still had the title above it, and migrating the body alone drops it.
 *
 * The frozen manifest is the only record of that, which is why the question is
 * asked of it rather than guessed from the source's frontmatter.
 */
const PRODUCTION_HEADINGS = new Map();
for (const r of manifest.routes) {
  if (r.status !== 200 || r.kind !== 'page' || !Array.isArray(r.headings)) continue;
  const { key } = pageKeyOf(`${AREA_PREFIX[r.origin] ?? ''}${r.url}`);
  if (!PRODUCTION_HEADINGS.has(key)) PRODUCTION_HEADINGS.set(key, r.headings);
}

/** The text of the first top-level heading in a migrated body, or null. */
function firstTopHeading(body) {
  const m = /^#[ \t]+(.+)$/m.exec(body);
  const h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  if (!m && !h) return null;
  const useMd = m && (!h || m.index < h.index);
  const raw = useMd ? m[1] : h[1];
  return raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Brand suffix per origin, for the handful of pages the crawl never titled. */
const BRAND = {
  'maar.world': 'MAAR WORLD',
  'collect.maar.world': 'COLLECT.MAAR.WORLD',
  'tree.maar.world': 'TREE.MAAR.WORLD',
};

const FIRST_PARTY = /(^|\/\/|\.)maar\.world(\/|$|:)/i;

/**
 * `//host/path` is protocol-relative and reaches off-domain — it is emphatically
 * not "starts with a slash, therefore internal". The legacy Mailchimp stylesheet
 * is written exactly that way, which is how it survived a naive check once.
 */
const isFirstParty = (url) =>
  FIRST_PARTY.test(url) || url.startsWith('#') || (url.startsWith('/') && !url.startsWith('//'));

/** How a provider is named to a reader. Never a bare hostname. */
const PROVIDER_NAME = {
  youtube: 'youtube',
  vimeo: 'vimeo',
  soundcloud: 'soundcloud',
  bandcamp: 'bandcamp',
  'google-forms': 'google forms',
  'google-calendar': 'google calendar',
  external: 'the source',
};

/**
 * A click-out facade. No third-party byte is fetched until the visitor chooses
 * to leave, which is what lets the site ship with no cookie banner. The marker
 * attribute `data-embed-facade` is what both this and verify:content count as
 * an embed.
 *
 * MW-9 kept these as click-*out* rather than turning them into click-to-load
 * players, and that is a decision, not an omission: an in-page player has to be
 * injected by script, so every one of these thirteen pages would start shipping
 * application JavaScript. MW-9 also says the Helix island is the only page
 * allowed to. Both cannot hold — see the ledger, embeds/click-out-not-load.
 *
 * The accessible name of the control is the label alone. The provider chip is
 * aria-hidden because it repeats a word the label already contains, and the
 * note sits outside the anchor so it informs the reader without being read out
 * as part of the link.
 *
 * `noreferrer` is deliberate on top of `noopener`: following the link is
 * consent to visit, not consent to tell them which page sent you.
 */
function facade(provider, href, label) {
  const who = PROVIDER_NAME[provider] || PROVIDER_NAME.external;
  return (
    `<p class="embed-facade" data-embed-facade data-embed-provider="${provider}">` +
    `<a class="embed-facade__action" href="${href}" target="_blank" rel="noopener noreferrer">` +
    `<span class="embed-facade__provider" aria-hidden="true">${who}</span>` +
    `<span class="embed-facade__label">${label}</span>` +
    `</a>` +
    `<span class="embed-facade__note">opens in a new tab. nothing is requested from ${who} until you choose it.</span>` +
    `</p>`
  );
}

const YT_FACADE = (id) => facade('youtube', `https://youtu.be/${id}`, 'watch this video on youtube');
const VM_FACADE = (id) => facade('vimeo', `https://vimeo.com/${id}`, 'watch this video on vimeo');

/** The home page's photo swiper, which Jekyll built from an assign + for loop. */
const HOME_SLIDES = [
  ['2024_ss-1.jpeg', 'Emergent layering session'],
  ['2024_ss-2.jpeg', 'Gesture capture + sonic response'],
  ['2024_ss-3.jpeg', 'Collective listening micro‑ritual'],
  ['2024_ss-4.jpeg', 'Interface prototyping table'],
  ['2024_ss-5.jpeg', 'Transduction + tactile mapping'],
  ['2024_ss-6.jpeg', 'Improvisation under orbital rules'],
  ['2024_ss-7.jpeg', 'Hybrid instrument assembly'],
  ['2024_ss-8.jpeg', 'Real‑time parameter negotiation'],
  ['2024_ss-10.jpeg', 'Multichannel rehearsal fragment'],
  ['2024_ss-11.jpeg', 'Embodied timing exploration'],
  ['2024_ss-12.jpeg', 'Closing resonance capture'],
];

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function expandHomeSwiper(body) {
  const start = body.indexOf('{% assign photo_captions');
  if (start === -1) return body;
  const end = body.indexOf('{% endfor %}', start);
  if (end === -1) return body;
  const slides = HOME_SLIDES.map(
    ([file, caption]) =>
      `          <div class="swiper__slide">\n` +
      `            <img class="lightbox-ignore" src="/img/collect-landing/${file}" alt="${escapeAttr(caption)}"/>\n` +
      `            <div class="slide-caption">${caption}</div>\n` +
      `          </div>`,
  ).join('\n');
  return body.slice(0, start) + slides + body.slice(end + '{% endfor %}'.length);
}

/**
 * Which collection an `article-list` include was rendering, and whether that
 * include showed each entry's cover image.
 *
 * The second half is load-bearing, not decoration. `type='grid'` renders a
 * thumbnail per entry; `show_cover=false` renders none. Dropping it is how
 * `/collect/documentation.html` — nine cover thumbnails in production — shipped
 * as a bare list of nine links with no images at all.
 */
function indexOfInclude(body) {
  const m = /\{%-?\s*include\s+article-list\.html([\s\S]{0,240}?)-?%\}/.exec(body);
  if (!m) return null;
  const args = m[1];
  const name = /articles=site\.lab\b/.test(args)
    ? 'lab'
    : /articles=site\.cards\b/.test(args)
      ? 'collect-cards'
      : /articles=site\.documentation\b/.test(args)
        ? 'collect-docs'
        : null;
  if (!name) return null;
  const covers = /type\s*=\s*'grid'/.test(args) || /show_cover\s*=\s*true/.test(args);
  return { name, covers };
}

/** Strip a whole element (including children) wherever it appears. */
function stripElement(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  let out = html;
  while (re.test(out)) out = out.replace(re, '');
  // Self-closed or unterminated leftovers.
  return out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
}

/**
 * Two pieces of the dead TeXt theme that shipped into the bodies.
 *
 * **The Disqus mount.** Eight Lab pages carry `<div id="disqus_thread"></div>`
 * and a `<noscript>` linking `disqus.com`. The loader that filled the div was a
 * `<script>` and is already gone, so nothing fetches anything — but an empty
 * mount point and a live anchor to a third-party comment host are a dead
 * third-party surface in the DOM of a site whose whole no-cookie-banner position
 * rests on not having one.
 *
 * **The "Continue reading" link.** In the theme this was the tail of an *excerpt*
 * in an article list. Four articles have it pasted into the body itself, where
 * it sits mid-page above the rest of the article it claims to continue. All four
 * are the same paste — two English, two Spanish — so all four go; leaving the
 * Spanish pair would be the same defect in the other language.
 */
const READ_MORE = /^(continue reading|continuar leyendo|seguir leyendo|read more|leer más)$/i;

function stripDeadThemeChrome(html, problems, where) {
  let out = html.replace(/<div\b[^>]*id\s*=\s*["']disqus_thread["'][^>]*>[\s\S]*?<\/div>|<div\b[^>]*id\s*=\s*["']disqus_thread["'][^>]*\/?>/gi, () => {
    problems.push(`${where}: removed dead disqus mount point`);
    return '';
  });
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/gi, (m) => {
    if (!/disqus/i.test(m)) return m;
    problems.push(`${where}: removed disqus <noscript> and its disqus.com link`);
    return '';
  });
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (m, text) => {
    if (!READ_MORE.test(text.replace(/<[^>]+>/g, '').trim())) return m;
    problems.push(`${where}: removed theme excerpt chrome "${text.trim()}" from the body`);
    return '';
  });
  return out;
}

const EMBED_HOSTS = [
  [/docs\.google\.com\/forms/i, 'google-forms', 'open this form on google forms'],
  [/calendar\.google\.com/i, 'google-calendar', 'open the booking calendar on google calendar'],
  [/(^|\/\/|\.)youtube(-nocookie)?\.com|youtu\.be/i, 'youtube', 'watch this video on youtube'],
  [/(^|\/\/|\.)vimeo\.com/i, 'vimeo', 'watch this video on vimeo'],
  [/soundcloud\.com/i, 'soundcloud', 'listen on soundcloud'],
  [/bandcamp\.com/i, 'bandcamp', 'listen on bandcamp'],
];

function facadeFor(url) {
  for (const [re, provider, label] of EMBED_HOSTS) {
    if (re.test(url)) return facade(provider, url, label);
  }
  return facade('external', url, 'open this embedded media at its source');
}

/**
 * Replace every third-party `<iframe>` with a facade and drop every other
 * third-party on-load reference. `play.maar.world` and `radio.maar.world` share
 * the registrable domain, so they stay as plain iframes.
 */
function defuseThirdParty(html, problems, where) {
  let out = html.replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe>|<iframe\b([^>]*)\/?>/gi, (m, a1, _inner, a2) => {
    const attrs = a1 ?? a2 ?? '';
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!src) return '';
    if (isFirstParty(src[1])) return m;
    return facadeFor(src[1].trim());
  });

  // <link rel=stylesheet>, <script src>, <img src> and <object data> that reach
  // off-domain. Dropbox card art is the inherited MW-6 exception.
  out = out.replace(/<link\b[^>]*>/gi, (m) => {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m);
    return href && !isFirstParty(href[1]) ? '' : m;
  });
  out = out.replace(/<img\b[^>]*>/gi, (m) => {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m);
    if (!src) return m;
    const url = src[1].trim();
    if (isFirstParty(url) || !/^(https?:)?\/\//i.test(url)) return m;
    if (/dropbox/i.test(url)) return m; // MW-6 exception, tracked as BLOCKED
    problems.push(`${where}: dropped third-party <img> ${url}`);
    return '';
  });
  return out;
}

/**
 * Container tags whose open…close span is one raw HTML region.
 *
 * `p`, `li`, `td` and `iframe` are here because they are containers a legacy
 * body genuinely nests things inside; leaving them out meant a `<p>` wrapping
 * two indented lines was not seen as raw HTML at all. `br`, `img`, `hr` and the
 * inline tags are deliberately absent — they are void or inline and open no
 * region, which is the whole of the fix below.
 */
const BLOCK_TAG =
  /<(\/?)(div|section|article|header|footer|aside|nav|form|figure|table|thead|tbody|tr|td|th|ul|ol|li|p|main|details|blockquote|picture|video|audio|object|label|iframe|fieldset|dl|dd|dt|pre)\b[^>]*?(\/?)>/gi;

/** Tags that never contain anything, so a close for them is never expected. */
const VOID_TAG = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

/**
 * Tag names that open a CommonMark *type 6* HTML block. Anything else on a line
 * of its own opens a *type 7* block instead — and a type 7 block runs to the
 * next blank line, passing everything in between through verbatim.
 */
const TYPE6_TAG = new Set(
  ('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl ' +
    'dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend ' +
    'li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td ' +
    'tfoot th thead title tr track ul').split(' '),
);

/**
 * Where the raw-HTML run that starts at `from` stops.
 *
 * Blocks are the blank-line-separated units markdown itself works in. A run
 * continues through every block that still carries markup and stops at the first
 * that carries none — that block is prose or a list, and flattening it is the
 * damage this bound exists to prevent.
 */
function htmlRunEnd(lines, from) {
  let end = from;
  let i = from;
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i += 1; // skip the blank gap
    const blockStart = i;
    let hasMarkup = false;
    while (i < lines.length && lines[i].trim()) {
      if (/<\/?[a-z!][^>]*>/i.test(lines[i])) hasMarkup = true;
      i += 1;
    }
    if (i === blockStart) break;
    if (!hasMarkup) break;
    end = i - 1;
  }
  return end;
}

/**
 * Kramdown pipe tables that GFM refuses to see as tables at all.
 *
 * Kramdown needs no header row and does not care whether a row's cell count
 * matches the separator's; GFM requires both. `/collect/docs/mw` opens with a
 * one-cell header-less table and then a table whose header row has one cell
 * against a two-column separator, and `/collect/docs/releases/skysounds` writes
 * its whole Credits block header-less. GFM renders none of it: production served
 * clean `<table>`s and the build shipped `<p>| Solar System parameters |` and
 * eight more rows of raw pipe characters, plus a Credits block as one paragraph
 * of `|Idea | Maar| |Music | Maar|…`.
 *
 * Every run of pipe lines is parsed the way kramdown parsed it and emitted as
 * HTML, so no cell can be lost to a dialect difference. A run that GFM would
 * already render correctly is left as markdown — inline markdown inside its
 * cells keeps working, and there is nothing to fix.
 *
 * Fenced blocks are skipped: the two Lab pages whose bodies are full of pipes
 * are mermaid diagrams, and they are correct as they stand.
 */
const PIPE_ROW = /^\s{0,3}\|/;
const PIPE_SEPARATOR = /^\s{0,3}\|?[\s:+|-]*-[\s:+|-]*$/;

/** Split a kramdown row into cells, honouring `\|` and the optional outer pipes. */
function pipeCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (/(^|[^\\])\|$/.test(s)) s = s.slice(0, -1);
  return s
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

function convertPipeTables(body, problems = [], where = '') {
  const lines = body.split('\n');
  const out = [];
  let fenced = false;

  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s{0,3}(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (fenced || !PIPE_ROW.test(lines[i])) {
      out.push(lines[i]);
      continue;
    }

    let end = i;
    while (end + 1 < lines.length && PIPE_ROW.test(lines[end + 1])) end += 1;
    const run = lines.slice(i, end + 1);
    i = end;

    // A well-formed GFM table needs no help, and rewriting it would cost the
    // cells their inline markdown.
    const gfm =
      run.length >= 2 &&
      PIPE_SEPARATOR.test(run[1]) &&
      pipeCells(run[1]).length === pipeCells(run[0]).length &&
      !run.slice(2).some((l) => PIPE_SEPARATOR.test(l));
    if (gfm) {
      out.push(...run);
      continue;
    }

    // Kramdown: the first separator makes everything above it the header, and
    // every later separator opens another <tbody>.
    const sections = [];
    let current = [];
    let headerRows = null;
    for (const line of run) {
      if (!PIPE_SEPARATOR.test(line)) {
        current.push(pipeCells(line));
        continue;
      }
      if (headerRows === null) headerRows = current;
      else sections.push(current);
      current = [];
    }
    if (headerRows === null) sections.push(current);
    else if (current.length) sections.push(current);

    const width = Math.max(
      ...[...(headerRows || []), ...sections.flat()].map((r) => r.length),
      1,
    );
    const pad = (row) => Array.from({ length: width }, (_, n) => row[n] ?? '');
    const cell = (tag, v) => `<${tag}>${v}</${tag}>`;
    const rowHtml = (row, tag) => `<tr>${pad(row).map((v) => cell(tag, v)).join('')}</tr>`;

    const html = ['<table>'];
    if (headerRows?.length) html.push(`<thead>${headerRows.map((r) => rowHtml(r, 'th')).join('')}</thead>`);
    for (const rows of sections) {
      if (rows.length) html.push(`<tbody>${rows.map((r) => rowHtml(r, 'td')).join('')}</tbody>`);
    }
    html.push('</table>');

    const cells = [...(headerRows || []), ...sections.flat()].flat();
    problems.push(
      `${where}: kramdown pipe table at line ${end - run.length + 2} emitted as HTML ` +
        `(${cells.length} cells, ${width} columns) — GFM would have shipped it as literal pipes`,
    );
    for (const c of cells) {
      if (/\[[^\]]*\]\([^)]*\)|(\*\*|__).+?\1/.test(c)) {
        problems.push(`${where}: pipe-table cell carries markdown that HTML will not render: ${c.slice(0, 60)}`);
      }
    }

    out.push('', ...html, '');
  }

  return out.join('\n');
}

/**
 * A list marker followed by five or more spaces.
 *
 * CommonMark reads that as a list item whose first block is an *indented code
 * block*, so `landings.md`'s `-     <a href="…">Tembey…</a>` shipped as a syntax-
 * highlighted `<pre>` of its own source, taking the five bullets under it with
 * it. Kramdown had no such rule and rendered an ordinary item. Four spaces is
 * the most CommonMark accepts as plain content indent, so the run is clamped to
 * four — the nested bullets under it keep sitting deeper than the content
 * column, which is what makes them a sub-list rather than more code.
 */
function clampListMarkerIndent(body) {
  return body
    .split('\n')
    .map((line) => line.replace(/^(\s*)([-*+]|\d+[.)])( {5,})(?=\S)/, (_, indent, marker) => `${indent}${marker}    `))
    .join('\n');
}

/**
 * Un-indent raw HTML so CommonMark passes it through, and stop a stray inline
 * tag swallowing the markdown under it.
 *
 * Kramdown treated a `<div>` and everything to its matching close as one raw
 * HTML block. CommonMark ends an HTML block at the first blank line, so the
 * next indented line starts a fresh block — and four spaces of indentation make
 * that block an indented *code* block. The visible symptom is a page of legacy
 * markup rendered as escaped source inside `<pre>`.
 *
 * Three rules keep the cure narrower than the disease.
 *
 * **A region ends where its HTML run ends.** The first version tracked a running
 * `depth` and dedented every line while it was above zero. `depth` never came
 * back down for an unclosed tag, so one stray `<div>` would flatten every
 * indented line in the rest of the file — including markdown lists hundreds of
 * lines later, which to a reader looks like a page whose nesting collapsed.
 * Three legacy pages really do end on an unclosed `<div>` (`/collect/samples`,
 * `/collect/documentation`, `/tree/max-network-berlin`), so refusing to dedent
 * those is not an option either. Openings are matched to their closes; an
 * opening with no close runs only to the end of its own HTML run — the last
 * blank-line-separated block that still carries markup — and is reported.
 *
 * **Only a container may start one.** The first version also dedented any line
 * whose first non-space character began a tag, at any depth, as long as it sat
 * four columns in. `landings.md` carries `       <br>` seven spaces deep inside a
 * list item. Flattened to column 0 a bare `<br>` is a CommonMark *type 7* HTML
 * block, so it ran to the next blank line and passed everything between through
 * verbatim — fourteen markdown bullets shipped to the page as literal
 * `- <a href="…">Because</a>` text. An inline or void tag can no longer start a
 * region, and an indented one is left exactly where its author put it, which is
 * what kramdown did with it too.
 *
 * **A lone inline tag is a paragraph, not a block.** The same page carries seven
 * more `<br>` lines that were *already* at column 0 in the legacy source, four of
 * them directly above a markdown list. Kramdown rendered each as `<p><br /></p>`
 * and carried on; CommonMark opens a type 7 block and eats the list. A blank line
 * after the tag closes the block immediately, which is the only edit that makes
 * CommonMark agree with what production shipped.
 */
function dedentHtmlBlocks(body, problems = [], where = '') {
  const lines = body.split('\n');

  // 1. Tokenise container tags, skipping fenced code.
  const tokens = [];
  let fenced = false;
  const fencedAt = new Set();
  lines.forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) {
      fencedAt.add(i);
      return;
    }
    for (const m of line.matchAll(BLOCK_TAG)) {
      const tag = m[2].toLowerCase();
      if (VOID_TAG.test(tag)) continue;
      tokens.push({ line: i, tag, close: m[1] === '/', selfClose: m[3] === '/', at: m.index });
    }
  });

  // 2. Match opens to closes. A top-level pair becomes a raw-HTML region; an
  //    opening left on the stack at the end matched nothing and opens nothing.
  const stack = [];
  const regions = [];
  for (const t of tokens) {
    if (t.selfClose) continue;
    if (!t.close) {
      stack.push(t);
      continue;
    }
    const idx = stack.map((s) => s.tag).lastIndexOf(t.tag);
    if (idx === -1) continue; // stray close — ignore it rather than unbalancing
    const open = stack[idx];
    stack.length = idx; // anything above it never closed; it is inside this region
    if (stack.length === 0) regions.push([open.line, t.line, open]);
  }
  for (const open of stack) {
    const end = htmlRunEnd(lines, open.line);
    problems.push(
      `${where}: unclosed <${open.tag}> at line ${open.line + 1} — treated as raw HTML to line ${end + 1}, not to end of file`,
    );
    regions.push([open.line, end, open]);
  }

  // 3. A region only counts when its opening tag starts its own line. A `<div>`
  //    in the middle of a sentence is inline markup, not a block to flatten.
  const dedent = new Set();
  for (const [from, to, open] of regions) {
    if (!/^\s*$/.test(lines[from].slice(0, open.at))) continue;
    for (let i = from; i <= to; i += 1) dedent.add(i);
  }

  // 4. Close a type 7 block the moment it opens. A line that is nothing but one
  //    non-type-6 tag — `<br>`, a bare `<a …>` — would otherwise run to the next
  //    blank line and pass the markdown under it through as visible source.
  const out = [];
  const LONE_TAG = /^\s{0,3}<\/?([a-z][a-z0-9]*)\b[^>]*>\s*$/i;
  lines.forEach((line, i) => {
    out.push(dedent.has(i) && !fencedAt.has(i) ? line.replace(/^\s+/, '') : line);
    if (dedent.has(i) || fencedAt.has(i)) return;
    const m = LONE_TAG.exec(out[out.length - 1]);
    if (!m || TYPE6_TAG.has(m[1].toLowerCase())) return;
    const next = lines[i + 1];
    if (next === undefined || !next.trim()) return;
    problems.push(`${where}: isolated lone <${m[1].toLowerCase()}> at line ${i + 1} — it was swallowing the block under it`);
    out.push('');
  });

  return out.join('\n');
}

/**
 * The `alt` a raw `<img>` in a legacy body is missing.
 *
 * Markdown image syntax cannot omit `alt`; raw `<img>` can, and the legacy
 * bodies do it twelve times. An `<img>` with no `alt` attribute is announced by
 * a screen reader as its filename — "2024 underscore ss dash 12 dot jpeg" — so
 * the absence is not neutral, it is noise. `alt=""` is the correct value only
 * when the image adds nothing a reader would otherwise miss.
 *
 * Keyed by `page key|src`, because the same file can be decorative on one page
 * and load-bearing on another. Every entry states which it is:
 *
 * - `/collect` swiper slides and the bandcamp thumbnail sit immediately beside
 *   the numbered step they illustrate ("I. Choose a Sky Sound card…"), and the
 *   bandcamp card repeats "Get 11 cards envelope 33€" underneath. Announcing
 *   them would read the same sentence twice, so they are decorative: `alt=""`.
 * - `/collect/docs/ent-cards`'s QR illustration has its explanation in the
 *   paragraph it heads. Decorative.
 * - `/radio`'s three banners are NOT decorative. Each is a rendered ENT card
 *   whose face carries a line of text that appears nowhere else on the page,
 *   so the alt carries that line.
 *
 * Anything not listed is emitted as `alt=""` and reported, so a new alt-less
 * image shows up in the migration output rather than shipping silently.
 */
const IMAGE_ALT = new Map([
  ['collect|/img/landing/2024_ss-12.jpeg', ''],
  ['collect|/img/landing/2024_ss-10.jpeg', ''],
  ['collect|/img/landing/2024_ss-8.jpeg', ''],
  ['collect|/img/landing/2024_ss-11.jpeg', ''],
  ['collect|/img/landing/2024_ss-2.jpeg', ''],
  ['collect|/img/landing/2024_ss-7.jpeg', ''],
  ['collect/docs/ent-cards|/img/docs/covers/qr-technology.jpg', ''],
  ['radio|/img/radio/card-banner-3.png', 'ENT card: the voice of water is heard'],
  ['radio|/img/radio/card-banner-2.png', 'ENT card: strange birds ride the wind in groups of six'],
  [
    'radio|/img/radio/card-banner-1.png',
    'ENT card: contrast between water and the form taken by the movement of the water on the surface',
  ],
]);

/**
 * What a frame with no label of its own is called, by host.
 *
 * Reached only when the block above the frame is not a label — see
 * `frameLabelBefore`. The two same-site hosts are the only ones that survive as
 * plain frames; everything third-party is a click-to-load facade by the time
 * this runs.
 */
const FRAME_FALLBACK = [
  [/(^|\.)radio\.maar\.world$/i, 'maar world radio'],
  [/(^|\.)play\.maar\.world$/i, 'maar world player'],
];

/** Visible text on one source line, with tags and entities gone. */
const lineText = (line) =>
  line
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The label a frame is introduced by, if it has one.
 *
 * Every `play.maar.world` frame in the Lab sits inside `<div class="container">`
 * with its track name in the block immediately above — `1.Trompeta Mochica.`,
 * `104.Dadada Live set Intro 4 IP`. A sighted reader gets the name from that
 * line; without a `title`, a screen-reader user gets "frame" and nothing else,
 * five times on one page.
 *
 * A label is a name, not a sentence, and the distinction matters because
 * `/radio` puts an instruction paragraph in exactly the same position ("Press
 * PLAY. Desktop recommended. Due to restrictions set by Apple, …"), which would
 * make a terrible frame title. So a candidate is rejected if it runs past 120
 * characters or contains an internal sentence boundary. `/music`'s 86-character
 * track name has neither and is kept.
 */
function frameLabelBefore(body, at) {
  const lines = body.slice(0, at).split('\n');
  for (let i = lines.length - 1, steps = 0; i >= 0 && steps < 8; i -= 1, steps += 1) {
    const text = lineText(lines[i]);
    if (!text) continue;
    if ([...text].length > 120) return null;
    if (/[.!?]\s+[A-ZÁÉÍÓÚÑ]/.test(text)) return null;
    return text.replace(/\.$/, '');
  }
  return null;
}

/**
 * Give every frame an accessible name.
 *
 * `<iframe>` with no `title` is announced as an unnamed frame, and MW-11 asks
 * for exactly this ("every embed facade is titled and keyboard-operable") —
 * but the facades were always titled and these are the plain same-site frames
 * that never were, 30 of them across 10 pages.
 *
 * Anything that falls through to a host name is reported, so a new untitled
 * frame shows up in the migration output rather than shipping unnamed.
 */
function titleUntitledFrames(body, problems, where) {
  return body.replace(/<iframe\b[^>]*>/gi, (tag, at) => {
    if (/\btitle\s*=/i.test(tag)) return tag;
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(tag);
    let host = '';
    try {
      host = new URL(src ? src[1] : '', 'https://maar.world').hostname;
    } catch {
      /* an unparseable src is reported below by the empty fallback */
    }
    const fallback = (FRAME_FALLBACK.find(([re]) => re.test(host)) || [])[1];
    const label = frameLabelBefore(body, at);
    const title = label ? `${label} — player` : fallback;
    if (!title) {
      problems.push(`${where}: <iframe src="${src ? src[1] : '?'}"> has no title and no recorded fallback for ${host || 'an unparseable src'}`);
      return tag;
    }
    if (!label) problems.push(`${where}: named an unlabelled <iframe> "${title}" from its host (${host})`);
    return tag.replace(/\s*(\/?)>$/, ` title="${escapeAttr(title)}"$1>`);
  });
}

/**
 * Remove anchors that other rules emptied.
 *
 * `/radio` and `/subscribe` both carry Mailchimp's attribution badge:
 * `<a href="http://eepurl.com/if7emL" title="Mailchimp — …"><img src="eep.io/…"></a>`.
 * The image is third-party, so `defuseThirdParty` drops it — correctly, since
 * nothing third-party may be requested on page load — and what is left is an
 * anchor with no content at all. It is zero-size, so it cannot be clicked or
 * tapped, but it is still a tab stop, and the `title` gives it just enough of
 * an accessible name that a check asking only "is it named" would pass it.
 *
 * A link to nothing that nobody can see is not a link. The `title` is not
 * substituted as visible text: the badge said "intuit mailchimp" in artwork
 * this build deliberately does not fetch, and inventing a caption for an image
 * nobody here has seen would be a guess about what production showed.
 *
 * An anchor carrying its own `aria-label` is a named control by intent — an
 * icon button, say — and is left alone. A wrapper left holding nothing but the
 * removed anchor goes with it.
 */
function dropEmptiedAnchors(html, problems, where) {
  let out = html.replace(/<a\b([^>]*\bhref\b[^>]*)>(\s*)<\/a>/gi, (whole, attrs) => {
    if (/\baria-label\s*=/i.test(attrs)) return whole;
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs);
    problems.push(`${where}: removed emptied <a href="${href ? href[1] : '?'}"> — its only content was dropped`);
    return '';
  });
  out = out.replace(/<p\b[^>]*class\s*=\s*["'][^"']*brandingLogo[^"']*["'][^>]*>\s*<\/p>\s*/gi, '');
  return out;
}

function addMissingAlt(html, problems, where) {
  return html.replace(/<img\b[^>]*>/gi, (m) => {
    if (/\balt\s*=/i.test(m)) return m;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m);
    const key = `${where}|${src ? src[1].trim() : ''}`;
    const known = IMAGE_ALT.has(key);
    const alt = known ? IMAGE_ALT.get(key) : '';
    if (!known) {
      problems.push(
        `${where}: <img> without alt and without a recorded decision (${src ? src[1] : 'no src'}) — emitted alt="" as decorative`,
      );
    }
    return m.replace(/\s*(\/?)>$/, ` alt="${escapeAttr(alt)}"$1>`);
  });
}

function transform(body, ctx) {
  const problems = [];
  let out = body;

  // Full standalone documents (feedback forms, the /orbiters redirect stub).
  if (/<html[\s>]/i.test(out)) {
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(out);
    if (bodyMatch) out = bodyMatch[1];
    out = out.replace(/<\/?(html|head|body|!DOCTYPE)\b[^>]*>/gi, '');
  }
  out = out.replace(/<!DOCTYPE[^>]*>/gi, '');

  out = out.replace(/\{%-?\s*(end)?raw\s*-?%\}/g, '');
  out = expandHomeSwiper(out);

  const wantsIndex = indexOfInclude(out);
  out = out.replace(/\{%-?\s*include\s+extensions\/youtube\.html[^%]*?id\s*=\s*'([^']+)'[^%]*?-?%\}/g, (_, id) => YT_FACADE(id));
  out = out.replace(/\{%-?\s*include\s+extensions\/vimeo\.html[^%]*?id\s*=\s*'([^']+)'[^%]*?-?%\}/g, (_, id) => VM_FACADE(id));
  // article-list becomes an `indexOf` prop rendered by the route.
  out = out.replace(/\{%-?\s*include\s+article-list\.html[\s\S]*?-?%\}/g, '');

  out = stripElement(out, 'script');
  out = stripElement(out, 'style');
  out = stripDeadThemeChrome(out, problems, ctx.key);

  /**
   * Material Symbols icon spans. The glyph came from fonts.googleapis.com,
   * which the self-hosted-fonts rule forbids outright, and there is no
   * self-hosted equivalent. Without the font the span does not degrade to an
   * icon — it degrades to the literal ligature name, so `# <span…>speaker_group
   * </span> Bookings` reads as "speaker_group Bookings". They are decorative,
   * so they go; keeping them would ship that string to a reader.
   */
  out = out.replace(/<span\b[^>]*material-symbols-outlined[^>]*>[\s\S]*?<\/span>\s*/gi, (m) => {
    problems.push(`${ctx.key}: dropped material-symbols icon span (${stripElement(m, 'x').replace(/<[^>]+>/g, '').trim()})`);
    return '';
  });

  // Substitutions Jekyll made. `page.suit_title` is undefined on /radio, so
  // Jekyll emitted nothing there — matching that exactly.
  out = out.replace(/\{\{\s*site\.baseurl\s*\}\}/g, '');
  out = out.replace(/\{\{\s*page\.[A-Za-z_0-9]+\s*\}\}/g, '');

  /**
   * Commented-out markup is not markup.
   *
   * `/collect` carries `<!-- <iframe … youtube.com/embed/gpL2sTqXdrA …> -->`,
   * an embed its author switched off. Production never rendered it and never
   * requested it. The migration, which matches on tags and not on whether they
   * are live, turned it into a facade — a facade inside a comment, which no
   * reader can click and which still counts as an embed to anything reading the
   * built HTML. Carrying the iframe verbatim instead would be no better: the
   * third-party URL would still be there to be counted and link-checked.
   *
   * So a comment containing element markup is dropped and reported. Comments
   * that are prose (`<!-- Slide 1 -->`, 51 of the 52 in the corpus) are not
   * markup and stay exactly where they are.
   */
  out = out.replace(/<!--[\s\S]*?-->/g, (m) => {
    if (!/<(iframe|img|script|a|link|video|audio|object|embed)\b/i.test(m)) return m;
    problems.push(`${ctx.key}: dropped commented-out markup (${m.replace(/\s+/g, ' ').slice(0, 60)}…)`);
    return '';
  });

  out = defuseThirdParty(out, problems, ctx.key);

  // Page-relative asset references were correct while every page sat at the
  // site root. `/tree/max-network-berlin.html` is one directory deep, so
  // `img/music-tree.jpg` would resolve to `/tree/img/…` and 404. Rooting them
  // is not a URL change: it is the same file the legacy page already served.
  out = out.replace(/\b(href|src|data)\s*=\s*(["'])((?:img|assets)\/[^"']*)\2/gi, (_, attr, q, url) => `${attr}=${q}/${url}${q}`);

  // Collect and Tree move under a path prefix, so their root-relative internal
  // links move with them. Absolute links to their own subdomain keep working
  // through the 301s produced in routes/redirects.map.
  if (ctx.area === 'collect' || ctx.area === 'tree') {
    const prefix = `/${ctx.area}`;
    out = out.replace(/\b(href|src|data)\s*=\s*(["'])(\/[^"']*)\2/gi, (m, attr, q, url) => {
      if (url.startsWith('/img/') || url.startsWith('/assets/') || url.startsWith(`${prefix}/`)) return m;
      return `${attr}=${q}${prefix}${url}${q}`;
    });
    out = out.replace(/\]\((\/(?!img\/|assets\/)[^)\s]*)\)/g, (m, url) =>
      url.startsWith(`${prefix}/`) ? m : `](${prefix}${url})`,
    );
  }

  /**
   * Links to routes the policy drops. `/collect/docs/ent-worlds/glossary.html`
   * is dropped because it already 404s in production, so the link is dead rot
   * either way — the text is kept and the anchor removed rather than shipping a
   * link that is known to go nowhere.
   */
  out = out.replace(/<a\b[^>]*href\s*=\s*["']([^"'#]+)(?:#[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    if (!DROPPED.has(href)) return m;
    problems.push(`${ctx.key}: unwrapped link to dropped route ${href}`);
    return text;
  });
  // …and the same link written as markdown, which is still an <a> once rendered.
  out = out.replace(/\[([^\]]*)\]\(([^)\s#]+)(#[^)\s]*)?\)/g, (m, text, href) => {
    if (!DROPPED.has(href)) return m;
    problems.push(`${ctx.key}: unwrapped link to dropped route ${href}`);
    return text;
  });

  // MW-8: nothing under /collect/* may point at the retired storefronts.
  if (ctx.area === 'collect') {
    out = out.replace(
      /<a\b[^>]*href\s*=\s*["'][^"']*(physical\.maar\.world|digital\.maar\.world|gumroad\.com)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, host, text) => {
        problems.push(`${ctx.key}: removed retired storefront link (${host})`);
        return text;
      },
    );
  }

  /**
   * Legacy rot: a handful of `<img src>` targets do not exist in any checkout
   * and render as a broken-image icon in production today. They are dropped
   * rather than carried, because a build that ships a link to nothing is a
   * broken build and verify:links is right to say so. Each one is reported.
   */
  out = out.replace(/<img\b[^>]*>/gi, (m) => {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m);
    if (!src || /^(https?:)?\/\//i.test(src[1])) return m;
    let p = src[1].split('#')[0].split('?')[0].replace(/^\//, '');
    try {
      p = decodeURIComponent(p);
    } catch {
      /* malformed escape — compare literally */
    }
    if (existsSync(join(SITES[ctx.origin], p))) return m;
    problems.push(`${ctx.key}: dropped dead legacy <img> /${p} (absent from the legacy checkout)`);
    return '';
  });

  // After every rule that can remove an element from inside an anchor.
  out = dropEmptiedAnchors(out, problems, ctx.key);
  out = addMissingAlt(out, problems, ctx.key);

  /**
   * Kramdown inline attribute lists — `{:.success}`, `{:.border.rounded}`. They
   * attached classes from the dead theme, and every markdown engine other than
   * kramdown renders them as literal text. They carry no content.
   */
  out = out.replace(/\{:[.#][^}\n]*\}/g, '');

  /**
   * After `defuseThirdParty`, so the only frames left are same-site ones — and
   * after the attribute lists above are gone, because every Lab frame has a
   * `{:.success}` on the line between it and its track name. Titling before
   * that point read the attribute list as the label, and then this very
   * substitution deleted it back out of the title attribute it had just
   * written, leaving `title=" — player"` on 29 frames.
   */
  out = titleUntitledFrames(out, problems, ctx.key);

  out = convertPipeTables(out, problems, ctx.key);
  out = dedentHtmlBlocks(clampListMarkerIndent(out), problems, ctx.key);

  const leftover = out.match(/\{\{[\s\S]{0,80}?\}\}|\{%[\s\S]{0,80}?%\}|\{:[.#][^}\n]*\}/g);
  if (leftover) problems.push(`${ctx.key}: UNRESOLVED Liquid ${[...new Set(leftover)].slice(0, 3).join(' ')}`);

  return { body: out.replace(/\n{3,}/g, '\n\n').trim(), problems, wantsIndex };
}

/**
 * The tail of the legacy `card.collect` layout.
 *
 * The 34 Collect card records are frontmatter and nothing else — every visible
 * word on those pages came from the layout — so the migration, which reads
 * sources and not layouts, emitted 34 pages with an empty body and lost the
 * whole tail: the "Snippet" heading, the note about what collecting the card
 * unlocks, and the player instructions with their `support.apple.com` NFC help
 * link. That link was the single outbound link on all 34 pages.
 *
 * The commerce block that sat in the middle of the same tail — a `<select>` of
 * `maar-world.bandcamp.com/merch` and a Buy button driven by a `<script>` — is
 * *not* restored. MW-8 retires the storefronts and MW-7 forbids the script;
 * dropping it was right and it stays dropped. None of the text below is
 * commerce.
 *
 * It sits above the player rather than below it, because the route renders the
 * body before the `snip_player` iframe and the route is not this session's to
 * reorder. An instruction for the player reads at least as well immediately
 * above it.
 *
 * Production's own copy reads "Please ---- unmute your device"; the four dashes
 * are a placeholder left in the layout and are not carried.
 */
const CARD_TAIL = [
  '<p class="card-unlock">Collect this card to unlock access to the<br /> Orbiter and download high-quality audio files.</p>',
  '',
  '<h2 class="card-snippet">Snippet</h2>',
  '',
  '<p class="card-player-note">Please <a href="https://support.apple.com/en-gb/HT208353" target="_blank" rel="noopener noreferrer">unmute</a> your device and press PLAY ▶️ button.<br /> Player optimized for Chrome and Firefox browsers</p>',
].join('\n');

/**
 * Three pages cannot come out of the generic pipeline, and each says why.
 * Everything else in all three sites goes through `transform` untouched by hand.
 */
const SPECIAL = {
  // Production serves this as a 200 that meta-refreshes to /orbiters — not an
  // HTTP redirect, and the route policy says preserve. The <script> that also
  // did window.location.replace is dropped; the meta refresh works without JS.
  'interplanetary-players': (rec) => {
    rec.redirectTo = '/orbiters';
    rec.noindex = true;
    return '<p>redirecting to <a href="/orbiters">/orbiters</a>…</p>';
  },

  // The interactive diagram was a React app loaded from unpkg with
  // @babel/standalone transpiling its JSX in the visitor's browser — three
  // third-party scripts on page load, which the no-cookie-banner gate forbids.
  // MW-9 rebuilt it as the one approved React island; the body here is the
  // prose around it, and `island` is what mounts it. The diagram itself is
  // src/components/react/HelixDiagram.tsx and is not generated from source.
  'helix-diagram': (rec) => {
    rec.island = 'helix';
    return (
      '<h1>helix</h1>\n\n' +
      '<p>the technical installation diagram for helix at the espacio de arte contemporáneo, ' +
      'montevideo, 2025. three identical stations around a central router, with the cabling ' +
      'and the wireless paths drawn separately so each can be isolated.</p>\n\n' +
      '<p>choose a layer to show only that kind of connection, or a station to highlight it. ' +
      'the written description below the diagram carries the same topology in words.</p>'
    );
  },
};

// ── 5. write the records ─────────────────────────────────────────────────

const GENESIS = /^(skyl0|skyl00|skyl000|sphe0|revx000|rthw00)$/;

function kindOf(key, area) {
  if (/^lab\/(en|es)\//.test(key)) return 'lab';
  if (GENESIS.test(key)) return 'genesis';
  if (/^collect\/docs\//.test(key)) return 'doc';
  if (/^collect\/cards\//.test(key)) return 'collect-card';
  if (key === 'index' || key === 'collect' || key === 'tree') return 'index';
  return 'page';
}

/**
 * Which legacy Jekyll collection a source belonged to, and where it sat in it.
 *
 * `site.documentation` is the set of files under `collections/_documentation/`,
 * full stop — it is not "every page whose URL starts /docs/". Deriving the list
 * from the URL instead lost `/privacy.html`, which lives in that collection but
 * is published at the site root, so the Documentation index shipped nine entries
 * where production renders ten.
 *
 * `indexOrder` is the collection-relative path. Jekyll orders an output
 * collection by that path, and because `.` sorts before `/`, `03-ent-cards.md`
 * precedes `03-ent-cards/01-sustainability.md` — which is exactly the order
 * production renders. Sorting by it reproduces the live page rather than
 * approximating it.
 */
const INDEX_COLLECTION = {
  '_documentation': 'collect-docs',
  '_cards': 'collect-cards',
  '_lab': 'lab',
};

function indexMembership(rel) {
  const m = /^collections\/(_[a-z]+)\/([\s\S]+)$/.exec(rel);
  if (!m) return null;
  const group = INDEX_COLLECTION[m[1]];
  return group ? { group, order: m[2] } : null;
}

/**
 * Groups whose index page renders a cover per entry, so a cover is worth
 * carrying at all.
 *
 * Computed ahead of the write loop because the decision belongs to the *index*
 * page and applies to every *member*. Carrying a cover nobody renders is not
 * free: collect-media.mjs copies whatever a record references, so an unrendered
 * cover puts megabytes of unreachable image into git forever.
 */
const coveredGroups = new Set();
for (const m of matched) {
  const inc = indexOfInclude(parse(readFileSync(m.source.abs, 'utf8')).body);
  if (inc?.covers) coveredGroups.add(inc.name);
}

// ── 5a. the Lab index ────────────────────────────────────────────────────

/**
 * A one-line plain-text reduction of a legacy body, for an index excerpt.
 *
 * Jekyll had no `excerpt_separator` in any Lab article, so `a.excerpt` was the
 * *whole rendered document* run through `strip_html` and truncated. This does
 * the same reduction against the same source: markup out, syntax out, the
 * reading order kept.
 */
function bodyToText(body) {
  return body
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .replace(/\{%[\s\S]*?%\}/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\{:[.#][^}\n]*\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Liquid's `truncate` — the ellipsis counts towards the length. */
function truncate(text, length = 200, ellipsis = '…') {
  return text.length <= length ? text : text.slice(0, length - ellipsis.length).trimEnd() + ellipsis;
}

/**
 * The date Jekyll gave a document.
 *
 * Frontmatter first, then the `YYYY-MM-DD-` filename prefix, which is where 13
 * of the 20 Lab articles keep theirs — Jekyll reads it off the name of a file in
 * an output collection, and reading only `date:` left those 13 undated, which
 * silently dropped the whole of 2024 and 2023 out of the year-grouped index.
 */
function dateOf(data, rel) {
  if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.date)) return data.date.slice(0, 10);
  const m = /(^|\/)(\d{4}-\d{2}-\d{2})-/.exec(rel);
  return m ? m[2] : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-03-24` → `Mar 24, 2026`, the format the Lab index has always shown. */
function readableDate(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

const escapeText = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The Lab index, rendered into the page body.
 *
 * `{% include article-list.html … group_by='year' show_date=true show_excerpt=true %}`
 * rendered a year heading, a title heading, a formatted date, a 200-character
 * excerpt and a tag list per article — 26 headings and 20 excerpts. The
 * migration reduced the whole include to `indexOf: 'lab'`, and the generic index
 * the route renders from that is one flat `<ul>` of title · ISO date · language:
 * 1016 characters against production's 5792, with every excerpt and every tag
 * gone.
 *
 * It is written here, into the record's own body, because the generic index
 * lives in `src/pages/[...page].astro` and this session does not own that file.
 * `indexOf` is dropped from this one record so the two do not both render.
 *
 * The shape is the design spec's page family 02: year-grouped rows, one rule per
 * year group — the single place the spec allows a rule inside a page body — and
 * no rule between rows.
 *
 * Tags are chips, not links. Production linked each to `/lab.html?tag=X` and a
 * `<script>` on the page hid the non-matching rows; MW-7 forbids application
 * JavaScript outside the Helix island, so those links would land on an
 * unfiltered `/lab` and do nothing. The tag text is what carries the meaning and
 * it is all kept.
 */
function labIndexHtml(entries) {
  const byYear = new Map();
  for (const e of entries) {
    const year = e.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(e);
  }

  const out = ['<div class="index index--lab">'];
  for (const year of [...byYear.keys()].sort().reverse()) {
    out.push(`<section class="index-year" aria-labelledby="lab-${year}">`);
    out.push(`<h2 class="index-year__label" id="lab-${year}">${year}</h2>`);
    out.push('<hr class="index-year__rule" />');
    out.push('<ul class="index-rows" role="list">');
    for (const e of byYear.get(year)) {
      out.push('<li class="index-row">');
      out.push(`<h3 class="index-row__title"><a href="${escapeAttr(e.href)}">${escapeText(e.title)}</a></h3>`);
      out.push(`<time class="index-row__date" datetime="${e.date}">${readableDate(e.date)}</time>`);
      if (e.excerpt) out.push(`<p class="index-row__excerpt">${escapeText(e.excerpt)}</p>`);
      if (e.tags.length) {
        out.push(
          '<ul class="index-row__tags" role="list">' +
            e.tags.map((t) => `<li class="index-row__tag">${escapeText(t)}</li>`).join('') +
            '</ul>',
        );
      }
      out.push('</li>');
    }
    out.push('</ul>');
    out.push('</section>');
  }
  out.push('</div>');
  return out.join('\n');
}

/**
 * Every Lab article, in the order the index shows them: newest first, and inside
 * a day the order Jekyll itself used — the collection-relative source path.
 */
function collectLabEntries() {
  const entries = [];
  for (const m of matched) {
    if (!/^collections\/_lab\//.test(m.source.rel)) continue;
    const raw = readFileSync(m.source.abs, 'utf8');
    const { data, body } = parse(raw);
    const date = dateOf(data, m.source.rel);
    if (!date) continue;
    entries.push({
      href: encodeURI(`/${m.key}`),
      title: pageTitleFrom(data, m.key),
      date,
      order: m.source.rel,
      tags: typeof data.tags === 'string' ? data.tags.split(/\s+/).filter(Boolean) : [],
      excerpt: truncate(bodyToText(body)),
    });
  }
  /**
   * `sort: 'date' | reverse` in the legacy include. Jekyll's stable sort leaves
   * same-day articles in document order — which is source-path order — and
   * `reverse` then flips the whole array, so within a day the *last* path comes
   * first. That is why production lists es/ip-3, es/ip-2, es/ip-1, en/ip-3 …
   */
  return entries.sort((a, b) => (a.date === b.date ? b.order.localeCompare(a.order) : b.date.localeCompare(a.date)));
}

const LAB_ENTRIES = collectLabEntries();

/**
 * A cover image that this repository can actually serve.
 *
 * Only a root-relative path that exists in the read-only checkout qualifies:
 * collect-media.mjs copies exactly those into media/, so the reference resolves
 * first-party. Legacy `cover:` values that are absolute URLs — the Dropbox card
 * art — are deliberately not carried. Carrying them would fire a third-party
 * request on page load, which is the MW-6 BLOCKED this build must not widen.
 */
function coverFrom(data, origin) {
  const raw = typeof data.cover === 'string' ? data.cover.trim().replace(/^["']|["']$/g, '') : '';
  if (!raw || /^(https?:)?\/\//i.test(raw)) return null;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (!/^\/(img|assets)\//.test(path)) return null;
  let onDisk = path.slice(1);
  try {
    onDisk = decodeURIComponent(onDisk);
  } catch {
    /* malformed escape — compare literally */
  }
  return existsSync(join(SITES[origin], onDisk)) ? path : null;
}

/**
 * The page's own name, in the casing its author wrote.
 *
 * Never lowercased here. Lowercase is a `text-transform` in the stylesheet, so
 * it applies to what a reader sees and not to what they copy, quote, hear from a
 * screen reader or read in a search result.
 */
function pageTitleFrom(data, key) {
  for (const k of ['title', 'card_title']) {
    if (typeof data[k] === 'string' && data[k].trim()) {
      return data[k].trim().replace(/^["']|["']$/g, '');
    }
  }
  return key.split('/').pop().replace(/[-_]+/g, ' ').replace(/\.\d+/g, '').trim() || 'Maar World';
}

/** What production put in `<title>` — its own string wherever the crawl has one. */
function documentTitleFrom(key, origin, pageTitle, problems) {
  const live = PRODUCTION_TITLE.get(key);
  if (live) return live;
  problems.push(`${key}: no production <title> in the frozen manifest — composed from the page title and the brand`);
  return `${pageTitle} - ${BRAND[origin] ?? BRAND['maar.world']}`;
}

/** outputPath -> a filename that survives every filesystem, reversibly. */
function fileNameFor(outputPath) {
  return `${outputPath.replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}.md`;
}

const yaml = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, '.gitkeep'), '');

const problems = [];
const written = [];
const emitted = new Set();
/** Pages whose heading outline had a gap the theme's own <h1> used to hide. */
const headingLevelsChanged = [];

for (const m of matched) {
  const area = AREA[m.meta.origin];
  const { data, body } = parse(readFileSync(m.source.abs, 'utf8'));
  const kind = kindOf(m.key, area);
  const outputPath = m.meta.indexForm ? (m.key === 'index' ? 'index' : `${m.key}/index`) : m.key;

  if (emitted.has(outputPath)) {
    problems.push(`${outputPath}: DUPLICATE output path`);
    continue;
  }

  const t = transform(body, { key: m.key, area, origin: m.meta.origin });
  problems.push(...t.problems);

  const pageTitle = pageTitleFrom(data, m.key);
  const record = {
    outputPath,
    title: documentTitleFrom(m.key, m.meta.origin, pageTitle, problems),
    area,
    kind,
    surface: kind === 'doc' ? 'paper' : 'dark',
    inNav: false,
    tags: typeof data.tags === 'string' ? data.tags.split(/\s+/).filter(Boolean) : [],
    source: `${m.meta.origin}/${m.source.rel}`,
  };
  if (/^lab\/en\//.test(m.key)) record.lang = 'en';
  if (/^lab\/es\//.test(m.key)) record.lang = 'es';
  if (data.noindex === true) record.noindex = true;
  /**
   * The Lab index is written into the body instead — see `labIndexHtml`. Both
   * would render otherwise, and the generic one carries neither the excerpts
   * nor the tags.
   */
  const ownIndex = t.wantsIndex?.name === 'lab' ? labIndexHtml(LAB_ENTRIES) : null;
  if (t.wantsIndex && !ownIndex) {
    record.indexOf = t.wantsIndex.name;
    if (t.wantsIndex.covers) record.indexCovers = true;
  }

  const member = indexMembership(m.source.rel);
  if (member) {
    record.indexGroup = member.group;
    record.indexOrder = member.order;
    /**
     * How this entry names itself in an index, as against how the document
     * names itself to a browser tab.
     *
     * `title` is now production's `<title>`, brand suffix and all, because that
     * is the string BaseLayout renders and nothing else can reach it. An index
     * row wants the page's own name — "Sky Sounds", not "Sky Sounds -
     * COLLECT.MAAR.WORLD" — so it is carried separately. The Lab index below
     * uses it; `/collect/documentation` and `/collect/cards` are rendered by
     * `src/pages/[...page].astro`, which is not this session's to edit, so the
     * field is present and waiting for `indexLabel ?? title` there.
     */
    record.indexLabel = pageTitle;
  }

  if (member && coveredGroups.has(member.group)) {
    const cover = coverFrom(data, m.meta.origin);
    if (cover) record.cover = cover;
  }
  if (typeof data.excerpt === 'string' && data.excerpt.trim() && !data.excerpt.includes('<')) {
    record.description = data.excerpt.trim();
  }
  const recordDate = dateOf(data, m.source.rel);
  if (recordDate) record.date = recordDate;

  // Card facts the collect card pages need, carried verbatim from the legacy
  // record. Commerce URLs are deliberately not carried — the schema bans them.
  for (const k of ['suit_title', 'card_title', 'card_image', 'card_description', 'snip_player']) {
    if (typeof data[k] === 'string' && data[k].trim()) record[k] = data[k].trim();
  }

  let finalBody = t.body;

  /**
   * Jekyll's layouts rendered `title` and `excerpt` above the body whenever a
   * page did not open with its own heading — which is why `/collect/decks` and
   * `/collect/suits` are not blank in production despite having empty bodies.
   * Astro has no such layout, so the heading is materialised here rather than
   * shipping a page whose only visible text is a browser tab title.
   */
  /**
   * "Opens with its own heading" is not the same question as "contains an
   * `<h1>` somewhere", and asking the second one is how `/collect/docs/mw/terms`
   * lost `TERMS AND CONDITIONS` and both `dadada` articles lost their title.
   * Terms opens with a body `# Terms and Conditions` — production printed the
   * frontmatter title above it as well, differently cased, and both were on the
   * page. Dadada carries `# 4 the dadadaistS` in the middle of the article, and
   * that satisfied a test that only asked whether an `<h1>` existed anywhere.
   *
   * So the title is also materialised when production's own first heading was
   * the title and the migrated body's first heading is something else. The
   * manifest decides, so no page gains a heading production did not serve.
   */
  // Collect card pages get their heading from the route, off the card fields.
  const bodyOpener = firstTopHeading(finalBody);
  const productionLedWithTitle = (PRODUCTION_HEADINGS.get(m.key) || [])[0] === pageTitle;
  if (kind !== 'collect-card' && (bodyOpener === null || (productionLedWithTitle && bodyOpener !== pageTitle))) {
    // The page's own name, never the branded `<title>` — an `<h1>` reading
    // "About - MAAR WORLD" would say the brand twice on every page.
    const lead = [`# ${pageTitle}`];
    // The excerpt the theme printed under the title stands in for a body that
    // has none. A body that already has one does not need it repeated.
    if (bodyOpener === null && record.description) lead.push('', record.description);
    if (bodyOpener !== null) {
      problems.push(`${outputPath}: restored the article title heading "${pageTitle}" — production led with it, the body opens with "${bodyOpener}"`);
    }
    finalBody = `${lead.join('\n')}\n\n${finalBody}`.trim();
  }

  if (kind === 'collect-card') finalBody = `${finalBody}\n\n${CARD_TAIL}\n`.trim();

  /**
   * The outline, after the title heading is in place and before the index is
   * appended, because those two are the only headings this script owns and both
   * are already at the level they mean.
   *
   * A Collect card page's `<h1>` is rendered by the route from `card_title`, so
   * the body leads with no title of its own; every other page's does, whether it
   * was materialised above or was already the body's first heading.
   */
  const outline = normaliseHeadingLevels(finalBody, { leadsWithTitle: kind !== 'collect-card' });
  if (outline.changed) {
    headingLevelsChanged.push(`${outputPath} (${outline.changed})`);
    finalBody = outline.body;
  }

  if (ownIndex) finalBody = `${finalBody}\n\n${ownIndex}\n`;

  if (SPECIAL[m.key]) finalBody = SPECIAL[m.key](record);

  const parsed = SCHEMAS.pages.safeParse(record);
  if (!parsed.success) {
    problems.push(`${outputPath}: SCHEMA ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    continue;
  }

  const fm = Object.entries(record).map(([k, v]) => `${k}: ${yaml(v)}`).join('\n');
  writeFileSync(join(OUT, fileNameFor(outputPath)), `---\n${fm}\n---\n\n${finalBody}\n`);
  emitted.add(outputPath);
  written.push(outputPath);
}

// ── 6. report ────────────────────────────────────────────────────────────

console.log(`targets required : ${targets.size}`);
console.log(`matched to source: ${matched.length}`);
console.log(`written          : ${written.length}`);
console.log(`UNMATCHED        : ${unmatched.length}`);
console.log(
  `drops consumed   : ${decidedDrops.length} decided ` +
    `(${undecidedDrops.length} dropKind:unresolved left intact — an open question is not a deletion)`,
);
for (const u of unmatched) console.log(`  ! ${u.origin}  ${u.key}  (looked for "${u.want}")`);

if (headingLevelsChanged.length) {
  console.log(
    `\nheading levels normalised on ${headingLevelsChanged.length} page(s) — ` +
      `the theme's own <h1> used to hide the gap:\n  ${headingLevelsChanged.join('\n  ')}`,
  );
}

const unresolved = problems.filter((p) => /UNRESOLVED|SCHEMA|DUPLICATE/.test(p));
if (problems.length) {
  console.log(`\nproblems (${problems.length}, ${unresolved.length} blocking):`);
  for (const p of problems) console.log(`  ${p}`);
}

if (unmatched.length || unresolved.length) process.exitCode = 1;
