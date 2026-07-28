#!/usr/bin/env node
/**
 * verify:links — internal links resolve, external links match the frozen
 * baseline, and nothing third-party is fetched on page load.
 *
 * Offline by default and therefore deterministic: it compares the *set* of
 * external URLs the build emits against the baseline recorded in MW-4, rather
 * than hitting the network. Many external links are already dead in production
 * (the storefront links in particular) — the baseline captures that so existing
 * rot is never mistaken for migration damage.
 *
 * The third-party gate is the one that matters legally. Launching with no
 * analytics and no cookie banner is only clean if no third-party request fires
 * before a visitor chooses to load that media. An `<a href>` to YouTube is fine;
 * an `<iframe src>` to YouTube is not — it fetches on load. Embeds must be
 * click-to-load facades. Fonts must be self-hosted.
 *
 * That gate used to scan `.html` files for quoted `href|src|action|data` on
 * thirteen tag names, and missed seven of ten demonstrated bypasses:
 *
 *     <img srcset="https://…">                     no srcset in the attribute set
 *     <source srcset="https://…">                  same
 *     <style>@font-face{src:url(https://…)}</style> style blocks never read
 *     style="background-image:url(https://…)"       style attributes never read
 *     <meta http-equiv="refresh" content="0;url=…"> meta not in the tag set
 *     <iframe src=https://… >                       unquoted values not matched
 *     <svg><image href="https://…">                 image/use not in the tag set
 *
 * and `url(https://fonts.gstatic.com/…)` inside `dist/_assets/*.css` was 100%
 * invisible, because CSS was never opened at all. All of the above are covered
 * below, and every one has a selftest case.
 */

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute, decodePath } from './lib/routes.mjs';

/**
 * Tags whose URL attribute causes a fetch when the page loads.
 *
 * `a` and `form` are deliberately absent: a link is followed and a form is
 * submitted by a person, which is consent. `meta` is here because an
 * http-equiv=refresh to a third party navigates without being asked.
 */
const ON_LOAD_TAGS = new Set([
  'script',
  'link',
  'iframe',
  'img',
  'source',
  'video',
  'audio',
  'embed',
  'object',
  'track',
  'input',
  'image', // <svg><image href>
  'use', //   <svg><use href>
  'meta', //  http-equiv=refresh
  'body', //  legacy background=
  'table',
]);

/** Same-registrable-domain hosts. `play.maar.world` is same-site, not a third party. */
const FIRST_PARTY = /(^|\.)maar\.world$/i;

/** Every tag that can carry a URL, including the ones that were being skipped. */
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*?)\/?>/g;

/** Quoted OR unquoted attribute values. `<iframe src=https://…>` is valid HTML. */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/** Attributes that name a single URL. */
const URL_ATTRS = new Set([
  'href',
  'xlink:href',
  'src',
  'poster',
  'data',
  'action',
  'formaction',
  'background',
  'longdesc',
  'cite',
]);

/** Attributes that name a comma-separated candidate list. */
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);

