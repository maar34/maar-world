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

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const VALID_POLICIES = new Set(['preserve', 'redirect', 'drop']);

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
}

if (process.argv[1] && process.argv[1].endsWith('verify-routes.mjs')) {
  runStandalone('verify:routes', checkRoutes);
}
