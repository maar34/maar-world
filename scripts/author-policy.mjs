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
 * Non-page URLs, grouped by what depends on them.
 *
 * Every group here is live on all three origins and emitted by the new build
 * from nowhere, so none of them can be `preserve` — see the `dropKind` note
 * above. They are separated because they are not one question: a feed with
 * subscribers, a favicon, and a Dockerfile published by accident need three
 * different answers from a human, and lumping them together would guarantee
 * that only the loudest one gets read.
 *
 * The order is the order they should be answered in.
 */
const HOST_FILE_GROUPS = [
  {
    group: 'syndication',
    urls: ['/feed', '/feed.xml'],
    what: 'RSS feed',
    question:
      'These are live RSS feeds. Subscribers\u2019 readers poll them on a schedule and fail silently — a dropped ' +
      'feed produces no 404 anybody sees, just an audience that stops receiving anything. The new build emits no ' +
      'feed at all. Decide: ship a feed at these exact URLs, or accept losing every existing subscriber.',
  },
  {
    group: 'crawler-directive',
    urls: ['/robots.txt', '/sitemap.xml'],
    what: 'crawler directive',
    question:
      'The new build emits /sitemap-index.xml (the @astrojs/sitemap default) and no robots.txt at all, while ' +
      'production serves /sitemap.xml and a /robots.txt that points at it. Search Console is registered against ' +
      'the production URLs. Decide: emit /sitemap.xml and /robots.txt at these paths, or re-submit the new ' +
      'sitemap URL and accept a gap while it is re-crawled.',
  },
  {
    group: 'host-error-page',
    urls: ['/404', '/404.html'],
    what: 'error page',
    question:
      'Production serves a themed 404 page, and GitHub Pages uses /404.html as the host error document. The new ' +
      'build emits neither, so every mistyped URL — including a mistyped NFC card code — would land on the host ' +
      'default rather than on a Maar World page. Decide whether the new site ships a 404 page.',
  },
  {
    group: 'browser-chrome',
    urls: [
      '/favicon.ico',
      '/favicon-16x16.png',
      '/favicon-32x32.png',
      '/apple-touch-icon.png',
      '/safari-pinned-tab.svg',
      '/site.webmanifest',
      '/browserconfig.xml',
    ],
    what: 'icon or web-app manifest',
    question:
      'Icons and the web-app manifest, requested by every browser tab, every bookmark and every home-screen ' +
      'shortcut already saved. The new build emits none of them, so saved shortcuts lose their icon. Decide ' +
      'whether the new site ships icons at these exact paths, which is cheap, or deliberately re-brands.',
  },
  {
    group: 'deploy-artifact',
    urls: ['/CNAME', '/Dockerfile.dev', '/docker/nginx.conf', '/tools/assert-url.js'],
    what: 'build file published by accident',
    question:
      'Build and deploy files that Jekyll copied into _site and GitHub Pages therefore publishes: a Dockerfile, ' +
      'an nginx config and a test helper, all readable by anyone. Nothing should link to them and removing them ' +
      'is almost certainly right — but it still changes what is served, and MW-4 does not authorise changing what ' +
      'is served. Confirm they can go.',
  },
  {
    group: 'theme-asset-tree',
    prefix: '/assets/',
    what: 'compiled theme asset',
    question:
      'The jekyll-TeXt-theme\u2019s compiled asset tree, including /assets/css/main.css — 155 KB, loaded by every ' +
      'page on all three sites. The new build ships its own fingerprinted CSS under /_assets/ and no migrated ' +
      'page references these paths (MIGRATION-LEDGER, MW-7 pages/legacy-css-dropped). This is the group most ' +
      'likely to be safe to retire, and it is still not this script\u2019s call: ARCHITECTURE-REVIEW §10 item 12 ' +
      'forbids CARRYING OVER the theme, which is a statement about the repository, not about what the host answers.',
  },
];

/**
 * Live production assets that a live production page still references, and that
 * the migration did not carry into the build.
 *
 * `collect.maar.world/documentation.html` renders nine cover thumbnails today.
 * The migrated `/collect/documentation.html` renders no images at all — the
 * references were lost when MW-7 stripped the page’s raw HTML blocks — so
 * preserving these URLs would demand assets the build does not ship. That is a
 * content regression, not a routing decision, and it is recorded here rather
 * than hidden by quietly filing them with the orphans: they are not orphans,
 * production shows them to visitors right now.
 *
 * Listed explicitly so the list cannot rot silently — author-policy warns if an
 * entry stops appearing in the manifest.
 */
const MIGRATION_DROPPED_MEDIA = new Set(
  [
    '/img/docs/covers/dev-cover.jpeg',
    '/img/docs/covers/ent-cards-cover.jpg',
    '/img/docs/covers/how-to.jpg',
    '/img/docs/covers/information-cover.jpg',
    '/img/docs/covers/nfc-cover.jpeg',
    '/img/docs/covers/skysounds-cover.jpg',
    '/img/docs/covers/sustainability-cover.jpeg',
    '/img/docs/covers/terms-cover.jpg',
    '/img/docs/covers/tutorials-cover.jpeg',
  ].map((u) => `collect.maar.world${u}`),
);

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
const blocked = new Map();
const pendingAssets = [];

