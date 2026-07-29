#!/usr/bin/env node
/**
 * Freeze the production route manifest by crawling the three live sites.
 *
 * Crawl production. Never generate this from local `_site/` output: GitHub Pages
 * ignores the repo Gemfile and builds with its own Jekyll, so local output and
 * production come from different toolchains, and Tree's local `_site/` is months
 * stale. A manifest built from the repos would encode a fiction and every later
 * check would validate against it.
 *
 * Sources, in order:
 *   1. each site's sitemap.xml
 *   2. a breadth-first link crawl from each site root
 *   3. routes/seeds.json — URLs nothing links to (NFC codes, /resume, orphans)
 *   4. HOST_FILES — conventional host-level URLs nothing links to either
 *   5. same-host resource references on every page crawled (stylesheets,
 *      scripts, images, media), which no `<a href>` ever points at
 *
 * (4) and (5) exist because the first version of this file followed only
 * `<a href>` and therefore froze a manifest of HTML pages and four PDFs while
 * describing itself as a record of every URL production serves. It was not.
 * Missing from it, all 200 on all three origins: /robots.txt, /sitemap.xml,
 * /feed.xml, /feed, /404.html, /404, /site.webmanifest, /browserconfig.xml,
 * /favicon.ico, /CNAME, /assets/css/main.css (155 KB, linked by every page),
 * /Dockerfile.dev, /docker/nginx.conf, /tools/assert-url.js, and ~345 other
 * static assets. A live RSS feed with subscribers was invisible to the
 * contract, so nothing downstream could notice it being dropped.
 *
 * Records reality and nothing else. It does not classify, tidy or fix anything:
 * policy is authored separately in routes/policy.json.
 *
 *   node scripts/freeze-routes.mjs [--concurrency 5] [--max-pages 3000]
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './lib/artifacts.mjs';
import { plainText, decodeAttrEntities } from './lib/html-text.mjs';

const SITES = ['maar.world', 'collect.maar.world', 'tree.maar.world'];
const USER_AGENT = 'maar-world-route-freeze/1.0 (+migration contract crawler)';

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const CONCURRENCY = argVal('concurrency', 5);
const MAX_PAGES = argVal('max-pages', 3000);

/**
 * Host-level URLs no page links to and no sitemap lists, probed explicitly on
 * every origin. Recorded only when they answer with something other than 404,
 * so a speculative probe never invents a route.
 *
 * Three groups, and they are here for three different reasons:
 *
 *  - externally depended on: /robots.txt, /sitemap.xml, /feed.xml, /feed,
 *    /favicon.ico, /site.webmanifest, /browserconfig.xml, /404.html. A feed is
 *    polled by subscribers' readers, a sitemap by Search Console, a favicon by
 *    every bookmark. Nothing links to any of them, so the link crawl was
 *    structurally incapable of seeing them.
 *  - published by accident: /Dockerfile.dev, /docker/nginx.conf,
 *    /tools/assert-url.js, /CNAME. Jekyll copied the repository root into
 *    _site and GitHub Pages serves the result, so build files and deploy
 *    topology are public. Recording them is the whole point — nobody can
 *    decide about a URL they cannot see.
 *  - the /z/ theme tree, including /z which 301s to a /z/ that 404s.
 *
 * Speculative entries (atom.xml, humans.txt, …) cost one request and are
 * dropped unless production answers; their absence is worth proving once.
 */
const HOST_FILES = [
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap-index.xml',
  '/feed.xml',
  '/feed',
  '/atom.xml',
  '/rss.xml',
  '/404.html',
  '/404',
  '/favicon.ico',
  '/site.webmanifest',
  '/manifest.json',
  '/browserconfig.xml',
  '/CNAME',
  '/humans.txt',
  '/.well-known/security.txt',
  '/z',
  '/z/',
  '/z/README-zh.md',
  '/Dockerfile.dev',
  '/docker/nginx.conf',
  '/tools/assert-url.js',
];

