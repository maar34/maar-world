#!/usr/bin/env node
/**
 * verify:routes — every route in the frozen production manifest is accounted for.
 *
 * The manifest is a contract, frozen from a crawl of the three live sites (MW-4).
 * It is never edited to make a check pass; the build conforms to it.
 */

import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has, loadJson, indexDist } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const VALID_POLICIES = new Set(['preserve', 'redirect', 'drop']);

export async function checkRoutes(report) {
  if (!has('manifest')) {
    return report.skip('route manifest resolves against build', ARTIFACTS.manifest.rel, ARTIFACTS.manifest.issue);
  }

  const manifest = loadJson('manifest');
  const routes = manifest.routes || [];

  if (routes.length === 0) {
    return report.fail('route manifest is non-empty', 'manifest contains zero routes');
  }
  report.pass('route manifest loaded', `${routes.length} routes frozen from production`);

  // Gate: every route carries an explicit policy (MW-1 quality gate).
  const unclassified = routes.filter((r) => !VALID_POLICIES.has(r.policy));
  if (unclassified.length) {
    report.fail(
      'every route has an explicit preserve/redirect/drop policy',
      `${unclassified.length} unclassified, first: ${unclassified[0].url}`,
    );
  } else {
    report.pass('every route has an explicit preserve/redirect/drop policy');
  }

  // Gate: redirects declare a target.
  const targetless = routes.filter((r) => r.policy === 'redirect' && !r.target);
  if (targetless.length) {
    report.fail(
      'every redirect declares a target',
      `${targetless.length} without target, first: ${targetless[0].url}`,
    );
  } else {
    report.pass('every redirect declares a target');
  }

  if (!has('dist')) {
    return report.skip('preserved routes exist in build output', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set } = indexDist();
  const preserve = routes.filter((r) => r.policy === 'preserve');
  const missing = [];

  for (const route of preserve) {
    if (!resolveRoute(route.url, set)) missing.push(route.url);
  }

  if (missing.length) {
    report.fail(
      'every preserved route exists in build output',
      `${missing.length} of ${preserve.length} missing — first 5: ${missing.slice(0, 5).join(', ')}`,
    );
  } else {
    report.pass('every preserved route exists in build output', `${preserve.length} routes`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-routes.mjs')) {
  runStandalone('verify:routes', checkRoutes);
}
