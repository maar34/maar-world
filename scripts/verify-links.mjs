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
 */

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute, decodePath } from './lib/routes.mjs';

/** Tags whose URL attribute causes a fetch when the page loads. */
const ON_LOAD_TAGS = new Set(['script', 'link', 'iframe', 'img', 'source', 'video', 'audio', 'embed', 'object', 'track']);

/** Same-registrable-domain hosts. `play.maar.world` is same-site, not a third party. */
const FIRST_PARTY = /(^|\.)maar\.world$/i;

const TAG_RE = /<(a|script|link|iframe|img|source|video|audio|embed|object|track|form)\b([^>]*)>/gi;
const ATTR_RE = /\b(?:href|src|action|data)\s*=\s*["']([^"']+)["']/i;

const isExternal = (u) => /^(?:https?:)?\/\//i.test(u);
const isIgnorable = (u) =>
  !u ||
  u.startsWith('#') ||
  u.startsWith('mailto:') ||
  u.startsWith('tel:') ||
  u.startsWith('data:') ||
  u.startsWith('javascript:');

function hostOf(url) {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
  } catch {
    return null;
  }
}

export async function checkLinks(report) {
  if (!has('dist')) {
    return report.skip('internal links resolve', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set, files } = indexDist();
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const broken = [];
  const external = new Set();
  const thirdPartyOnLoad = [];

  for (const file of htmlFiles) {
    const html = readDistFile(file);

    for (const tagMatch of html.matchAll(TAG_RE)) {
      const tag = tagMatch[1].toLowerCase();
      const attrs = tagMatch[2] || '';
      const attrMatch = ATTR_RE.exec(attrs);
      if (!attrMatch) continue;

      const raw = attrMatch[1].trim();
      if (isIgnorable(raw)) continue;

      if (isExternal(raw)) {
        const host = hostOf(raw);
        // Absolute first-party URLs (canonical tags, absolute internal links)
        // are not external links and do not belong in the baseline comparison.
        if (host && !FIRST_PARTY.test(host)) {
          external.add(raw.split('#')[0]);
          if (ON_LOAD_TAGS.has(tag)) thirdPartyOnLoad.push(`${file}: <${tag}> -> ${host}`);
        }
        continue;
      }

      // Resolve relative URLs against the emitting file's directory.
      let target = raw;
      if (!target.startsWith('/')) {
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
        target = `/${dir ? `${dir}/` : ''}${target}`;
      }
      const normalised = decodePath(target.split('#')[0].split('?')[0]);
      if (!normalised || normalised === '/') continue;

      if (!resolveRoute(normalised, set)) broken.push(`${file} -> ${raw}`);
    }
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
    report.pass('no third-party request fires on page load');
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