// --- tiny helpers --------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The function that DEFINES `textSha256` in the frozen manifest.
 *
 * Shared with author-content-expectations.mjs, which recomputes the same hash
 * to decide whether a legacy build reproduces production. They were two
 * identical copies; they are one function now, so the comparison is structural.
 */
const text = plainText;

/**
 * Decode the HTML entities that appear in attribute values. Without this an
 * `href` written as `?a=1&amp;raw=1` is recorded as a URL literally containing
 * "&amp;", which is not the URL production actually requests.
 */
const decodeEntities = decodeAttrEntities;

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return m ? m[1] : null;
};

function fingerprint(html) {
  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => text(m[2]))
    .filter(Boolean)
    .slice(0, 40);

  const canonicalTag = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(html);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const robotsTag = /<meta\b[^>]*name=["']robots["'][^>]*>/i.exec(html);

  const outbound = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1].trim());
    if (/^https?:\/\//i.test(href)) outbound.add(href.split("#")[0]);
  }

  /**
   * URLs production fetches when the page loads — image, iframe, script and
   * stylesheet sources, as distinct from anchor hrefs.
   *
   * These matter for two separate reasons: they are the third-party requests
   * that decide whether a cookie banner is legally required, and without them
   * the external-link baseline is incomplete, so re-hosting the same card art
   * would look like a newly introduced external link.
   */
  const resources = new Set();
  for (const m of html.matchAll(/<(script|link|iframe|img|source|video|audio|embed|object|track)\b([^>]*)>/gi)) {
    const a = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(m[2] || '');
    if (!a) continue;
    const raw = decodeEntities(a[1].trim());
    if (/^https?:\/\//i.test(raw)) resources.add(raw.split('#')[0]);
  }

  const body = text(html);

  return {
    title: titleMatch ? text(titleMatch[1]) : null,
    resourceLinks: [...resources].sort(),
    canonical: canonicalTag ? attr(canonicalTag[0], 'href') : null,
    robots: robotsTag ? attr(robotsTag[0], 'content') : null,
    headings,
    imageCount: (html.match(/<img\b/gi) || []).length,
    iframeCount: (html.match(/<iframe\b/gi) || []).length,
    outboundLinks: [...outbound].sort(),
    textLength: body.length,
    textSha256: createHash('sha256').update(body).digest('hex').slice(0, 16),
  };
}

/** Resolve one raw attribute value to a same-host path, or null. */
function sameHostPath(raw, origin) {
  const href = decodeEntities((raw || '').trim());
  if (!href || href.startsWith('#') || /^(mailto|tel|data|javascript|blob):/i.test(href)) return null;
  try {
    const u = new URL(href, `https://${origin}/`);
    if (u.hostname !== origin) return null;
    return u.pathname + (u.search || '');
  } catch {
    return null;
  }
}

/** Same-host, crawlable links found in a page. Returned as encoded path strings. */
function internalLinks(html, origin) {
  const found = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const p = sameHostPath(m[1], origin);
    if (p) found.add(p);
  }
  return [...found];
}

/**
 * Same-host resources the page *fetches* — stylesheets, scripts, icons,
 * images, media — as opposed to the pages it links to.
 *
 * These are URLs production serves, and they were entirely absent from the
 * frozen contract because discovery followed only `<a href>`. Nothing on any
 * of the three sites links to /assets/css/main.css with an anchor; every page
 * loads it with a `<link>`. It is 155 KB, it is served, and the contract
 * claimed it did not exist.
 *
 * Recorded, never crawled into: an asset has no outbound links to follow, and
 * treating a stylesheet as a page would put its `url(...)` references into the
 * external-link baseline as if they were anchors.
 */
