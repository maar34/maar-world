#!/usr/bin/env node
/**
 * Prove the redirect shim sends every legacy URL where routes/redirects.map
 * says it should.
 *
 * This resolves each map path the way GitHub Pages would — exact file, then
 * the `.html` fallback, then 404.html — reads the target out of the generated
 * page, and compares. Without it the shim is 56 files nobody has ever checked,
 * and the failure mode is silent: a visitor from a printed card lands on a
 * redirect page that points nowhere and simply leaves.
 *
 * Run after scripts/author-redirect-shim.mjs.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const OUT = join(ROOT, 'dist-shim');
const AREA = { 'collect.maar.world': 'collect', 'tree.maar.world': 'tree' };

/**
 * A regular file, not a directory. `/docs` exists as a DIRECTORY in the shim
 * (it holds a nested stub), and Pages does not serve a directory — it
 * redirects to `/docs/` and then needs an index, which there is none, so the
 * request lands on 404.html. Testing existence alone would have claimed the
 * directory answers the request and then tried to read it.
 */
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** How Pages resolves a request path to a file on disk. */
function resolveFile(dir, path) {
  const clean = path === '/' ? 'index.html' : path.replace(/^\//, '');
  for (const c of [clean, `${clean}.html`]) {
    if (isFile(join(dir, c))) return { file: c, via: c === clean ? 'exact' : '.html fallback' };
  }
  return isFile(join(dir, '404.html')) ? { file: '404.html', via: 'catch-all' } : null;
}

/**
 * What the page actually redirects to. The catch-all computes its target in
 * the browser, so the rules are applied here the same way rather than read
 * out of a meta tag that only says the area root.
 */
function targetOf(dir, hit, path, area) {
  if (hit.via === 'catch-all') {
    const t = path.startsWith('/img/') ? path : (path === '/' ? `/${area}` : `/${area}${path}`);
    return `https://maar.world${t}`;
  }
  const html = readFileSync(join(dir, hit.file), 'utf8');
  return /content="0; url=([^"]+)"/.exec(html)?.[1] ?? null;
}

const lines = readFileSync(join(ROOT, 'routes/redirects.map'), 'utf8').split('\n');
let host = null;
const rows = [];
for (const line of lines) {
  const h = /^# ── (\S+)/.exec(line);
  if (h) { host = h[1]; continue; }
  if (!line.startsWith('/') || !host || !AREA[host]) continue;
  const [path, want] = line.trim().split(/\s+/);
  if (path === '/*') continue;
  rows.push({ host, path, want });
}

const fails = [];
const twins = [];
for (const { host, path, want } of rows) {
  const dir = join(OUT, host);
  const hit = resolveFile(dir, path);
  if (!hit) { fails.push(`${host}${path} — nothing answers it`); continue; }
  const got = targetOf(dir, hit, path, AREA[host]);
  if (got === want) continue;
  // The documented exception: a path sharing one file with its canonical
  // form, which therefore has to share its target too.
  //
  //   /about.html   shares about.html with /about   → lands on /collect/about
  //   /index.html   shares index.html with /        → lands on /collect
  //
  // Both spellings are 200 on maar.world, and the target here is the canonical
  // one — the same spelling MW-11 settled on when it stopped the site linking
  // to `.../index.html`. So this is not a near-miss to be tolerated; it is the
  // preferred address.
  if (want === `${got}.html` || want === `${got}/index.html`) {
    twins.push(`${host}${path} → ${got}`);
    continue;
  }
  fails.push(`${host}${path}\n     map wants ${want}\n     shim sends ${got}  (${hit.via}: ${hit.file})`);
}

console.log(`\nverify:shim — ${rows.length} redirect lines\n`);
if (twins.length) {
  console.log(`  NOTE  ${twins.length} .html twin(s) land on the canonical extensionless URL:`);
  twins.forEach((t) => console.log(`        ${t}`));
  console.log('        Both forms are 200 on maar.world. One file cannot carry two targets.\n');
}
if (fails.length) {
  console.log(`  FAIL  ${fails.length} redirect(s) do not match the map:`);
  fails.forEach((f) => console.log(`        ${f}`));
  console.log('');
  process.exit(1);
}
console.log(`  PASS  every one of the ${rows.length} lines resolves to the target the map names\n`);
