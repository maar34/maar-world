#!/usr/bin/env node
/**
 * verify:routes — every route in the frozen production manifest is accounted for.
 *
 * The manifest is a contract, frozen from a crawl of the three live sites (MW-4).
 * It is never edited to make a check pass; the build conforms to it.
 *
 * Policy lives alongside it in routes/policy.json, which carries `servedAt` —
 * where the merged single-domain build serves each legacy URL from. Collect and
 * Tree URLs keep working through 301s from their subdomains, so what has to
 * exist in the build is the `/collect/*` or `/tree/*` path, not the original.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, ROOT, has, loadJson, indexDist } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const VALID_POLICIES = new Set(['preserve', 'redirect', 'drop']);

/**
 * Endpoints production serves that are not pages, restored by this build.
 * Declared here because two separate checks below need it: one asserts they are
 * still served, the other must not count them as unbacked extras.
 */
const RESTORED = ['feed', 'feed.xml', 'robots.txt', 'sitemap.xml', '404.html'];

const ALLOWLIST_REL = 'routes/scaffolding-allowlist.json';
const ALLOWLIST_PATH = resolve(ROOT, ALLOWLIST_REL);

/**
 * Pages the build may emit that no production route asks for.
 *
 * Kept as committed data rather than a constant so the list is reviewable in a
 * diff, and printed on every run so it cannot grow quietly into a hole.
 */
function loadScaffolding() {
  if (!existsSync(ALLOWLIST_PATH)) return { files: [], prefixes: [] };
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  return {
    files: (raw.files || []).map((f) => (typeof f === 'string' ? { path: f, reason: '' } : f)),
    prefixes: (raw.prefixes || []).map((p) => (typeof p === 'string' ? { path: p, reason: '' } : p)),
  };
}

/**
 * The outputPath of every hand-written page record.
 *
 * Read straight from `src/content/authored/**`, which is the same directory the
 * `pages` collection globs, so there is no second list to keep in step — a page
 * is authorised by existing, and de-authorised by being deleted. Frontmatter is
 * matched rather than parsed because this check must not depend on a YAML
 * library or on Astro being able to build.
 *
 * Migrated records are deliberately NOT read here. They are already authorised
 * by the policy, and reading them would let a migration bug authorise its own
 * output.
 */
export function authoredRoutes(dir = join(ROOT, 'src/content/authored')) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...authoredRoutes(abs));
      continue;
    }
    if (!name.endsWith('.md') && !name.endsWith('.mdx')) continue;
    const m = /^outputPath:\s*"(.*)"\s*$/m.exec(readFileSync(abs, 'utf8'));
    if (m) out.push(m[1]);
  }
  return out;
}