function internalResources(html, origin) {
  const found = new Set();
  const add = (raw) => {
    const p = sameHostPath(raw, origin);
    if (p) found.add(p);
  };

  const TAGS = /<(link|script|img|source|video|audio|embed|object|track|iframe|input)\b([^>]*)>/gi;
  for (const m of html.matchAll(TAGS)) {
    const attrs = m[2] || '';

    // `<link>` covers two unrelated things: subresources the browser fetches,
    // and metadata that merely names a URL. Only the first kind is a route.
    // The theme emits `<link itemprop="url" href="www.maar.world">` — schemeless
    // structured data, not a request — which resolves to a `/www.maar.world`
    // that 404s and is not a URL production serves.
    if (m[1].toLowerCase() === 'link') {
      const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(attrs);
      const FETCHED = /^(stylesheet|icon|shortcut icon|apple-touch-icon(-precomposed)?|mask-icon|manifest|alternate|preload|prefetch|image_src)$/i;
      if (!rel || !rel[1].trim().split(/\s+/).some((token) => FETCHED.test(token) || FETCHED.test(rel[1].trim()))) continue;
    }

    for (const name of ['src', 'href', 'data', 'poster']) {
      const a = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
      if (a) add(a[1]);
    }
    // srcset: "a.png 1x, b.png 2x" — the URL is the first token of each part.
    const ss = /\bsrcset\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (ss) for (const part of ss[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }

  // <meta name="msapplication-config" content="/browserconfig.xml"> and the
  // og:image / twitter:image family, which are fetched by other people's
  // servers rather than by the browser — and are therefore exactly the kind of
  // URL that breaks silently.
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = m[1] || '';
    if (!/\b(?:name|property)\s*=\s*["'](?:msapplication-config|og:image|twitter:image)["']/i.test(attrs)) continue;
    const c = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (c) add(c[1]);
  }

  return [...found];
}

async function fetchOnce(url, { method = 'GET' } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'manual',
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    signal: AbortSignal.timeout(30000),
  });
  const contentType = res.headers.get('content-type');
  const isText = /text\/|application\/(xml|json|xhtml)/i.test(contentType || '');
  const body = isText ? await res.text() : '';
  const declaredLength = Number(res.headers.get('content-length'));

  // `bytes` is the size of the RESOURCE, always — not the size of the transfer.
  //
  // This used to prefer the Content-Length header for text responses and the
  // decoded length for binary ones, which meant the column silently mixed two
  // units: every HTML page is served gzipped, so its Content-Length is the
  // compressed size, while a PNG's was its real size. /z/README-zh was recorded
  // as 14124 bytes and is 45078. A contract that records "byte size" has to
  // record one thing.
  const transferBytes = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null;

  if (!isText) {
    // Drain binary bodies so the socket is released, but don't hold them.
    try {
      const buf = await res.arrayBuffer();
      return {
        status: res.status,
        contentType,
        location: res.headers.get('location'),
        bytes: buf.byteLength,
        transferBytes,
        body: '',
      };
    } catch {
      return {
        status: res.status,
        contentType,
        location: res.headers.get('location'),
        bytes: transferBytes,
        transferBytes,
        body: '',
      };
    }
  }

  return {
    status: res.status,
    contentType,
    location: res.headers.get('location'),
    bytes: Buffer.byteLength(body),
    transferBytes,
    body,
  };
}

async function probe(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastErr = err;
      await sleep(400 * (attempt + 1));
    }
  }
  return { status: 0, error: String(lastErr && lastErr.message ? lastErr.message : lastErr), contentType: null, location: null, bytes: null, body: '' };
}

async function sitemapUrls(origin) {
  const out = [];
  const res = await probe(`https://${origin}/sitemap.xml`);
  if (res.status !== 200 || !res.body) return out;
  for (const m of res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1]);
      if (u.hostname === origin) out.push(u.pathname + (u.search || ''));
    } catch {
      /* skip */
    }
  }
  return out;
}

// --- crawl ---------------------------------------------------------------