const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)|"([^"]*)"|'([^']*)')/gi;
const META_REFRESH_URL_RE = /url\s*=\s*['"]?([^'";]+)/i;

/**
 * Decode HTML entities in attribute values.
 *
 * Astro emits `&#x26;` for `&` inside markdown-derived HTML, so a URL written
 * `?rlkey=…&raw=1` appears in the build as `?rlkey=…&#x26;raw=1`. The route
 * freeze decodes the same way, and without this the two sides disagree about
 * what is the same URL — which reads as "a new external link was introduced"
 * when nothing changed. It also matters for `style="…url(&#x22;/img/x.jpg&#x22;)"`,
 * where the quotes inside the CSS are themselves entity-encoded.
 */
const decodeEntities = (s) =>
  s
    .replace(/&(?:lt|LT);/g, '<')
    .replace(/&(?:gt|GT);/g, '>')
    .replace(/&(?:quot|QUOT);/g, '"')
    .replace(/&(?:apos|#0?39);/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(?:amp|AMP);/g, '&');

const isExternal = (u) => /^(?:https?:)?\/\//i.test(u);
const isIgnorable = (u) =>
  !u ||
  u.startsWith('#') ||
  u.startsWith('mailto:') ||
  u.startsWith('tel:') ||
  u.startsWith('data:') ||
  u.startsWith('blob:') ||
  u.startsWith('about:') ||
  u.startsWith('javascript:');

function hostOf(url) {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
  } catch {
    return null;
  }
}

/** Pull every URL out of a `srcset`-style candidate list. */
function srcsetUrls(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function cssUrls(css) {
  const found = [];
  for (const m of css.matchAll(CSS_URL_RE)) found.push(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of css.matchAll(CSS_IMPORT_RE)) found.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '');
  return found.map((u) => u.trim()).filter(Boolean);
}

/**
 * Every URL reference in a built HTML page.
 *
 * @returns {{url: string, tag: string, attr: string, onLoad: boolean}[]}
 */
export function referencesInHtml(html) {
  const refs = [];
  const add = (url, tag, attr, onLoad) => {
    const clean = decodeEntities(String(url).trim());
    if (!isIgnorable(clean)) refs.push({ url: clean, tag, attr, onLoad });
  };

  for (const tagMatch of html.matchAll(TAG_RE)) {
    const tag = tagMatch[1].toLowerCase();
    const attrText = tagMatch[2] || '';
    if (tag === 'style') continue; // handled as a block below

    const attrs = new Map();
    for (const a of attrText.matchAll(ATTR_RE)) {
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
    }

    const onLoadTag = ON_LOAD_TAGS.has(tag);

    for (const [name, rawValue] of attrs) {
      if (URL_ATTRS.has(name)) {
        // A form's action fires on submit, not on load, whatever the tag is.
        const onLoad = onLoadTag && name !== 'action' && name !== 'formaction' && name !== 'cite';
        add(rawValue, tag, name, onLoad);
      } else if (SRCSET_ATTRS.has(name)) {
        for (const u of srcsetUrls(decodeEntities(rawValue))) add(u, tag, name, onLoadTag);
      } else if (name === 'style') {
        // Inline CSS fetches exactly like a stylesheet does.
        for (const u of cssUrls(decodeEntities(rawValue))) add(u, tag, 'style', true);
      }
    }

    // <meta http-equiv="refresh" content="0; url=https://…"> navigates on load.
    if (tag === 'meta' && /refresh/i.test(attrs.get('http-equiv') || '')) {
      const m = META_REFRESH_URL_RE.exec(decodeEntities(attrs.get('content') || ''));
      if (m) add(m[1], 'meta', 'refresh', true);
    }
  }

  // <style> blocks: @font-face src, background images, @import.
  for (const block of html.matchAll(STYLE_BLOCK_RE)) {
    for (const u of cssUrls(decodeEntities(block[1] || ''))) add(u, 'style', 'url()', true);
  }

  return refs;
}

/** Every URL reference in a built stylesheet. All of them fetch on load. */
export function referencesInCss(css) {
  return cssUrls(css)
    .map((url) => ({ url, tag: 'css', attr: 'url()', onLoad: true }))
    .filter((r) => !isIgnorable(r.url));
}

export async function checkLinks(report) {
  if (!has('dist')) {
    return report.skip('internal links resolve', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set, files } = indexDist();
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const broken = [];
  const external = new Set();
  const thirdPartyOnLoad = [];

  /**
   * Internal resolution is asserted for document-level references only
   * (href/src/action/data on an HTML tag), which is the set this check has
   * always covered. Style and srcset references are scanned for the
   * third-party gate but not resolved as internal links: a missing image is a
   * content defect owned by MW-7/MW-8, and conflating it with a broken page
   * link here would report it against the wrong issue.
   */
  const RESOLVED_ATTRS = new Set(['href', 'src', 'action', 'data']);

  const classify = (ref, file) => {
    if (isExternal(ref.url)) {
      const host = hostOf(ref.url);
      // Absolute first-party URLs (canonical tags, absolute internal links)
      // are not external links and do not belong in the baseline comparison.
      if (host && !FIRST_PARTY.test(host)) {
        external.add(ref.url.split('#')[0]);
        if (ref.onLoad) thirdPartyOnLoad.push(`${file}: <${ref.tag} ${ref.attr}> -> ${host}`);
      }
      return;
    }
    if (!RESOLVED_ATTRS.has(ref.attr) || !file.endsWith('.html')) return;

    // Resolve relative URLs against the emitting file's directory.
    let target = ref.url;
    if (!target.startsWith('/')) {
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      target = `/${dir ? `${dir}/` : ''}${target}`;
    }
    const normalised = decodePath(target.split('#')[0].split('?')[0]);
    if (!normalised || normalised === '/') return;

    if (!resolveRoute(normalised, set)) broken.push(`${file} -> ${ref.url}`);
  };

  for (const file of htmlFiles) {
    for (const ref of referencesInHtml(readDistFile(file))) classify(ref, file);
  }
  for (const file of cssFiles) {
    for (const ref of referencesInCss(readDistFile(file))) classify(ref, file);
  }

  if (broken.length) {
    report.fail(
      'internal links resolve',
      `${broken.length} broken across ${htmlFiles.length} pages — first 5: ${broken.slice(0, 5).join(' | ')}`,
    );
  } else {
    report.pass('internal links resolve', `${htmlFiles.length} pages scanned`);
  }

  // The gate that lets the site ship with no cookie banner.
  if (thirdPartyOnLoad.length) {
    const hosts = [...new Set(thirdPartyOnLoad.map((v) => v.split('-> ')[1]))];
    report.fail(
      'no third-party request fires on page load',
      `${thirdPartyOnLoad.length} on-load references to ${hosts.length} third-party hosts: ${hosts.slice(0, 6).join(', ')}`,
    );
  } else {
    report.pass(
      'no third-party request fires on page load',
      `${htmlFiles.length} pages and ${cssFiles.length} stylesheets scanned`,
    );
  }

  if (!has('linkBaseline')) {
    return report.skip('external links match baseline', ARTIFACTS.linkBaseline.rel, ARTIFACTS.linkBaseline.issue);
  }

  const baseline = loadJson('linkBaseline');
  const known = new Set(baseline.urls || []);
  const allowedNew = new Set(baseline.allowedNew || []);
  const introduced = [...external].filter((u) => !known.has(u) && !allowedNew.has(u));

  if (introduced.length) {
    report.fail(
      'no unreviewed external links introduced',
      `${introduced.length} new — first 5: ${introduced.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('no unreviewed external links introduced', `${external.size} external URLs, all in baseline`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-links.mjs')) {
  runStandalone('verify:links', checkLinks);
}
