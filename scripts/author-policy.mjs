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
 *   drop      the URL stops resolving.
 *
 * Each value carries a hard obligation, and that is what makes them usable as a
 * contract rather than as adjectives:
 *
 *   preserve  obliges the BUILD — `verify:routes` proves every `servedAt`
 *             resolves to a real file in the output. Marking something
 *             `preserve` that the build does not emit does not preserve it; it
 *             only breaks the check that would have noticed.
 *   redirect  obliges a DECISION — a URL change has been chosen deliberately.
 *   drop      obliges nothing, and states the consequence: the URL stops
 *             resolving.
 *
 * `drop` therefore covers two situations that must never be confused, so they
 * are distinguished by `dropKind`:
 *
 *   dropKind: 'decided'     a recorded decision says the URL should stop —
 *                           it already 404s in production, or an architecture
 *                           decision that actually addresses serving it says so.
 *   dropKind: 'unresolved'  the URL is LIVE, the build does not emit it, and
 *                           nothing on record authorises either building it or
 *                           removing it. This is not a decision. It is the
 *                           unresolved default, and every one of these carries
 *                           `openDecision`, is counted in `blockedCount`, and
 *                           has a BLOCKED line in MIGRATION-LEDGER.md.
 *
 * Where a policy would change what a visitor sees and the decision is not
 * already recorded, the route is marked `openDecision` and surfaced for a human
 * instead of being guessed. Where the build can serve it, the open-decision
 * default is `preserve`, because preserving keeps every option available and
 * redirecting does not.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'routes/manifest.production.json'), 'utf8'));

/**
 * The inherited jekyll-TeXt-theme `/z/` tree.
 *
 * These were previously dropped citing "never intentionally served —
 * ARCHITECTURE-REVIEW §10 item 12". That citation does not carry the weight it
 * was given. §10 is titled *"What should explicitly NOT be built"* and item 12
 * reads "Carrying over `docs/`, `test/`, `z/`, `docker/`, `.travis.yml`,
 * `Dockerfile.dev`, or the theme gemspec" — it is about not PORTING source
 * directories into the new repository. It says nothing about a URL production
 * answers with 200.
 *
 * And production does answer. `maar.world/z/README-zh` and its `.html` twin
 * return 200 with ~45 KB of rendered content; the same pair on tree returns
 * ~38 KB. MW-4 is explicit — "This issue only records reality" and
 * "Do not: Change any URL." Removing a live URL is a human call.
 */
const isThemeBallast = (url) => url === '/z' || url.startsWith('/z/');

const basePath = (url) => url.split('?')[0];

const decisions = [];
const openDecisions = [];
const blocked = [];

/**
 * Record a live URL the new build does not serve and that nothing on record
 * authorises removing. See the `dropKind` note at the top of this file: the
 * value is `drop` because that is what actually happens, not because it was
 * chosen.
 */
function unresolved(entry, { reason, question }) {
  entry.policy = 'drop';
  entry.dropKind = 'unresolved';
  entry.reason = reason;
  entry.openDecision = question;
  entry.blocked = true;
  openDecisions.push(`${entry.origin}${entry.url}`);
  blocked.push({ url: `${entry.origin}${entry.url}`, question });
  return entry;
}