async function crawlSite(origin, seedPaths) {
  const queue = [];
  const queued = new Set();
  const results = new Map();

  /**
   * path -> the live pages that point at it.
   *
   * Recorded independently of the crawl queue, because the queue de-duplicates
   * and seeds are enqueued first: an image that is both seeded from a checkout
   * and referenced by a live page would otherwise be filed under `seed` and
   * read as an orphan. The distinction matters — "live and shown on a page" and
   * "live and referenced by nothing" are different facts and deserve different
   * policies — so it is measured rather than inferred from discovery order.
   */
  const referrers = new Map();
  const noteRef = (path, from) => {
    if (!path.startsWith('/')) return;
    if (!referrers.has(path)) referrers.set(path, new Set());
    referrers.get(path).add(from);
  };

  // A speculative probe is a guess — a filename read out of a read-only legacy
  // checkout, or a conventional host path nothing links to. It becomes a route
  // only if production answers. Recording a speculative 404 would put a URL
  // into the contract that production never served, which is the opposite of
  // what a frozen record of production is for. A 404 reached from a real
  // reference is different, and is still recorded: that is production serving
  // a broken link, and it is a fact about production.
  const enqueue = (path, source, speculative = false) => {
    // Keep the path exactly as production spells it. No normalising, no
    // decoding, no trailing-slash tidying — the spelling *is* the contract.
    if (!path.startsWith('/')) return;
    if (queued.has(path)) return;
    queued.add(path);
    queue.push({ path, source, speculative });
  };

  enqueue('/', 'root');
  for (const p of await sitemapUrls(origin)) enqueue(p, 'sitemap');
  for (const { url: p, speculative } of seedPaths) enqueue(p, 'seed', speculative);

  let processed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && processed < MAX_PAGES) {
      const item = queue.shift();
      if (!item) break;
      processed += 1;

      const url = `https://${origin}${item.path}`;
      const res = await probe(url);
      const isHtml = /text\/html/i.test(res.contentType || '');

      if (item.speculative && (res.status === 404 || res.status === 0)) {
        await sleep(60);
        continue;
      }

      const record = {
        url: item.path,
        origin,
        status: res.status,
        contentType: res.contentType,
        kind: isHtml ? 'page' : 'asset',
        bytes: res.bytes,
        discoveredVia: item.source,
      };
      if (res.transferBytes && res.transferBytes !== res.bytes) record.transferBytes = res.transferBytes;
      if (res.error) record.error = res.error;
      if (res.location) record.redirectsTo = res.location;
      if (isHtml && res.body) Object.assign(record, fingerprint(res.body));

      results.set(item.path, record);

      if (isHtml && res.body && res.status === 200) {
        for (const link of internalLinks(res.body, origin)) {
          noteRef(link, item.path);
          enqueue(link, `link:${item.path}`);
        }
        // Resources are recorded, not crawled: `enqueue` probes them, and the
        // `isHtml` guard above stops the crawl descending into a stylesheet.
        for (const r of internalResources(res.body, origin)) {
          noteRef(r, item.path);
          enqueue(r, `asset:${item.path}`);
        }
      }
      await sleep(60); // be polite to a small static host
    }
  });

  await Promise.all(workers);
  if (queue.length) {
    console.warn(`  ! ${origin}: stopped at max-pages, ${queue.length} URLs left unvisited`);
  }

  // Second pass: host-level files. Nothing links to them and no sitemap lists
  // them, so neither the crawl nor the seed file can reach them. Recorded only
  // when production answers with something other than 404 — a probe that misses
  // must not invent a route.
  let hi = 0;
  const pending = HOST_FILES.filter((p) => !results.has(p));
  const hostWorkers = Array.from({ length: CONCURRENCY }, async () => {
    while (hi < pending.length) {
      const path = pending[hi++];
      if (results.has(path)) continue;
      const res = await probe(`https://${origin}${path}`);
      if (res.status === 404 || res.status === 0) {
        await sleep(60);
        continue;
      }
      const isHtml = /text\/html/i.test(res.contentType || '');
      const record = {
        url: path,
        origin,
        status: res.status,
        contentType: res.contentType,
        kind: isHtml ? 'page' : 'asset',
        bytes: res.bytes,
        discoveredVia: 'host-file',
      };
      if (res.transferBytes && res.transferBytes !== res.bytes) record.transferBytes = res.transferBytes;
      if (res.location) record.redirectsTo = res.location;
      if (isHtml && res.body) Object.assign(record, fingerprint(res.body));
      results.set(path, record);
      await sleep(60);
    }
  });
  await Promise.all(hostWorkers);

  // Second pass: the `.html` twin of every live HTML page.
  //
  // GitHub Pages serves `about.html` and silently falls back for `/about`, so
  // BOTH spellings are live for every page — not just for the NFC codes. The
  // crawl only finds whichever form happens to be linked, so the twins are
  // probed explicitly. This is the same host behaviour the physical cards
  // depend on, and it has to be recorded as part of the contract rather than
  // rediscovered later.
  const twins = [];
  for (const r of results.values()) {
    if (r.status !== 200 || !/text\/html/i.test(r.contentType || '')) continue;
    if (r.url.includes('?')) continue;

    let twin;
    if (r.url === '/') twin = '/index.html';
    else if (r.url.endsWith('.html')) twin = r.url.slice(0, -'.html'.length);
    else if (!/\.[a-z0-9]{2,5}$/i.test(r.url)) twin = `${r.url}.html`;

    if (twin && !results.has(twin)) twins.push({ from: r.url, twin });
  }

  let ti = 0;
  const twinWorkers = Array.from({ length: CONCURRENCY }, async () => {
    while (ti < twins.length) {
      const { from, twin } = twins[ti++];
      if (results.has(twin)) continue;
      const res = await probe(`https://${origin}${twin}`);
      const isHtml = /text\/html/i.test(res.contentType || '');
      const record = {
        url: twin,
        origin,
        status: res.status,
        contentType: res.contentType,
        kind: isHtml ? 'page' : 'asset',
        bytes: res.bytes,
        discoveredVia: `twin:${from}`,
      };
      if (res.transferBytes && res.transferBytes !== res.bytes) record.transferBytes = res.transferBytes;
      if (res.location) record.redirectsTo = res.location;
      if (isHtml && res.body) Object.assign(record, fingerprint(res.body));
      results.set(twin, record);
      await sleep(60);
    }
  });
  await Promise.all(twinWorkers);

  // Fourth pass: where a recorded route redirects somewhere on the same origin,
  // record what the target answers. `maar.world/z` is a 301 to `/z/`, and `/z/`
  // is a 404 — a redirect that leads nowhere. That is a fact about what
  // production serves, and it is not visible from the 301 alone. The target
  // itself is deliberately NOT added as a route: it was never discovered, only
  // pointed at.
  const dangling = [...results.values()].filter((r) => r.redirectsTo);
  for (const r of dangling) {
    const target = sameHostPath(r.redirectsTo, origin);
    if (!target) continue;
    const known = results.get(target);
    if (known) {
      r.redirectTargetStatus = known.status;
      continue;
    }
    const res = await probe(`https://${origin}${target}`);
    r.redirectTargetStatus = res.status;
    await sleep(60);
  }

  // Attach the measured reference counts. A route with none is live and
  // reachable only by typing it: an orphan, not necessarily a dead URL.
  for (const r of results.values()) {
    const refs = referrers.get(r.url);
    r.referenceCount = refs ? refs.size : 0;
    if (refs) r.referencedBy = [...refs].sort().slice(0, 5);
  }

  return [...results.values()].sort((a, b) => a.url.localeCompare(b.url));
}