/**
 * Record a live URL the new build does not serve and that nothing on record
 * authorises removing. See the `dropKind` note at the top of this file: the
 * value is `drop` because that is what actually happens, not because it was
 * chosen.
 */
function unresolved(entry, { group, reason, question }) {
  entry.policy = 'drop';
  entry.dropKind = 'unresolved';
  entry.blockedGroup = group;
  entry.reason = reason;
  entry.openDecision = question;
  entry.blocked = true;
  openDecisions.push(`${entry.origin}${entry.url}`);
  if (!blocked.has(group)) blocked.set(group, { group, question, count: 0, urls: [] });
  const b = blocked.get(group);
  b.count += 1;
  b.urls.push(`${entry.origin}${entry.url}`);
  return entry;
}

/** The HOST_FILE_GROUPS entry a URL belongs to, or null. */
const groupFor = (url) =>
  HOST_FILE_GROUPS.find((g) => (g.urls && g.urls.includes(url)) || (g.prefix && url.startsWith(g.prefix))) || null;

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
        group: 'theme-docs',
        reason:
          `live in production (HTTP ${status}) and the new build does not emit it. ` +
          'ARCHITECTURE-REVIEW §10 item 12 forbids CARRYING OVER the z/ source directory; it does not authorise ' +
          'switching off a URL production answers with 200, and MW-4 says "This issue only records reality".' +
          (route.redirectTargetStatus >= 400
            ? ` This URL is a ${status} to ${route.redirectsTo}, which itself answers ${route.redirectTargetStatus}.`
            : ''),
        question:
          'Inherited jekyll-TeXt-theme documentation, live on maar.world and tree.maar.world today (/z is a 301 to '
          + 'a /z/ that 404s). Nothing on ' +
          'record says to serve it and nothing on record says to remove it. Should these URLs keep resolving ' +
          '(the build would have to ship the theme documentation), 301 somewhere, or be deliberately retired? ' +
          'Recorded as an unresolved drop, not as a decision.',
      }),
    );
    continue;
  }

  // --- host-level files and non-HTML resources ---------------------------
  // Checked before the per-origin branches, because these are not pages and the
  // page rules would give them a `servedAt` under /collect or /tree that means
  // nothing: assemble-public.mjs layers media/{shared,maar,collect,tree} into a
  // single publicDir at identical paths, so an asset is served at its own path
  // on the merged domain regardless of which origin it came from.
  const group = groupFor(base);
  if (group) {
    decisions.push(
      unresolved(entry, {
        group: group.group,
        reason:
          `live in production (HTTP ${status}, ${route.bytes} bytes) and the new build emits nothing at this path. ` +
          `${group.what} — not a page, and not something any migrated content references.`,
        question: group.question,
      }),
    );
    continue;
  }

  if (route.kind === 'asset' && route.seedReason !== 'pdf') {
    if (MIGRATION_DROPPED_MEDIA.has(`${origin}${base}`)) {
      decisions.push(
        unresolved(entry, {
          group: 'reference-dropped-in-migration',
          reason:
            `live in production and still referenced by ${route.referenceCount} live page(s) ` +
            `(${(route.referencedBy || []).join(', ')}), but absent from the build.`,
          question:
            'collect.maar.world/documentation.html renders these nine cover thumbnails today; the migrated ' +
            '/collect/documentation.html renders no images at all, so the references were lost in MW-7 rather ' +
            'than decided away. Preserving these URLs would demand assets the build does not ship. Decide: ' +
            'restore the thumbnails on the migrated page (and the URLs preserve themselves), or accept that the ' +
            'documentation index loses its cover art.',
        }),
      );
      continue;
    }

    // An asset is preserved because a preserved PAGE shows it. Whether its
    // referrers survive is only known once every page has a policy, so these
    // are settled in a second pass below.
    pendingAssets.push({ route, entry, base });
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
          group: 'tree-index-min',
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

// --- second pass: static assets -----------------------------------------
//
// An asset is kept because something that is itself kept points at it. Deciding
// that on reference count alone was wrong in a way worth spelling out:
// tree's /img/sq-mw-logo-jpg-black.png is referenced exactly once, by
// /index.min.html — a route whose own disposition is BLOCKED on assumption A8.
// Counting the reference made the logo `preserve`, which demanded the build ship
// an image for a page it deliberately does not build. The asset's fate is the
// referring page's fate, so it is derived from it.
//
// `referencedBy` is a capped sample. When the cap hides referrers
// (referenceCount exceeds the sample), the asset is preserved rather than
// dropped: an incomplete list is a reason to keep a URL, never a reason to
// retire one.
const preservedPages = new Set(
  decisions.filter((d) => d.policy === 'preserve').map((d) => `${d.origin}${d.url}`),
);

for (const { route, entry, base } of pendingAssets) {
  const sample = route.referencedBy || [];
  const sampleComplete = sample.length >= (route.referenceCount || 0);
  const liveReferrers = sample.filter((r) => preservedPages.has(`${route.origin}${r}`));

  if (route.referenceCount > 0 && (liveReferrers.length > 0 || !sampleComplete)) {
    entry.policy = 'preserve';
    entry.servedAt = base;
    entry.reason =
      `static asset referenced by ${route.referenceCount} live production page(s); served at the same path on ` +
      'the merged domain — assemble-public.mjs layers every area\u2019s media into one publicDir verbatim, and ' +
      'astro.config.mjs keeps build assets in /_assets precisely so /img/** is never disturbed';
    if (route.origin !== 'maar.world') entry.subdomainRedirect = `https://maar.world${base}`;
    decisions.push(entry);
    continue;
  }

  if (route.referenceCount > 0) {
    // Referenced, but only by pages that are themselves unresolved.
    const referrerGroups = [
      ...new Set(
        sample
          .map((r) => decisions.find((d) => d.origin === route.origin && d.url === r))
          .map((d) => (d && d.blockedGroup) || 'unknown'),
      ),
    ];
    decisions.push(
      unresolved(entry, {
        group: referrerGroups.length === 1 ? referrerGroups[0] : 'orphan-legacy-asset',
        reason:
          `live in production, but its only referrer(s) — ${sample.join(', ')} — are themselves unresolved, so ` +
          'this asset is kept or retired with them rather than on its own.',
        question:
          `Decided together with ${sample.join(', ')}: if those URLs keep resolving, this asset has to be served ` +
          'too; if they are retired, it goes with them. No separate answer is needed.',
      }),
    );
    continue;
  }

  decisions.push(
    unresolved(entry, {
      group: 'orphan-legacy-asset',
      reason:
        `live in production (HTTP ${route.status}, ${route.bytes} bytes) but referenced by no live page on any of ` +
        'the three sites, and absent from the build.',
      question:
        'Legacy static files the host still serves although nothing on the site points at them any more. ' +
        'Reachable only by knowing the URL — which is exactly what a hotlink, an embed in someone else\u2019s ' +
        'page, or an old social-media card is. This is one decision covering the whole group, not one per file: ' +
        'either check referrer logs and retire the unreferenced ones, or carry the tree across wholesale.',
    }),
  );
}

// Emit in manifest order rather than classification order, so policy.json still
// reads alongside the manifest line for line.
const order = new Map(manifest.routes.map((r, i) => [`${r.origin}${r.url}`, i]));
decisions.sort((a, b) => order.get(`${a.origin}${a.url}`) - order.get(`${b.origin}${b.url}`));

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
      blockedCount: [...blocked.values()].reduce((n, b) => n + b.count, 0),
      blockedGroupCount: blocked.size,
      blockedNote:
        'Live production URLs the new build does not serve and that nothing on record authorises removing. ' +
        'policy is `drop` because that is the consequence, not because it was decided — see dropKind: "unresolved" ' +
        'in scripts/author-policy.mjs. Each has a BLOCKED line in MIGRATION-LEDGER.md and needs a human answer.',
      blocked: [...blocked.values()],
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
console.log(
  `  open decisions: ${openDecisions.length}   BLOCKED: ${[...blocked.values()].reduce((n, b) => n + b.count, 0)} ` +
    `in ${blocked.size} group(s)`,
);

for (const d of decisions.filter((x) => x.policy === 'drop' && x.dropKind === 'decided')) {
  console.log(`  DROP(decided)  ${d.origin}${d.url} — ${d.reason}`);
}
console.log('\n  BLOCKED — live URLs the build does not serve, awaiting a human answer:');
for (const b of blocked.values()) {
  console.log(`    ${String(b.count).padStart(4)}  ${b.group}`);
  console.log(`          e.g. ${b.urls.slice(0, 3).join(', ')}${b.urls.length > 3 ? ', …' : ''}`);
}
for (const d of decisions.filter((x) => x.policy === 'redirect')) {
  console.log(`  301  ${d.origin}${d.url} -> ${d.target}`);
}

// The explicit list must not rot: an entry that stops appearing in the manifest
// is either a URL that went away or a typo, and both need saying out loud.
const seenDropped = new Set(
  decisions.filter((d) => d.blockedGroup === 'reference-dropped-in-migration').map((d) => `${d.origin}${d.url}`),
);
const staleDropped = [...MIGRATION_DROPPED_MEDIA].filter((u) => !seenDropped.has(u));
if (staleDropped.length) {
  console.warn(`\n  ! MIGRATION_DROPPED_MEDIA lists ${staleDropped.length} path(s) absent from the manifest:`);
  for (const u of staleDropped) console.warn(`      ${u}`);
}
