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

/** Merged-site paths of every route the policy drops, in both spellings. */
const AREA_PREFIX = { 'maar.world': '', 'collect.maar.world': '/collect', 'tree.maar.world': '/tree' };
const DROPPED = new Set(
  policy.routes
    .filter((r) => r.policy === 'drop')
    .flatMap((r) => {
      const p = `${AREA_PREFIX[r.origin] ?? ''}${r.url}`;
      return [p, p.replace(/\.html$/i, ''), `${p.replace(/\.html$/i, '')}.html`];
    }),
);

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

/** Which collection an `article-list` include was rendering. */
function indexOfInclude(body) {
  if (/article-list\.html[\s\S]{0,120}?articles=site\.lab/.test(body)) return 'lab';
  if (/article-list\.html[\s\S]{0,120}?articles=site\.cards/.test(body)) return 'collect-cards';
  if (/article-list\.html[\s\S]{0,120}?articles=site\.documentation/.test(body)) return 'collect-docs';
  return null;
}

/** Strip a whole element (including children) wherever it appears. */
function stripElement(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  let out = html;
  while (re.test(out)) out = out.replace(re, '');
  // Self-closed or unterminated leftovers.
  return out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
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

const BLOCK_TAG = /<(\/?)(div|section|article|header|footer|aside|nav|form|figure|table|ul|ol|main|details|blockquote|picture|video|object|label)\b[^>]*?(\/?)>/gi;

/**
 * Un-indent raw HTML so CommonMark passes it through.
 *
 * Kramdown treated a `<div>` and everything to its matching close as one raw
 * HTML block. CommonMark ends an HTML block at the first blank line, so the
 * next indented line starts a fresh block — and four spaces of indentation make
 * that block an indented *code* block. The visible symptom is a page of legacy
 * markup rendered as escaped source inside `<pre>`.
 *
 * Dedenting inside open HTML fixes it without touching markdown: nested list
 * indentation at depth 0 is left exactly as written, and fenced code is skipped.
 */
function dedentHtmlBlocks(body) {
  const lines = body.split('\n');
  const out = [];
  let depth = 0;
  let fenced = false;

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
    // Inside open HTML, or opening a new one: a tag four columns in becomes an
    // indented code block and the markup ships as visible escaped source.
    const opensHtml = /^\s{4,}<[a-z!/]/i.test(line);
    out.push(!fenced && (depth > 0 || opensHtml) ? line.replace(/^\s+/, '') : line);
    if (fenced) continue;

    for (const m of line.matchAll(BLOCK_TAG)) {
      if (m[1] === '/') depth = Math.max(0, depth - 1);
      else if (m[3] !== '/') depth += 1;
    }
  }
  return out.join('\n');
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

  /**
   * Kramdown inline attribute lists — `{:.success}`, `{:.border.rounded}`. They
   * attached classes from the dead theme, and every markdown engine other than
   * kramdown renders them as literal text. They carry no content.
   */
  out = out.replace(/\{:[.#][^}\n]*\}/g, '');

  out = dedentHtmlBlocks(out);

  const leftover = out.match(/\{\{[\s\S]{0,80}?\}\}|\{%[\s\S]{0,80}?%\}|\{:[.#][^}\n]*\}/g);
  if (leftover) problems.push(`${ctx.key}: UNRESOLVED Liquid ${[...new Set(leftover)].slice(0, 3).join(' ')}`);

  return { body: out.replace(/\n{3,}/g, '\n\n').trim(), problems, wantsIndex };
}

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

function titleFrom(data, key) {
  for (const k of ['title', 'card_title']) {
    if (typeof data[k] === 'string' && data[k].trim()) {
      return data[k].trim().replace(/^["']|["']$/g, '').toLowerCase();
    }
  }
  const leaf = key.split('/').pop().replace(/[-_]+/g, ' ').replace(/\.\d+/g, '').trim();
  return (leaf || 'maar world').toLowerCase();
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

  const record = {
    outputPath,
    title: titleFrom(data, m.key),
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
  if (t.wantsIndex) record.indexOf = t.wantsIndex;
  if (typeof data.excerpt === 'string' && data.excerpt.trim() && !data.excerpt.includes('<')) {
    record.description = data.excerpt.trim();
  }
  if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.date)) record.date = data.date.slice(0, 10);

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
  // Collect card pages get their heading from the route, off the card fields.
  if (kind !== 'collect-card' && !/^#\s|<h1\b/im.test(finalBody)) {
    const lead = [`# ${data.title || record.title}`];
    if (record.description) lead.push('', record.description);
    finalBody = `${lead.join('\n')}\n\n${finalBody}`.trim();
  }

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
for (const u of unmatched) console.log(`  ! ${u.origin}  ${u.key}  (looked for "${u.want}")`);

const unresolved = problems.filter((p) => /UNRESOLVED|SCHEMA|DUPLICATE/.test(p));
if (problems.length) {
  console.log(`\nproblems (${problems.length}, ${unresolved.length} blocking):`);
  for (const p of problems) console.log(`  ${p}`);
}

if (unmatched.length || unresolved.length) process.exitCode = 1;
