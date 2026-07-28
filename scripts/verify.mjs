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
 * Build runs first because everything downstream inspects dist/.
 */

import { Report } from './lib/report.mjs';
import { checkBuild } from './verify-build.mjs';
import { checkRoutes } from './verify-routes.mjs';
import { checkCards } from './verify-cards.mjs';
import { checkContent } from './verify-content.mjs';
import { checkLinks } from './verify-links.mjs';

const CHECKS = [
  ['verify:build', checkBuild],
  ['verify:routes', checkRoutes],
  ['verify:cards', checkCards],
  ['verify:content', checkContent],
  ['verify:links', checkLinks],
];

const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColour ? `${code}${s}${RESET}` : s);

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
  console.log(`\n${c(BOLD, 'Not yet checkable')} ${c(DIM, '(upstream work outstanding — this run is not a completeness claim)')}`);
  for (const s of skipped) console.log(`  · ${s}`);
}

console.log(
  `\n${c(BOLD, 'Total')}: ${totals.PASS} passed, ${totals.FAIL} failed, ${totals.SKIP} skipped`,
);

if (failedChecks.length) {
  console.log(`${c(BOLD, 'Result')}: FAIL — ${failedChecks.join(', ')}\n`);
  process.exit(1);
}

console.log(`${c(BOLD, 'Result')}: PASS${skipped.length ? ' (incomplete)' : ''}\n`);
process.exit(0);
