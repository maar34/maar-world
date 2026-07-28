#!/usr/bin/env node
/**
 * The integrity lock for the frozen route contract.
 *
 * `routes/manifest.production.json` is a contract, but until now nothing
 * asserted anything *of* it — only things *about* it. `routeCount` is
 * self-declared, and the manifest is regenerable by a committed script, so
 * "regenerate it and the checks agree with themselves again" was a working
 * bypass: deleting 235 of 306 routes and re-running `npm run freeze:routes`
 * flipped `verify:routes` from FAIL to PASS with nothing to see in the output.
 *
 * `routes/contract.lock.json` closes that. It holds a SHA-256 over the
 * manifest's canonical route set (not its formatting, not its crawl metadata)
 * plus the route count, and the same for the policy's decision set. Any change
 * to either — by hand or by regeneration — fails `verify:contract` until a
 * human deliberately re-locks:
 *
 *     npm run contract:relock                      prints the diff, refuses removals
 *     npm run contract:relock -- --accept-removals
 *
 * Re-locking is never something `npm run freeze:routes` does silently. That
 * separation is the whole point: regenerating the manifest is legitimate,
 * regenerating it to make a check pass is not, and the two are only
 * distinguishable if the second one has to be stated out loud.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/artifacts.mjs';

export const LOCK_PATH = resolve(ROOT, 'routes/contract.lock.json');
export const LOCK_REL = 'routes/contract.lock.json';
export const MANIFEST_PATH = resolve(ROOT, 'routes/manifest.production.json');
export const POLICY_PATH = resolve(ROOT, 'routes/policy.json');

/**
 * Field separator inside a canonical line. ASCII Unit Separator: it cannot
 * occur in a URL, so no route can forge a line boundary. Production URLs on
 * these sites contain literal spaces, which is why a space is not usable here.
 */
const SEP = String.fromCharCode(0x1f);

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Sort with a fixed, locale-independent order — the hash must not move between machines. */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One canonical line per route: origin and URL only.
 *
 * Deliberately excludes crawl metadata (bytes, titles, timestamps) so that
 * re-crawling a site that has not changed its URL set does not invalidate the
 * lock. What is frozen is *which URLs existed*, which is what every downstream
 * check depends on.
 */
export function manifestRouteLines(manifest) {
  const routes = (manifest && manifest.routes) || [];
  return [...new Set(routes.map((r) => [r.origin, r.url].join(SEP)))].sort(byCodePoint);
}

/**
 * One canonical line per policy decision: the join key plus the decision itself.
 * Flipping unmigrated routes from `preserve` to `drop` is the other way to make
 * `verify:routes` agree with itself, so the decisions are locked too.
 */
export function policyDecisionLines(policy) {
  const routes = (policy && policy.routes) || [];
  return [
    ...new Set(
      routes.map((p) => [p.origin, p.url, p.policy, p.target || '', p.servedAt || ''].join(SEP)),
    ),
  ].sort(byCodePoint);
}