export async function checkRoutes(report) {
  if (!has('manifest')) {
    return report.skip('route manifest resolves against build', ARTIFACTS.manifest.rel, ARTIFACTS.manifest.issue);
  }
  if (!has('policy')) {
    return report.skip('every route has an explicit policy', ARTIFACTS.policy.rel, ARTIFACTS.policy.issue);
  }

  const manifest = loadJson('manifest');
  const policy = loadJson('policy');
  const routes = manifest.routes || [];
  const policies = policy.routes || [];

  if (routes.length === 0) {
    return report.fail('route manifest is non-empty', 'manifest contains zero routes');
  }
  report.pass('route manifest loaded', `${routes.length} routes frozen from production`);

  const key = (r) => `${r.origin}${r.url}`;
  const policyByKey = new Map(policies.map((p) => [key(p), p]));

  // Gate: every production route carries an explicit policy (MW-1 quality gate).
  const unclassified = routes.filter((r) => {
    const p = policyByKey.get(key(r));
    return !p || !VALID_POLICIES.has(p.policy);
  });
  if (unclassified.length) {
    report.fail(
      'every route has an explicit preserve/redirect/drop policy',
      `${unclassified.length} unclassified, first: ${unclassified[0].origin}${unclassified[0].url}`,
    );
  } else {
    report.pass('every route has an explicit preserve/redirect/drop policy', `${routes.length} routes`);
  }

  // The join is checked in both directions. Manifest -> policy catches a route
  // nobody decided about; policy -> manifest catches a decision about a route
  // that is not in the contract — an invented URL, or a stale decision left
  // behind after the manifest moved. Only the first half was implemented, so a
  // policy could describe a world the contract does not contain.
  const routeKeys = new Set(routes.map(key));
  const orphanPolicies = policies.filter((p) => !routeKeys.has(key(p)));
  if (orphanPolicies.length) {
    report.fail(
      'every policy decision refers to a route in the manifest',
      `${orphanPolicies.length} orphaned — first 5: ${orphanPolicies
        .slice(0, 5)
        .map((p) => `${p.origin}${p.url}`)
        .join(', ')}`,
    );
  } else {
    report.pass('every policy decision refers to a route in the manifest', `${policies.length} decisions`);
  }

  const targetless = policies.filter((p) => p.policy === 'redirect' && !p.target);
  if (targetless.length) {
    report.fail('every redirect declares a target', `${targetless.length} without target, first: ${targetless[0].url}`);
  } else {
    report.pass('every redirect declares a target');
  }

  const servedAtMissing = policies.filter((p) => p.policy === 'preserve' && !p.servedAt);
  if (servedAtMissing.length) {
    report.fail(
      'every preserved route declares where it is served from',
      `${servedAtMissing.length} without servedAt, first: ${servedAtMissing[0].url}`,
    );
  } else {
    report.pass('every preserved route declares where it is served from');
  }

  if (!has('dist')) {
    return report.skip('preserved routes exist in build output', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set } = indexDist();
  const preserve = policies.filter((p) => p.policy === 'preserve' && p.servedAt);
  const wanted = [...new Set(preserve.map((p) => p.servedAt))];
  const missing = wanted.filter((url) => !resolveRoute(url, set));

  if (missing.length) {
    report.fail(
      'every preserved route exists in build output',
      `${missing.length} of ${wanted.length} missing — first 5: ${missing.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('every preserved route exists in build output', `${wanted.length} distinct paths`);
  }

  /**
   * Endpoints production serves that are not pages.
   *
   * `/feed`, `/feed.xml`, `/robots.txt`, `/sitemap.xml` and `/404.html` are all
   * live 200s on all three production origins, and the build emitted none of
   * them. Three of the five fail SILENTLY when missing: an RSS reader that
   * stops updating logs nothing, a search engine that cannot find a sitemap at
   * the URL it has on file just crawls less, and a missing error page shows the
   * host's default rather than a 404 anyone notices.
   *
   * They are asserted here rather than left to the extras check below, because
   * that one only looks at `.html` files and only asks whether an emitted page
   * is WANTED. This asks the opposite question: is something production served
   * still being served. Nothing else in the suite would notice their removal.
   *
   * They remain `dropKind: unresolved` in routes/policy.json. Moving them to
   * `preserve` changes the contract and needs `npm run contract:relock`, which
   * is a deliberate human step — see MW-4 routes/syndication in the ledger.
   */
  const missingEndpoints = RESTORED.filter((f) => !set.has(f));
  if (missingEndpoints.length) {
    report.fail(
      'endpoints production serves are still served',
      `${missingEndpoints.length} missing: ${missingEndpoints.join(', ')} — ` +
        'these fail silently for readers and crawlers, which is why they are asserted',
    );
  } else {
    report.pass('endpoints production serves are still served', RESTORED.join(', '));
  }

  // --- Extras: pages the build emits that no production route asks for -----
  // MW-4's acceptance criterion is "reports missing/extra routes". Only the
  // missing half existed, so dist/ could accumulate pages backed by nothing —
  // and did: a synthetic ZZZ0000 card and two route-proof fixtures were being
  // built and shipped with nothing to flag them.
  const backed = new Set();
  for (const p of policies) {
    if (p.policy === 'preserve' && p.servedAt) {
      const file = resolveRoute(p.servedAt, set);
      if (file) backed.add(file);
    }
    if (p.policy === 'redirect' && p.target && !/^https?:/i.test(p.target)) {
      const file = resolveRoute(p.target, set);
      if (file) backed.add(file);
    }
  }

  /**
   * Pages this site published itself, rather than inherited from production.
   *
   * THIS IS THE TWO-JOBS SPLIT. `routes/manifest.production.json` answers "did
   * anything production served disappear", which is right forever. It was also
   * answering "may this URL exist at all", which is right only until cutover —
   * a frozen crawl of the old sites cannot authorise a page written next year,
   * so before this every new page failed as an extra and the site could not
   * grow without relocking a contract.
   *
   * So the allowed set is now `preserved ∪ authored`. Authored routes are not a
   * second frozen file — they are read from the records themselves, so
   * publishing is one file and nothing else. The fidelity half is untouched:
   * `backed` above is still built from the policy alone, and a preserved route
   * that stops resolving still fails.
   */
  /**
   * A restored endpoint is not an extra. `/404.html` is a page production
   * serves on all three origins; emitting it again is the opposite of an
   * unbacked page, and the policy still calling it `drop` is the open decision
   * this restores rather than a reason to fail the build.
   */
  for (const f of RESTORED) if (set.has(f)) backed.add(f);

  const authored = authoredRoutes();
  for (const outputPath of authored) {
    const file = resolveRoute(`/${outputPath}`, set);
    if (file) backed.add(file);
  }

  const scaffolding = loadScaffolding();
  const allowedFiles = new Set(scaffolding.files.map((f) => f.path));
  const allowedPrefixes = scaffolding.prefixes.map((p) => p.path);
  const isScaffolding = (file) =>
    allowedFiles.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix));

  const { files } = indexDist();
  const emittedPages = files.filter((f) => f.endsWith('.html'));
  const unbacked = emittedPages.filter((f) => !backed.has(f));
  const scaffolded = unbacked.filter(isScaffolding);
  const extras = unbacked.filter((f) => !isScaffolding(f));

  // Always visible, pass or fail: an allowlist nobody reads is a hole.
  const allowlistSummary = [
    ...scaffolding.files.map((f) => `${f.path}${f.reason ? ` (${f.reason.split('.')[0]})` : ''}`),
    ...scaffolding.prefixes.map((p) => `${p.path}*${p.reason ? ` (${p.reason.split('.')[0]})` : ''}`),
  ];
  const unused = [...allowedFiles, ...allowedPrefixes].filter(
    (entry) => !scaffolded.some((f) => f === entry || f.startsWith(entry)),
  );

  if (extras.length) {
    report.fail(
      'no page is emitted that no production route asks for',
      `${extras.length} extra of ${emittedPages.length} pages — first 5: ${extras.slice(0, 5).join(', ')}` +
        ` (allowed scaffolding: ${allowlistSummary.length ? allowlistSummary.join('; ') : 'none'})`,
    );
  } else {
    report.pass(
      'no page is emitted that no production route asks for',
      `${emittedPages.length} pages, ${scaffolded.length} allowed as scaffolding` +
        (scaffolded.length ? ` [${scaffolded.join(', ')}]` : '') +
        (unused.length ? ` — stale allowlist entries, delete them: ${unused.join(', ')}` : ''),
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-routes.mjs')) {
  runStandalone('verify:routes', checkRoutes);
}
