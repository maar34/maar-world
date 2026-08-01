#!/usr/bin/env node
/**
 * Build the redirect-only sites that replace collect.maar.world and
 * tree.maar.world.
 *
 * NOT A PROXY. GitHub Pages has no server, so nothing can fetch the new page
 * and serve it under the old address — and that would be the wrong thing
 * anyway: it would publish the same content at two addresses and split every
 * signal between them. This redirects instead.
 *
 * NOT A 301 EITHER, and that is the one real cost of staying on GitHub Pages.
 * Pages cannot emit a redirect status. What it can serve is a 200 whose body
 * is an *instant* meta refresh, which search engines treat as a permanent
 * redirect, plus a JS hop that fires first for anyone with JS on. A visitor
 * cannot tell the difference; a crawler very nearly cannot.
 *
 * ONE FILE PER PHYSICAL FILENAME, NOT ONE PER MAP LINE.
 *
 * The map lists `/max-network-berlin` and `/max-network-berlin.html` as two
 * lines with two different targets. On Pages both are answered by the SAME
 * file — `max-network-berlin.html`, with the extensionless form coming from
 * the host's .html fallback. One file cannot carry two targets, so the
 * extensionless one wins: it is canonical, and both forms resolve on
 * maar.world anyway, so the .html twin lands on the same page one hop later
 * than the map's letter. That is the only place this departs from the map,
 * and `shim:verify` reports it rather than hiding it.
 *
 * 404.html IS THE WILDCARD. Pages serves it for every address with no file,
 * which is how `collect.maar.world/anything` still lands correctly without a
 * stub existing for it — including the %20 paths a wildcard rule alone cannot
 * express. It is the same rule set, applied at runtime.
 *
 * Output is written to dist-shim/<host>/ and pushed nowhere. Deploying it
 * overwrites a legacy repository, which is an owner decision (MW-10 step 4).
 */

import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const MAP = join(ROOT, 'routes/redirects.map');
const OUT = join(ROOT, 'dist-shim');

/**
 * The whole rule set, as source that runs in the browser.
 *
 * Kept as one string so the stub pages and 404.html cannot drift apart: they
 * are the same rules, and the only difference is that a stub also carries a
 * static target for the no-JS case.
 *
 * `/img/**` is the exception that matters. Media is shared at the root of the
 * new site, so those paths keep their shape — 23 of the map's lines say so,
 * and prefixing them with the area would 404 every one.
 */
const RULES_JS = (area) => `
(function () {
  var p = location.pathname;
  var t;
  if (p.indexOf('/img/') === 0) {
    t = p;                                  // shared media keeps its path
  } else if (p === '/' || p === '') {
    t = '/${area}';
  } else {
    t = '/${area}' + p;
  }
  location.replace('https://maar.world' + t + location.search + location.hash);
})();`.trim();

/**
 * A stub names its target outright rather than computing it.
 *
 * The rules are right for 126 of the map's 127 lines, and wrong for one:
 * `/docs/ent-worlds/glossary.html` is a page that did not survive, and the map
 * sends it to `/collect` rather than to a path that would 404. A computed
 * target cannot know that. So where the map has an answer it is copied
 * verbatim, and the rules are left to do only the job nothing else can — the
 * addresses that have no line at all.
 */
const stub = (target) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved to maar.world</title>
<!-- No robots meta on purpose. A redirect page is not a page to suppress, it
     is a signpost: noindex here would tell a crawler to drop the old address
     rather than fold it into the new one, which is the opposite of the job. -->
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved to <a href="${target}">${target}</a>.</p>
</body>
</html>
`;

/** The catch-all: no static target is possible, so the rules run at runtime. */
const catchAll = (area) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved to maar.world</title>
<meta http-equiv="refresh" content="0; url=https://maar.world/${area}">
<script>${RULES_JS(area)}</script>
</head>
<body>
<p>This site has moved to <a href="https://maar.world/${area}">https://maar.world/${area}</a>.</p>
</body>
</html>
`;

/** Parse the map into { host: [{ path, target }] }. */
function parseMap() {
  const blocks = {};
  let host = null;
  for (const line of readFileSync(MAP, 'utf8').split('\n')) {
    const header = /^# ── (\S+)/.exec(line);
    if (header) { host = header[1]; blocks[host] = blocks[host] || []; continue; }
    if (!line.startsWith('/') || !host) continue;
    const [path, target] = line.trim().split(/\s+/);
    if (path === '/*') continue; // the wildcard is 404.html's job
    blocks[host].push({ path, target });
  }
  return blocks;
}

/**
 * Map a URL path to the file Pages must contain to answer it.
 *   /            -> index.html
 *   /about       -> about.html   (answers /about AND /about.html)
 *   /about.html  -> about.html   (the same file — hence the dedupe)
 *   /img/x.jpg   -> img/x.jpg.html is WRONG; asset paths get no stub at all
 */
function fileFor(path) {
  if (path === '/') return 'index.html';
  const clean = path.replace(/^\//, '');
  if (/\.[a-z0-9]+$/i.test(clean) && !clean.endsWith('.html')) return null; // an asset, not a page
  return clean.endsWith('.html') ? clean : `${clean}.html`;
}

const AREA = { 'collect.maar.world': 'collect', 'tree.maar.world': 'tree' };

rmSync(OUT, { recursive: true, force: true });

const summary = [];
for (const [host, entries] of Object.entries(parseMap())) {
  const area = AREA[host];
  if (!area) continue;
  const dir = join(OUT, host);
  mkdirSync(dir, { recursive: true });

  // Dedupe by output file: the .html twin and its extensionless form are one
  // file. The extensionless line wins the static target, being canonical.
  const byFile = new Map();
  let assets = 0;
  for (const { path, target } of entries) {
    const file = fileFor(path);
    if (!file) { assets++; continue; }
    const isExtensionless = !path.endsWith('.html');
    if (!byFile.has(file) || isExtensionless) byFile.set(file, target);
  }

  for (const [file, target] of byFile) {
    const abs = join(dir, file);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, stub(target));
  }

  // The catch-all. Every address with no stub — including the %20 paths and
  // the 104 collect / 45 tree URLs deliberately left undecided — lands here
  // and is redirected by the same rules.
  writeFileSync(join(dir, '404.html'), catchAll(area));

  // Pages runs Jekyll on a branch deploy, and a stray underscore would be
  // enough to lose a file. Nothing here starts with one, but the shim is
  // meant to be forgotten about, so it should not depend on that staying true.
  writeFileSync(join(dir, '.nojekyll'), '');
  writeFileSync(join(dir, 'CNAME'), `${host}\n`);

  summary.push({ host, stubs: byFile.size, assetsSkipped: assets });
}

for (const s of summary) {
  console.log(`${s.host.padEnd(22)} ${String(s.stubs).padStart(3)} stubs + 404 catch-all` +
    (s.assetsSkipped ? `  (${s.assetsSkipped} asset paths need no stub — 404.html covers them)` : ''));
}
console.log(`\nwritten to ${OUT} — pushed nowhere. Deploying overwrites a legacy repo: owner decision.`);
