#!/usr/bin/env node
/**
 * verify:contract — the frozen route contract is still the one that was frozen.
 *
 * Every other check asserts things *about* routes/manifest.production.json.
 * This one asserts something *of* it: that its canonical route set still hashes
 * to the value committed in routes/contract.lock.json, and that its
 * self-declared `routeCount` matches what it actually contains.
 *
 * Without this, the manifest was a contract only by convention. Deleting most
 * of it and re-running the project's own `npm run freeze:routes` made
 * `verify:routes` pass, because a smaller manifest is trivially satisfied by
 * the same build — the checks agreed with a document that had been rewritten
 * underneath them.
 *
 * A missing lock is a FAIL, never a SKIP: "delete the lock" must not be a way
 * to make the check stop running.
 */

import { existsSync } from 'node:fs';
import { runStandalone } from './lib/report.mjs';
import { ARTIFACTS, has } from './lib/artifacts.mjs';
import {
  LOCK_REL,
  MANIFEST_PATH,
  POLICY_PATH,
  compareToLock,
  computeState,
  readLock,
} from './contract-lock.mjs';

export async function checkContract(report) {
  if (!has('manifest')) {
    return report.skip('frozen route contract is intact', ARTIFACTS.manifest.rel, ARTIFACTS.manifest.issue);
  }

  const lock = readLock();
  if (!lock) {
    return report.fail(
      'frozen route contract is intact',
      `${LOCK_REL} is missing — the manifest has no integrity lock. ` +
        'Create one deliberately with npm run contract:relock and commit it.',
    );
  }

  let state;
  try {
    state = computeState({ manifestPath: MANIFEST_PATH, policyPath: POLICY_PATH });
  } catch (err) {
    return report.fail('frozen route contract is intact', `contract files unreadable: ${err.message}`);
  }

  if (state.manifest.routeCount === 0) {
    return report.fail('frozen route contract is intact', 'manifest contains zero routes');
  }

  const { problems, notes } = compareToLock(state, lock);

  for (const p of problems) report.fail(p.label, p.detail);

  if (!problems.length) {
    report.pass(
      'frozen route set matches routes/contract.lock.json',
      `${state.manifest.routeCount} routes, sha256 ${state.manifest.routeSetSha256.slice(0, 12)}` +
        (notes.length ? ` (${notes.join('; ')})` : ''),
    );
    report.pass(
      'manifest routeCount matches the routes it actually contains',
      `${state.manifest.routeCount} declared and present`,
    );
    if (lock.policy && state.policy) {
      report.pass(
        'policy decision set matches routes/contract.lock.json',
        `${state.policy.routeCount} decisions ${JSON.stringify(state.policy.counts)}`,
      );
    } else if (existsSync(POLICY_PATH)) {
      report.fail(
        'policy decision set is covered by the lock',
        'the lock records no policy digest — re-lock with npm run contract:relock',
      );
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-contract.mjs')) {
  runStandalone('verify:contract', checkContract);
}
