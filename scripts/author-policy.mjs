#!/usr/bin/env node
/**
 * Author routes/policy.json — one explicit policy for every production route.
 *
 * Generated from routes/manifest.production.json by documented rules rather than
 * hand-maintained, so it is re-runnable and auditable. The manifest records what
 * production serves; this file records what the new site does about it.
 *
 *   preserve  the URL keeps working. `servedAt` is where the new single-domain
 *             build serves it from (identical to `url` for everything on
 *             maar.world; prefixed for the merged Collect and Tree areas).
 *   redirect  the URL 301s. `target` is required.
 *   drop      the URL stops resolving. Only ever from a recorded decision, and
 *             every instance is listed in the report.
 *
 * Where a policy would change what a visitor sees and the decision is not
 * already recorded, the route is marked `openDecision` and surfaced for a human
 * instead of being guessed. The default while a decision is open is always
 * `preserve`, because preserving keeps every option available and redirecting
 * does not.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'routes/manifest.production.json'), 'utf8'));

/** Theme ballast never intended to be served. ARCHITECTURE-REVIEW §10 item 12. */
const isThemeBallast = (url) => url.startsWith('/z/');

const basePath = (url) => url.split('?')[0];

const decisions = [];
const openDecisions = [];

for (const route of manifest.routes) {
  const { origin, url, status } = route;
  const base = basePath(url);
  const entry = { url, origin, policy: null, reason: '' };

  // Already broken in production. Recording reality, not repairing it (MW-4 is
  // explicit that fixing is out of scope here).
  if (status === 404) {
    entry.policy = 'drop';
    entry.reason = 'already returns 404 in production; recorded as-is, not repaired here';
    decisions.push(entry);
    continue;
  }

  if (isThemeBallast(base)) {
    entry.policy = 'drop';
    entry.reason = 'inherited jekyll-TeXt-theme ballast, never intentionally served — ARCHITECTURE-REVIEW §10 item 12';
    decisions.push(entry);
    continue;
  }

  if (origin === 'maar.world') {
    entry.policy = 'preserve';
    entry.servedAt = base;

    if ((route.seedReason || '').startsWith('nfc-card')) {
      entry.neverRedirect = true;
      entry.reason = 'NFC card code printed on a physical card — both URL forms, byte-for-byte stable, never redirected';
    } else if (base === '/orbiters' || base === '/orbiters.html') {
      entry.reason = 'preserved; the orbiters.md / int-players.md permalink collision is resolved in MW-7, not here';
    } else if (base.startsWith('/interplanetary-players')) {
      entry.reason = 'preserved; deprecated address per addendum D5 — disposition decided in MW-7, not here';
    } else if (base === '/resume' || base === '/resume.html') {
      entry.reason = 'preserved and kept out of primary navigation; indexability is an open question (Q3)';
    } else if (base.endsWith('.pdf')) {
      entry.reason = 'PDF path preserved byte-identically';
    } else {
      entry.reason = 'maar.world route preserved at its existing path';
    }

    if (url.includes('?')) {
      entry.reason += '; query string is filtered client-side and needs no separate build output';
    }

    decisions.push(entry);
    continue;
  }

  if (origin === 'collect.maar.world') {
    entry.policy = 'preserve';
    entry.servedAt = base === '/' ? '/collect/' : `/collect${base}`;
    entry.subdomainRedirect = `https://maar.world${entry.servedAt}`;
    entry.reason = 'Collect merged under /collect/*; the subdomain remains a permanent entry point via 301';

    // The 34 Collect card URLs contain %20, and one a trailing space. They could
    // reasonably 301 to the canonical card page — but only if they are not
    // printed on physical material. That is not a call to guess.
    if (base.startsWith('/cards/') && base.includes('%20')) {
      entry.openDecision =
        'Are these %20 Collect card URLs printed on any card, sleeve or packaging? If not they may 301 to the canonical card page. Defaulting to preserve until a human answers.';
      entry.reason += '; %20 card URL preserved pending an owner decision';
      openDecisions.push(entry.url);
    }

    decisions.push(entry);
    continue;
  }

  if (origin === 'tree.maar.world') {
    if (base === '/index.min.html' || base === '/index.min') {
      entry.policy = 'redirect';
      entry.target = 'https://maar.world/tree';
      entry.reason = 'orphan route with no inbound links — ARCHITECTURE-REVIEW §8.2 recommends 301 to the site root';
      decisions.push(entry);
      continue;
    }
    entry.policy = 'preserve';
    entry.servedAt = base === '/' ? '/tree' : `/tree${base}`;
    entry.subdomainRedirect = `https://maar.world${entry.servedAt}`;
    entry.reason = 'Tree merged under /tree; the subdomain remains a permanent entry point via 301';
    decisions.push(entry);
    continue;
  }

  entry.policy = 'preserve';
  entry.servedAt = base;
  entry.reason = 'unclassified origin — preserved by default';
  decisions.push(entry);
}

// --- redirect map for the two retired subdomains -------------------------
const redirectMap = [
  {
    from: 'collect.maar.world/*',
    to: 'https://maar.world/collect/:splat',
    status: 301,
    note: 'permanent entry point; every Collect path keeps working',
  },
  {
    from: 'tree.maar.world/*',
    to: 'https://maar.world/tree/:splat',
    status: 301,
    note: 'permanent entry point; Tree root lands on /tree',
  },
];

const counts = decisions.reduce((acc, d) => {
  acc[d.policy] = (acc[d.policy] || 0) + 1;
  return acc;
}, {});

writeFileSync(
  resolve(ROOT, 'routes/policy.json'),
  `${JSON.stringify(
    {
      note: 'Explicit preserve/redirect/drop policy for every route in manifest.production.json. Generated by scripts/author-policy.mjs. A contract: later work conforms to it, it does not conform to later work.',
      authoredAt: new Date().toISOString(),
      generator: 'scripts/author-policy.mjs',
      basedOn: { manifest: 'routes/manifest.production.json', frozenAt: manifest.frozenAt },
      counts,
      openDecisionCount: openDecisions.length,
      redirectMap,
      routes: decisions,
    },
    null,
    2,
  )}\n`,
);

console.log(`policy authored for ${decisions.length} routes`);
console.log(`  ${JSON.stringify(counts)}`);
console.log(`  open decisions: ${openDecisions.length}`);
for (const d of decisions.filter((x) => x.policy === 'drop')) {
  console.log(`  DROP  ${d.origin}${d.url} — ${d.reason}`);
}
for (const d of decisions.filter((x) => x.policy === 'redirect')) {
  console.log(`  301   ${d.origin}${d.url} -> ${d.target}`);
}