for (const route of manifest.routes) {
  const { origin, url, status } = route;
  const base = basePath(url);
  const entry = { url, origin, policy: null, reason: '' };

  // Already broken in production. Recording reality, not repairing it (MW-4 is
  // explicit that fixing is out of scope here).
  if (status === 404) {
    entry.policy = 'drop';
    entry.dropKind = 'decided';
    entry.reason = 'already returns 404 in production; recorded as-is, not repaired here';
    decisions.push(entry);
    continue;
  }

  if (isThemeBallast(base)) {
    decisions.push(
      unresolved(entry, {
        reason:
          `live in production (HTTP ${status}) and the new build does not emit it. ` +
          'ARCHITECTURE-REVIEW §10 item 12 forbids CARRYING OVER the z/ source directory; it does not authorise ' +
          'switching off a URL production answers with 200, and MW-4 says "This issue only records reality".',
        question:
          'Inherited jekyll-TeXt-theme documentation, live on maar.world and tree.maar.world today. Nothing on ' +
          'record says to serve it and nothing on record says to remove it. Should these URLs keep resolving ' +
          '(the build would have to ship the theme documentation), 301 somewhere, or be deliberately retired? ' +
          'Recorded as an unresolved drop, not as a decision.',
      }),
    );
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
    // No trailing slash on the area root. astro.config.mjs sets
    // `trailingSlash: 'never'` with `build.format: 'file'`, so `/collect/` is a
    // URL the site will never answer, and lib/routes.mjs maps a trailing-slash
    // path to `collect/index.html` and nothing else. `/collect` is what the
    // build can actually serve, and it resolves against either emitted shape —
    // which is exactly how the Tree root is handled two branches down.
    entry.servedAt = base === '/' ? '/collect' : `/collect${base}`;
    entry.subdomainRedirect = `https://maar.world${entry.servedAt}`;
    entry.reason = 'Collect merged under /collect/*; the subdomain remains a permanent entry point via 301';

    // The 34 Collect card URLs contain %20, and one a trailing space. They could
    // reasonably 301 to the canonical card page — but only if they are not
    // printed on physical material. That is not a call to guess.
    if (base.startsWith('/cards/') && base.includes('%20')) {
      entry.openDecision =
        'Are these %20 Collect card URLs printed on any card, sleeve or packaging? If not they may 301 to the canonical card page. Defaulting to preserve until a human answers.';
      entry.reason += '; %20 card URL preserved pending an owner decision';
      openDecisions.push(`${entry.origin}${entry.url}`);
    }

    decisions.push(entry);
    continue;
  }

  if (origin === 'tree.maar.world') {
    // `/index.min` and `/index.min.html` are live (200, 819 bytes — unrendered
    // Jekyll source, frontmatter and all). They were policied `redirect` citing
    // ARCHITECTURE-REVIEW §8.2, but §8.2 does not decide this: it says
    // "301 → / **unless A8 says otherwise**", and A8 — "No inbound backlinks
    // depend on index.min.html on tree" — is listed under §3 "Assumptions that
    // remain unverified" and has never been checked. MW-4's instruction for
    // exactly this shape is "Mark BLOCKED and ask rather than deciding."
    //
    // So the 301 is withdrawn as a *decision*. The visitor outcome is unchanged
    // — author-redirects.mjs sends dropped tree URLs to https://maar.world/tree,
    // the same destination — but the contract no longer claims a resolved call.
    if (base === '/index.min.html' || base === '/index.min') {
      decisions.push(
        unresolved(entry, {
          reason:
            `live in production (HTTP ${status}) and the new build does not emit it. ` +
            'ARCHITECTURE-REVIEW §8.2 makes the 301 conditional on A8, and A8 is unverified.',
          question:
            'A8 — "No inbound backlinks depend on index.min.html on tree" — is still unverified (§3). Until a ' +
            'backlink/log check answers it, 301-ing this URL is a decision made against an explicitly open ' +
            'assumption. Check Search Console referring pages, then choose: 301 → /tree, or preserve.',
        }),
      );
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

const dropKinds = decisions
  .filter((d) => d.policy === 'drop')
  .reduce((acc, d) => {
    const k = d.dropKind || 'unlabelled';
    acc[k] = (acc[k] || 0) + 1;
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
      dropKinds,
      openDecisionCount: openDecisions.length,
      blockedCount: blocked.length,
      blockedNote:
        'Live production URLs the new build does not serve and that nothing on record authorises removing. ' +
        'policy is `drop` because that is the consequence, not because it was decided — see dropKind: "unresolved" ' +
        'in scripts/author-policy.mjs. Each has a BLOCKED line in MIGRATION-LEDGER.md and needs a human answer.',
      blocked,
      redirectMap,
      routes: decisions,
    },
    null,
    2,
  )}\n`,
);

console.log(`policy authored for ${decisions.length} routes`);
console.log(`  ${JSON.stringify(counts)}`);
console.log(`  drop kinds: ${JSON.stringify(dropKinds)}`);
console.log(`  open decisions: ${openDecisions.length}   BLOCKED: ${blocked.length}`);

for (const d of decisions.filter((x) => x.policy === 'drop' && x.dropKind === 'decided')) {
  console.log(`  DROP(decided)     ${d.origin}${d.url} — ${d.reason}`);
}
for (const d of decisions.filter((x) => x.policy === 'drop' && x.dropKind === 'unresolved')) {
  console.log(`  DROP(UNRESOLVED)  ${d.origin}${d.url} — ${d.reason}`);
}
for (const d of decisions.filter((x) => x.policy === 'redirect')) {
  console.log(`  301               ${d.origin}${d.url} -> ${d.target}`);
}
