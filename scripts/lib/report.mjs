/**
 * Shared result reporting for every `verify:*` script.
 *
 * The exit code is the contract. Agents must never decide that work is complete
 * from their own judgement — they run the command and read the exit code.
 *
 *   PASS  the assertion ran and held
 *   FAIL  the assertion ran and did not hold            -> exit 1
 *   SKIP  the assertion could not run yet because an
 *         upstream artifact does not exist              -> exit 0, printed loudly
 *
 * SKIP must always name the artifact that is missing and the Linear issue that
 * produces it, so a green run is never mistaken for a complete one.
 */

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColour ? `${code}${s}${RESET}` : s);

export class Report {
  constructor(name) {
    this.name = name;
    this.results = [];
  }

  pass(label, detail = '') {
    this.results.push({ status: 'PASS', label, detail });
    return this;
  }

  fail(label, detail = '') {
    this.results.push({ status: 'FAIL', label, detail });
    return this;
  }

  /**
   * @param {string} label   what could not be checked
   * @param {string} missing the artifact that does not exist yet
   * @param {string} issue   the Linear issue key that produces it
   */
  skip(label, missing, issue) {
    this.results.push({
      status: 'SKIP',
      label,
      detail: `prerequisite missing: ${missing} (produced by ${issue})`,
    });
    return this;
  }

  get counts() {
    const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
    for (const r of this.results) counts[r.status] += 1;
    return counts;
  }

  get failed() {
    return this.counts.FAIL > 0;
  }

  /** Print the detail lines for this check and return the process exit code. */
  print({ verbose = false } = {}) {
    const { PASS, FAIL, SKIP } = this.counts;

    for (const r of this.results) {
      if (r.status === 'PASS' && !verbose) continue;
      const tag =
        r.status === 'PASS'
          ? c(GREEN, 'PASS')
          : r.status === 'FAIL'
            ? c(RED, 'FAIL')
            : c(YELLOW, 'SKIP');
      const detail = r.detail ? c(DIM, ` — ${r.detail}`) : '';
      console.log(`  ${tag}  ${r.label}${detail}`);
    }

    const summary = `${PASS} passed, ${FAIL} failed, ${SKIP} skipped`;
    const verdict = FAIL > 0 ? c(RED, 'FAIL') : SKIP > 0 ? c(YELLOW, 'PASS (incomplete)') : c(GREEN, 'PASS');
    console.log(`  ${c(BOLD, this.name)}: ${verdict} ${c(DIM, `(${summary})`)}`);

    return FAIL > 0 ? 1 : 0;
  }
}

/** Run a single check as a standalone command (`npm run verify:routes`). */
export async function runStandalone(name, fn) {
  const report = new Report(name);
  console.log(`\n${c(BOLD, name)}`);
  try {
    await fn(report);
  } catch (err) {
    report.fail('check crashed', err && err.stack ? err.stack.split('\n')[0] : String(err));
  }
  const code = report.print({ verbose: true });
  console.log('');
  process.exit(code);
}