// --- run -----------------------------------------------------------------

const seedsPath = resolve(ROOT, 'routes/seeds.json');
if (!existsSync(seedsPath)) {
  console.error('routes/seeds.json missing — run: node scripts/collect-seeds.mjs');
  process.exit(1);
}
const seedsFile = JSON.parse(readFileSync(seedsPath, 'utf8'));
const seedsByOrigin = new Map(SITES.map((s) => [s, []]));
const seedReason = new Map();
const SPECULATIVE = new Set(seedsFile.speculativeReasons || []);
for (const s of seedsFile.seeds) {
  seedsByOrigin.get(s.origin)?.push({ url: s.url, speculative: SPECULATIVE.has(s.why) });
  seedReason.set(`${s.origin}${s.url}`, s.why);
}

const started = new Date().toISOString();
const allRoutes = [];

for (const origin of SITES) {
  process.stdout.write(`crawling ${origin} … `);
  const routes = await crawlSite(origin, seedsByOrigin.get(origin) || []);
  for (const r of routes) {
    const why = seedReason.get(`${r.origin}${r.url}`);
    if (why) r.seedReason = why;
  }
  allRoutes.push(...routes);
  const ok = routes.filter((r) => r.status === 200).length;
  console.log(`${routes.length} URLs (${ok} × 200)`);
}

