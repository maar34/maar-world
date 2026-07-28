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
 *
 * Records reality and nothing else. It does not classify, tidy or fix anything:
 * policy is authored separately in routes/policy.json.
 *
 *   node scripts/freeze-routes.mjs [--concurrency 5] [--max-pages 800]
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './lib/artifacts.mjs';

const SITES = ['maar.world', 'collect.maar.world', 'tree.maar.world'];
const USER_AGENT = 'maar-world-route-freeze/1.0 (+migration contract crawler)';

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const CONCURRENCY = argVal('concurrency', 5);
const MAX_PAGES = argVal('max-pages', 800);

// --- tiny helpers --------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Decode the HTML entities that appear in attribute values. Without this an
 * `href` written as `?a=1&amp;raw=1` is recorded as a URL literally containing
 * "&amp;", which is not the URL production actually requests.
 */
const decodeEntities = (s) =>
  s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/');

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

/** Same-host, crawlable links found in a page. Returned as encoded path strings. */
function internalLinks(html, origin) {
  const found = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    let href = decodeEntities(m[1].trim());
    if (!href || href.startsWith('#') || /^(mailto|tel|data|javascript):/i.test(href)) continue;
    try {
      const u = new URL(href, `https://${origin}/`);
      if (u.hostname !== origin) continue;
      if (!/\.(html?|pdf)$/i.test(u.pathname) && /\.[a-z0-9]{2,5}$/i.test(u.pathname)) {
        // asset (png, css, js…) — record separately, don't crawl into it
      }
      found.add(u.pathname + (u.search || ''));
    } catch {
      /* malformed href */
    }
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

  if (!isText) {
    // Drain binary bodies so the socket is released, but don't hold them.
    try {
      const buf = await res.arrayBuffer();
      return {
        status: res.status,
        contentType,
        location: res.headers.get('location'),
        bytes: buf.byteLength,
        body: '',
      };
    } catch {
      return { status: res.status, contentType, location: res.headers.get('location'), bytes: declaredLength || null, body: '' };
    }
  }

  return {
    status: res.status,
    contentType,
    location: res.headers.get('location'),
    bytes: Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : Buffer.byteLength(body),
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

  const enqueue = (path, source) => {
    // Keep the path exactly as production spells it. No normalising, no
    // decoding, no trailing-slash tidying — the spelling *is* the contract.
    if (!path.startsWith('/')) return;
    if (queued.has(path)) return;
    queued.add(path);
    queue.push({ path, source });
  };

  enqueue('/', 'root');
  for (const p of await sitemapUrls(origin)) enqueue(p, 'sitemap');
  for (const p of seedPaths) enqueue(p, 'seed');

  let processed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && processed < MAX_PAGES) {
      const item = queue.shift();
      if (!item) break;
      processed += 1;

      const url = `https://${origin}${item.path}`;
      const res = await probe(url);
      const isHtml = /text\/html/i.test(res.contentType || '');

      const record = {
        url: item.path,
        origin,
        status: res.status,
        contentType: res.contentType,
        bytes: res.bytes,
        discoveredVia: item.source,
      };
      if (res.error) record.error = res.error;
      if (res.location) record.redirectsTo = res.location;
      if (isHtml && res.body) Object.assign(record, fingerprint(res.body));

      results.set(item.path, record);

      if (isHtml && res.body && res.status === 200) {
        for (const link of internalLinks(res.body, origin)) enqueue(link, `link:${item.path}`);
      }
      await sleep(60); // be polite to a small static host
    }
  });

  await Promise.all(workers);
  if (queue.length) {
    console.warn(`  ! ${origin}: stopped at max-pages, ${queue.length} URLs left unvisited`);
  }

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
      const record = {
        url: twin,
        origin,
        status: res.status,
        contentType: res.contentType,
        bytes: res.bytes,
        discoveredVia: `twin:${from}`,
      };
      if (res.location) record.redirectsTo = res.location;
      if (/text\/html/i.test(res.contentType || '') && res.body) Object.assign(record, fingerprint(res.body));
      results.set(twin, record);
      await sleep(60);
    }
  });
  await Promise.all(twinWorkers);

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
for (const s of seedsFile.seeds) {
  seedsByOrigin.get(s.origin)?.push(s.url);
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
writeFileSync(
  resolve(ROOT, 'verify/external-links-baseline.json'),
  `${JSON.stringify(
    {
      note: 'External links present in production at freeze time, with reference counts. Liveness is recorded separately by check-external-links.mjs — several of these are known to be dead already.',
      frozenAt: started,
      urlCount: externals.size,
      byHost: Object.fromEntries(Object.entries(byHost).sort((a, b) => b[1] - a[1])),
      urls: [...externals.keys()].sort(),
      allowedNew: [],
    },
    null,
    2,
  )}\n`,
);

const statuses = {};
for (const r of allRoutes) statuses[r.status] = (statuses[r.status] || 0) + 1;

console.log(`\nfrozen ${allRoutes.length} routes -> routes/manifest.production.json`);
console.log(`status breakdown: ${JSON.stringify(statuses)}`);
console.log(`external links   -> verify/external-links-baseline.json (${externals.size} URLs, ${Object.keys(byHost).length} hosts)`);