export function digestOf(lines) {
  return sha256(lines.join('\n'));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Everything the lock asserts, computed from the files on disk. */
export function computeState({ manifestPath = MANIFEST_PATH, policyPath = POLICY_PATH } = {}) {
  const manifest = readJson(manifestPath);
  const routeLines = manifestRouteLines(manifest);
  const state = {
    manifest: {
      file: 'routes/manifest.production.json',
      routeCount: (manifest.routes || []).length,
      distinctRouteCount: routeLines.length,
      declaredRouteCount: typeof manifest.routeCount === 'number' ? manifest.routeCount : null,
      routeSetSha256: digestOf(routeLines),
    },
    lines: { routes: routeLines, policy: [] },
  };

  if (existsSync(policyPath)) {
    const policy = readJson(policyPath);
    const policyLines = policyDecisionLines(policy);
    const counts = { preserve: 0, redirect: 0, drop: 0, other: 0 };
    for (const p of policy.routes || []) {
      if (counts[p.policy] === undefined) counts.other += 1;
      else counts[p.policy] += 1;
    }
    state.policy = {
      file: 'routes/policy.json',
      routeCount: (policy.routes || []).length,
      counts,
      decisionSetSha256: digestOf(policyLines),
    };
    state.lines.policy = policyLines;
  }

  return state;
}

export function lockPayload(state) {
  return {
    note:
      'Integrity lock for the frozen route contract. Holds a SHA-256 of the canonical ' +
      'route set and of the policy decision set, so that neither hand-editing nor ' +
      'regeneration can quietly change what the contract says. Verified by ' +
      'npm run verify:contract. Changed only by npm run contract:relock, never by ' +
      'npm run freeze:routes.',
    lockedAt: new Date().toISOString(),
    generator: 'scripts/contract-lock.mjs',
    relockCommand: 'npm run contract:relock',
    algorithm: 'sha256',
    canonicalisation:
      'fields joined by U+001F, lines sorted by code point, joined by \\n. ' +
      'manifest line: origin, url. policy line: origin, url, policy, target, servedAt.',
    manifest: state.manifest,
    policy: state.policy || null,
  };
}

export function readLock(path = LOCK_PATH) {
  if (!existsSync(path)) return null;
  return readJson(path);
}

/** Set difference on canonical lines. */
function diffLines(oldLines, newLines) {
  const before = new Set(oldLines);
  const after = new Set(newLines);
  return {
    added: newLines.filter((l) => !before.has(l)),
    removed: oldLines.filter((l) => !after.has(l)),
  };
}

const readable = (line) => line.split(SEP).filter(Boolean).join('  ');

/**
 * Compare on-disk state against a lock. Pure — used by verify:contract and by
 * the relock command, so both report the same thing.
 */
export function compareToLock(state, lock) {
  const problems = [];
  const notes = [];

  const declared = state.manifest.declaredRouteCount;
  if (declared !== null && declared !== state.manifest.routeCount) {
    problems.push({
      label: 'manifest routeCount matches the routes it actually contains',
      detail: `manifest declares routeCount ${declared} but carries ${state.manifest.routeCount} routes`,
    });
  }

  if (state.manifest.routeCount !== lock.manifest.routeCount) {
    const delta = state.manifest.routeCount - lock.manifest.routeCount;
    problems.push({
      label: 'frozen route count is unchanged',
      detail:
        `locked at ${lock.manifest.routeCount} routes, manifest now has ${state.manifest.routeCount} ` +
        `(${delta > 0 ? '+' : ''}${delta})`,
    });
  }

  if (state.manifest.routeSetSha256 !== lock.manifest.routeSetSha256) {
    problems.push({
      label: 'frozen route set matches routes/contract.lock.json',
      detail:
        `sha256 ${state.manifest.routeSetSha256.slice(0, 12)} != locked ${lock.manifest.routeSetSha256.slice(0, 12)} ` +
        '— the contract changed; re-lock deliberately with npm run contract:relock if that is intended',
    });
  }

  if (lock.policy) {
    if (!state.policy) {
      problems.push({
        label: 'policy is present and matches the lock',
        detail: 'routes/policy.json is missing but the lock records a policy decision set',
      });
    } else if (state.policy.decisionSetSha256 !== lock.policy.decisionSetSha256) {
      problems.push({
        label: 'policy decision set matches routes/contract.lock.json',
        detail:
          `sha256 ${state.policy.decisionSetSha256.slice(0, 12)} != locked ${lock.policy.decisionSetSha256.slice(0, 12)} ` +
          `(locked counts ${JSON.stringify(lock.policy.counts)}, now ${JSON.stringify(state.policy.counts)})`,
      });
    }
  } else if (state.policy) {
    notes.push('lock predates routes/policy.json — re-lock to cover policy decisions too');
  }

  return { problems, notes };
}

// --- relock CLI ----------------------------------------------------------

/**
 * The manifest as git last committed it, for the human-readable half of the
 * relock diff. Best effort: the digests in the lock are the authority, this is
 * only what gets printed.
 */
function previousRouteLines() {
  try {
    const raw = execFileSync('git', ['show', 'HEAD:routes/manifest.production.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return manifestRouteLines(JSON.parse(raw));
  } catch {
    return [];
  }
}

function relock(argv) {
  const acceptRemovals = argv.includes('--accept-removals');

  if (!existsSync(MANIFEST_PATH)) {
    console.error(`contract:relock — no manifest at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const state = computeState();
  const lock = readLock();

  console.log('\ncontract:relock');
  console.log('-'.repeat(64));

  if (!lock) {
    console.log('  no existing lock — creating routes/contract.lock.json for the first time');
    console.log(`  manifest : ${state.manifest.routeCount} routes, sha256 ${state.manifest.routeSetSha256}`);
    if (state.policy) {
      console.log(
        `  policy   : ${state.policy.routeCount} decisions ${JSON.stringify(state.policy.counts)}, ` +
          `sha256 ${state.policy.decisionSetSha256}`,
      );
    }
  } else {
    const routeDiff = diffLines(previousRouteLines(), state.lines.routes);
    const addedCount = routeDiff.added.length;
    const removedCount = routeDiff.removed.length;

    console.log(`  route count : ${lock.manifest.routeCount} -> ${state.manifest.routeCount}`);
    console.log(
      `  route sha   : ${lock.manifest.routeSetSha256.slice(0, 16)} -> ${state.manifest.routeSetSha256.slice(0, 16)}`,
    );
    if (lock.policy && state.policy) {
      console.log(
        `  policy sha  : ${lock.policy.decisionSetSha256.slice(0, 16)} -> ${state.policy.decisionSetSha256.slice(0, 16)}`,
      );
      console.log(`  policy mix  : ${JSON.stringify(lock.policy.counts)} -> ${JSON.stringify(state.policy.counts)}`);
    }

    if (addedCount || removedCount) {
      console.log(`\n  ${addedCount} route(s) added, ${removedCount} route(s) removed`);
      for (const l of routeDiff.added.slice(0, 20)) console.log(`    + ${readable(l)}`);
      if (addedCount > 20) console.log(`    + ... ${addedCount - 20} more`);
      for (const l of routeDiff.removed.slice(0, 20)) console.log(`    - ${readable(l)}`);
      if (removedCount > 20) console.log(`    - ... ${removedCount - 20} more`);
    } else {
      console.log('\n  route set unchanged against HEAD (metadata or policy decisions moved)');
    }

    if (removedCount && !acceptRemovals) {
      console.error(
        `\n  REFUSED — ${removedCount} route(s) would leave the contract.\n` +
          '  Routes disappearing from the manifest is the shape of the bypass this lock exists to stop.\n' +
          '  If the removal is genuinely intended, say so explicitly:\n' +
          '      npm run contract:relock -- --accept-removals\n',
      );
      process.exit(1);
    }
  }

  writeFileSync(LOCK_PATH, `${JSON.stringify(lockPayload(state), null, 2)}\n`);
  console.log(`\n  wrote ${LOCK_REL}`);
  console.log('  commit it on its own, with the reason for the change in the message.\n');
}

const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'relock') {
    relock(rest);
  } else {
    console.error('usage: contract-lock.mjs relock [--accept-removals]');
    process.exit(1);
  }
}
