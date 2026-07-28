#!/usr/bin/env node
/**
 * npm run verify — the single command whose exit code decides whether work is done.
 *
 * An agent must never declare work complete from its own judgement. It runs this
 * and reads the exit code:
 *
 *   0  no check failed  (skipped checks are listed explicitly — green is not
 *                        the same as complete)
 *   1  at least one check failed
 *
 * OPERATING-RULES designates this as the source of truth, so it has to be the
 * strongest command in the repository, not the weakest. It used to omit
 * `verify:selftest`, `verify:schemas` and `ledger:check` — all three of which CI
 * ran — so an agent could satisfy the documented source of truth and still be
 * red on push. Those three are composed in below, and a selftest case asserts
 * that nothing CI runs is missing from this list.
 *
 * The selftest runs first, because a suite that cannot go red is worth nothing.
 * The build runs before the checks that inspect dist/.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Report } from './lib/report.mjs';
import { ROOT } from './lib/artifacts.mjs';
import { checkBuild } from './verify-build.mjs';
import { checkContract } from './verify-contract.mjs';
import { checkRoutes } from './verify-routes.mjs';
import { checkCards } from './verify-cards.mjs';
import { checkContent } from './verify-content.mjs';
import { checkLinks } from './verify-links.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Wrap a command-line check (one that reports by exiting non-zero) as a Report,
 * so composed checks and in-process checks read the same in the output.
 */
function commandCheck(label, [script, ...args]) {
  return async (report) => {
    const r = spawnSync('node', [resolve(HERE, script), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      maxBuffer: 32 * 1024 * 1024,
    });
    const output = `${r.stdout || ''}${r.stderr || ''}`.trim();
    const lines = output
      .split('\n')
      .filter((l) => l.trim())
      // Node's own diagnostics are not the check's verdict.
      .filter((l) => !/^\(node:\d+\)/.test(l) && !/--trace-warnings/.test(l));
    if (r.status === 0) {
      report.pass(label, lines.length ? lines[lines.length - 1].trim() : '');
    } else {
      const failures = lines.filter((l) => /FAIL/.test(l)).slice(0, 3);
      report.fail(label, (failures.length ? failures : lines.slice(-3)).map((l) => l.trim()).join(' / '));
    }
  };
}

/**
 * Every check `npm run verify` runs, in order. The npm script name is the key
 * so this can be compared against the CI workflow.
 */
export const CHECKS = [
  ['verify:selftest', commandCheck('the verify harness still fails on broken builds', ['selftest.mjs'])],
  ['verify:schemas', commandCheck('content schemas reject malformed records', ['check-schemas.mjs'])],
  ['verify:build', checkBuild],
  ['verify:contract', checkContract],
  ['verify:routes', checkRoutes],
  ['verify:cards', checkCards],
  ['verify:content', checkContent],
  ['verify:links', checkLinks],
  ['ledger:check', commandCheck('ledger format and append-only history', ['ledger.mjs', 'check'])],
];

export const CHECK_NAMES = CHECKS.map(([name]) => name);

const BOLD = '[1m';
const DIM = '[2m';
const RESET = '[0m';
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColour ? `${code}${s}${RESET}` : s);

async function main() {
  const reports = [];

  console.log(`\n${c(BOLD, 'maar-world verify')}`);

  for (const [name, fn] of CHECKS) {
    const report = new Report(name);
    console.log(`\n${c(BOLD, name)}`);
    try {
      await fn(report);
    } catch (err) {
      report.fail('check crashed', err && err.stack ? err.stack.split('\n')[0] : String(err));
    }
    report.print({ verbose: true });
    reports.push(report);
  }

  const totals = reports.reduce(
    (acc, r) => {
      const counts = r.counts;
      acc.PASS += counts.PASS;
      acc.FAIL += counts.FAIL;
      acc.SKIP += counts.SKIP;
      return acc;
    },
    { PASS: 0, FAIL: 0, SKIP: 0 },
  );

  console.log(`\n${c(BOLD, '─'.repeat(60))}`);

  const failedChecks = reports.filter((r) => r.failed).map((r) => r.name);
  const skipped = reports.flatMap((r) =>
    r.results.filter((x) => x.status === 'SKIP').map((x) => `${r.name}: ${x.label} — ${x.detail}`),
  );

  if (skipped.length) {
    console.log(
      `\n${c(BOLD, 'Not yet checkable')} ${c(DIM, '(upstream work outstanding — this run is not a completeness claim)')}`,
    );
    for (const s of skipped) console.log(`  · ${s}`);
  }

  console.log(`\n${c(BOLD, 'Total')}: ${totals.PASS} passed, ${totals.FAIL} failed, ${totals.SKIP} skipped`);

  if (failedChecks.length) {
    console.log(`${c(BOLD, 'Result')}: FAIL — ${failedChecks.join(', ')}\n`);
    process.exit(1);
  }

  console.log(`${c(BOLD, 'Result')}: PASS${skipped.length ? ' (incomplete)' : ''}\n`);
  process.exit(0);
}

// Importable without running: the selftest compares CHECK_NAMES against CI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