mkdirSync(dirname(resolve(ROOT, 'routes/manifest.production.json')), { recursive: true });
writeFileSync(
  resolve(ROOT, 'routes/manifest.production.json'),
  `${JSON.stringify(
    {
      note: 'Frozen record of what the three production sites served. A contract, not a working file. Later work conforms to it; it never conforms to later work.',
      frozenAt: started,
      completedAt: new Date().toISOString(),
      source: 'live HTTP crawl (sitemaps + link crawl + routes/seeds.json)',
      generator: 'scripts/freeze-routes.mjs',
      sites: SITES,
      routeCount: allRoutes.length,
      routes: allRoutes,
    },
    null,
    2,
  )}\n`,
);

// --- external link baseline ---------------------------------------------
// Many of these are already dead in production. Capturing them now means
// existing rot is never later blamed on the migration.
const externals = new Map();
for (const r of allRoutes) {
  for (const link of [...(r.outboundLinks || []), ...(r.resourceLinks || [])]) {
    if (!externals.has(link)) externals.set(link, []);
    externals.get(link).push(r.url);
  }
}
const byHost = {};
for (const link of externals.keys()) {
  try {
    const h = new URL(link).hostname;
    byHost[h] = (byHost[h] || 0) + 1;
  } catch {
    /* skip */
  }
}

mkdirSync(resolve(ROOT, 'verify'), { recursive: true });

/**
 * `allowedNew` is curated, not crawled: MW-7 added form actions and
 * consent-gated video ids that the MW-4 crawl could not see, and every entry is
 * a reviewed decision. Re-freezing must not discard them. Overwriting it with
 * `[]` on every regeneration turned this file from a baseline into a snapshot,
 * and silently re-armed `verify:links` against nine URLs somebody had already
 * signed off.
 */
const baselinePath = resolve(ROOT, 'verify/external-links-baseline.json');
const priorAllowedNew = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8')).allowedNew || []
  : [];

writeFileSync(
  baselinePath,
  `${JSON.stringify(
    {
      note: 'External links present in production at freeze time, with reference counts. Liveness is recorded separately by check-external-links.mjs — several of these are known to be dead already.',
      frozenAt: started,
      urlCount: externals.size,
      byHost: Object.fromEntries(Object.entries(byHost).sort((a, b) => b[1] - a[1])),
      urls: [...externals.keys()].sort(),
      allowedNewNote:
        'Reviewed exceptions, carried forward across re-freezes. Never regenerated from the crawl — the crawl cannot see a form action or a consent-gated embed id.',
      allowedNew: priorAllowedNew,
    },
    null,
    2,
  )}\n`,
);

const statuses = {};
for (const r of allRoutes) statuses[r.status] = (statuses[r.status] || 0) + 1;
const kinds = {};
for (const r of allRoutes) kinds[r.kind || 'page'] = (kinds[r.kind || 'page'] || 0) + 1;
const types = {};
for (const r of allRoutes) {
  const t = (r.contentType || 'none').split(';')[0];
  types[t] = (types[t] || 0) + 1;
}

console.log(`\nfrozen ${allRoutes.length} routes -> routes/manifest.production.json`);
console.log(`status breakdown: ${JSON.stringify(statuses)}`);
console.log(`kind breakdown  : ${JSON.stringify(kinds)}`);
console.log(`content types   : ${JSON.stringify(types)}`);
const broken = allRoutes.filter((r) => r.redirectTargetStatus && r.redirectTargetStatus >= 400);
for (const r of broken) {
  console.log(`  ! ${r.origin}${r.url} -> ${r.status} -> ${r.redirectsTo} -> ${r.redirectTargetStatus}`);
}
console.log(`external links   -> verify/external-links-baseline.json (${externals.size} URLs, ${Object.keys(byHost).length} hosts)`);
