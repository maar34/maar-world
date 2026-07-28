#!/usr/bin/env node
/**
 * Probe every external link production currently emits and record its status.
 *
 * Several of these are already dead — the addendum found that all 68 Sky Sounds
 * card pages point at storefronts that no longer exist. Capturing that now, with
 * a timestamp, is the whole point: it means existing rot can never later be
 * blamed on the migration.
 *
 * This records liveness. It does not fix anything.
 *
 *   node scripts/check-external-links.mjs [--concurrency 6]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const args = process.argv.slice(2);
const ci = args.indexOf('--concurrency');
const CONCURRENCY = ci === -1 ? 6 : Number(args[ci + 1]);

const baselinePath = resolve(ROOT, 'verify/external-links-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const urls = baseline.urls || [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url) {
  // HEAD first — cheap. Fall back to a ranged GET for hosts that reject HEAD.
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: {
          'user-agent': 'maar-world-link-baseline/1.0 (+migration contract)',
          ...(method === 'GET' ? { range: 'bytes=0-2048' } : {}),
        },
        signal: AbortSignal.timeout(25000),
      });
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return { status: res.status, finalUrl: res.url !== url ? res.url : undefined };
    } catch (err) {
      if (method === 'GET') {
        return { status: 0, error: String(err && err.message ? err.message : err).slice(0, 120) };
      }
    }
  }
  return { status: 0, error: 'unreachable' };
}

const results = [];
let i = 0;
let done = 0;

const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (i < urls.length) {
    const url = urls[i++];
    const r = await probe(url);
    results.push({ url, ...r });
    done += 1;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${urls.length}\r`);
    await sleep(80);
  }
});

await Promise.all(workers);
results.sort((a, b) => a.url.localeCompare(b.url));

const byHost = {};
for (const r of results) {
  let host;
  try {
    host = new URL(r.url).hostname;
  } catch {
    host = '(unparseable)';
  }
  byHost[host] = byHost[host] || { total: 0, ok: 0, dead: 0 };
  byHost[host].total += 1;
  if (r.status >= 200 && r.status < 400) byHost[host].ok += 1;
  else byHost[host].dead += 1;
}

const dead = results.filter((r) => !(r.status >= 200 && r.status < 400));

writeFileSync(
  resolve(ROOT, 'verify/external-links-status.json'),
  `${JSON.stringify(
    {
      note: 'Liveness of every external link production emitted, at freeze time. Failures here are PRE-EXISTING and are recorded so they are not later attributed to the migration.',
      checkedAt: new Date().toISOString(),
      total: results.length,
      deadCount: dead.length,
      byHost: Object.fromEntries(Object.entries(byHost).sort((a, b) => b[1].dead - a[1].dead || b[1].total - a[1].total)),
      results,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nchecked ${results.length} external URLs`);
console.log(`already dead in production: ${dead.length}`);
console.log('\nworst hosts:');
for (const [host, s] of Object.entries(byHost).sort((a, b) => b[1].dead - a[1].dead).slice(0, 12)) {
  if (s.dead) console.log(`  ${String(s.dead).padStart(3)}/${String(s.total).padEnd(3)} dead  ${host}`);
}
console.log('\n-> verify/external-links-status.json');
