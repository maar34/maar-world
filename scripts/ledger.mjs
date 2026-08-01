#!/usr/bin/env node
/**
 * MIGRATION-LEDGER.md tooling.
 *
 * The ledger is append-only. It is the only thing that survives a context-window
 * boundary, so it is treated as a record, not a working file: never rewritten,
 * never reordered, only appended.
 *
 * Usage:
 *   node scripts/ledger.mjs append <MW-n> <DONE|BLOCKED|NOTE> <unit> [detail...]
 *   node scripts/ledger.mjs check            validate format + append-only
 *   node scripts/ledger.mjs status           summary by issue, blocked items
 *   node scripts/ledger.mjs tail [n]         last n entries (default 15)
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** `MW_VERIFY_ROOT` redirects at a fixture, exactly as the verify scripts do. */
const ROOT = process.env.MW_VERIFY_ROOT
  ? resolve(process.env.MW_VERIFY_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = resolve(ROOT, 'MIGRATION-LEDGER.md');
const LEDGER_REL = 'MIGRATION-LEDGER.md';

const STATUSES = ['DONE', 'BLOCKED', 'NOTE'];

/** A line is an entry if it starts with an ISO-minute UTC timestamp. */
const ENTRY_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z/;
const ENTRY_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)\s+(MW-\d+)\s+(DONE|BLOCKED|NOTE)\s+(\S+)(?:\s+(.*))?$/;

export function utcStamp(d = new Date()) {
  return `${d.toISOString().slice(0, 16)}Z`;
}

export function readLedger() {
  if (!existsSync(LEDGER_PATH)) return { lines: [], entries: [], malformed: [] };
  return parseLedger(readFileSync(LEDGER_PATH, 'utf8'));
}

/** Parse ledger text — used for the working copy and for every past revision. */
export function parseLedger(raw) {
  const lines = raw.split('\n');
  const entries = [];
  const malformed = [];

  // Lines inside fenced code blocks are format documentation, not entries.
  let inFence = false;

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (!ENTRY_START.test(line)) return;
    const m = ENTRY_RE.exec(line.trimEnd());
    if (!m) {
      malformed.push({ lineNo: i + 1, line });
      return;
    }
    entries.push({
      lineNo: i + 1,
      stamp: m[1],
      issue: m[2],
      status: m[3],
      unit: m[4],
      detail: (m[5] || '').trim(),
    });
  });

  return { lines, entries, malformed };
}

export function appendEntry({ issue, status, unit, detail = '' }) {
  if (!/^MW-\d+$/.test(issue)) throw new Error(`bad issue key: ${issue}`);
  if (!STATUSES.includes(status)) throw new Error(`bad status: ${status} (use ${STATUSES.join('|')})`);
  if (!unit || /\s/.test(unit)) throw new Error(`unit must be a single token without spaces: ${unit}`);
  if (status === 'BLOCKED' && !detail.trim()) {
    throw new Error('BLOCKED entries must carry a reason in the detail field');
  }

  const line = [
    utcStamp().padEnd(18),
    issue.padEnd(6),
    status.padEnd(8),
    unit.padEnd(42),
    detail,
  ]
    .join(' ')
    .trimEnd();

  if (!existsSync(LEDGER_PATH)) throw new Error(`ledger missing at ${LEDGER_PATH}`);
  const raw = readFileSync(LEDGER_PATH, 'utf8');
  appendFileSync(LEDGER_PATH, (raw.endsWith('\n') ? '' : '\n') + line + '\n');
  return line;
}

/** One comparable string per entry. Padding and header prose are not the record. */
const entryKey = (e) => `${e.stamp} ${e.issue} ${e.status} ${e.unit} ${e.detail}`.trimEnd();

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * The append-only guarantee, verified against the file's whole git history.
 *
 * The previous implementation compared the working copy against
 * `git show HEAD:MIGRATION-LEDGER.md`, which guaranteed nothing:
 *
 *   - deleting an entry and committing it made the working copy equal HEAD,
 *     so the guard reported "append-only intact";
 *   - deleting every BLOCKED line and committing did the same — the record of
 *     what needs a human is exactly what an agent has an incentive to lose;
 *   - `git commit --amend` passed for the same reason;
 *   - a missing file hit `catch { return null }` and reported "0 entries,
 *     append-only intact";
 *   - and in CI the working copy IS HEAD by construction, so the check could
 *     never fire at all — the one place it was meant to run.
 *
 * What is actually required is that the ledger only ever grew. So: walk every
 * revision of the file, require each revision's entry list to be a prefix of
 * the next, and require the working copy to extend the last one. Rewriting
 * history is then the only way to hide a deletion, and that is visible.
 *
 * @returns {string[]} violations; empty means the guarantee holds
 */
function appendOnlyViolations() {
  const violations = [];

  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return [
      'cannot verify append-only: not a git work tree (the guarantee is unverifiable here, so it is not claimed)',
    ];
  }

  // A repository with no commits at all makes `git log` exit non-zero; that is
  // the same situation as a ledger with no history, not an unverifiable one.
  let revisions = [];
  try {
    revisions = git(['log', '--format=%H', '--reverse', '--', LEDGER_REL])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    revisions = [];
  }

  if (!revisions.length) {
    return [`${LEDGER_REL} has no committed history — an uncommitted ledger proves nothing`];
  }

  const history = [];
  for (const sha of revisions) {
    let raw;
    try {
      raw = git(['show', `${sha}:${LEDGER_REL}`]);
    } catch {
      continue; // the revision that deleted the file; the prefix check below catches it
    }
    history.push({ sha, entries: parseLedger(raw).entries.map(entryKey) });
  }

  const current = existsSync(LEDGER_PATH) ? parseLedger(readFileSync(LEDGER_PATH, 'utf8')).entries.map(entryKey) : null;
  if (current === null) return [`${LEDGER_REL} does not exist`];

  const steps = [...history, { sha: 'working copy', entries: current }];

  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1];
    const next = steps[i];
    const label = (s) => (s.sha === 'working copy' ? 'working copy' : s.sha.slice(0, 8));

    if (next.entries.length < prev.entries.length) {
      violations.push(
        `entry count went backwards: ${label(prev)} had ${prev.entries.length}, ` +
          `${label(next)} has ${next.entries.length} — ${prev.entries.length - next.entries.length} entries were removed`,
      );
    }

    const at = prev.entries.findIndex((e, j) => next.entries[j] !== e);
    if (at !== -1) {
      violations.push(
        `${label(next)} is not an append to ${label(prev)}: entry ${at + 1} changed from ` +
          `"${prev.entries[at]}" to "${next.entries[at] === undefined ? '(removed)' : next.entries[at]}"`,
      );
    }
  }

  return violations;
}

function cmdCheck() {
  if (!existsSync(LEDGER_PATH)) {
    console.error(`FAIL  ${LEDGER_REL} does not exist`);
    process.exit(1);
  }

  const { entries, malformed } = readLedger();
  let bad = 0;

  // An empty ledger is not an intact ledger. "0 entries, append-only intact"
  // was the reassuring thing this printed after the record had been wiped.
  if (entries.length === 0) {
    console.error(`FAIL  ${LEDGER_REL} contains no entries`);
    bad += 1;
  }
  for (const m of malformed) {
    console.error(`FAIL  line ${m.lineNo}: unparseable entry: ${m.line}`);
    bad += 1;
  }
  for (const e of entries) {
    if (e.status === 'BLOCKED' && !e.detail) {
      console.error(`FAIL  line ${e.lineNo}: BLOCKED without a reason`);
      bad += 1;
    }
  }
  // Entries must never go backwards in time: an out-of-order stamp means either a
  // hand-written line or a clock problem, and both undermine the record.
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].stamp < entries[i - 1].stamp) {
      console.error(
        `FAIL  line ${entries[i].lineNo}: timestamp ${entries[i].stamp} precedes ${entries[i - 1].stamp} on line ${entries[i - 1].lineNo}`,
      );
      bad += 1;
    }
  }

  const violations = appendOnlyViolations();
  for (const v of violations) {
    console.error(`FAIL  ${v}`);
    bad += 1;
  }

  if (bad) process.exit(1);
  console.log(`ledger ok — ${entries.length} entries, append-only across the file's whole git history`);
}

function cmdStatus() {
  const { entries } = readLedger();
  const byIssue = new Map();
  for (const e of entries) {
    if (!byIssue.has(e.issue)) byIssue.set(e.issue, { DONE: 0, BLOCKED: 0, NOTE: 0 });
    byIssue.get(e.issue)[e.status] += 1;
  }
  const keys = [...byIssue.keys()].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  console.log(`\nLedger: ${entries.length} entries\n`);
  for (const k of keys) {
    const v = byIssue.get(k);
    console.log(`  ${k.padEnd(6)} done ${String(v.DONE).padStart(3)}   blocked ${String(v.BLOCKED).padStart(2)}   note ${String(v.NOTE).padStart(2)}`);
  }
  const blocked = entries.filter((e) => e.status === 'BLOCKED');
  if (blocked.length) {
    console.log(`\n  BLOCKED (${blocked.length}) — needs a human:`);
    for (const b of blocked) console.log(`    ${b.issue}  ${b.unit}  ${b.detail}`);
  }
  console.log('');
}

function cmdTail(n) {
  const { entries } = readLedger();
  for (const e of entries.slice(-n)) {
    console.log(`${e.stamp}  ${e.issue}  ${e.status.padEnd(7)}  ${e.unit}  ${e.detail}`);
  }
}

/**
 * Search the ledger instead of reading it.
 *
 * This exists so no session ever has to be told "read the last N entries"
 * again. The ledger is 164 entries and grows; the tail of it is not the part
 * you need, the part about the thing in front of you is. Case-insensitive
 * substring over the whole line, newest first.
 */
function cmdFind(term) {
  if (!term) {
    console.error('usage: ledger.mjs find <term>   e.g. find dropbox');
    process.exit(1);
  }
  const lines = readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter((l) => /^20\d\d-/.test(l) && l.toLowerCase().includes(term.toLowerCase()))
    .reverse();
  if (!lines.length) {
    console.log(`no ledger entry mentions "${term}"`);
    return;
  }
  for (const l of lines) console.log(l);
  console.log(`\n${lines.length} entr${lines.length === 1 ? 'y' : 'ies'} mentioning "${term}"`);
}

const isEntryPoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [, , cmd, ...rest] = process.argv;

if (isEntryPoint) switch (cmd) {
  case 'append': {
    const [issue, status, unit, ...detail] = rest;
    const text = detail.join(' ');
    /**
     * A HARD CAP, not a guideline.
     *
     * The ledger is append-only and every session reads the tail of it, so a
     * long entry is a cost paid forever by everyone. Measured at 164 entries:
     * the mean was 753 characters, and one session's twelve averaged 3222 —
     * 4.3x — which alone made "read the last 14 entries" an 11,500-token
     * instruction. That is the whole onboarding budget spent on history.
     *
     * An entry's job is: what changed, the number that moved, and where to
     * look. The REASONING belongs in a comment beside the code it explains,
     * where it costs nothing until someone opens that file, or in .agents/decisions/
     * when it is a decision rather than an explanation.
     */
    const MAX_DETAIL = 500;
    if (text.length > MAX_DETAIL) {
      console.error(
        `ledger append failed: detail is ${text.length} chars, limit ${MAX_DETAIL}.\n\n` +
          'Say what changed, the number that moved, and which file to open.\n' +
          'Put the reasoning in a comment next to the code, or an ADR in .agents/decisions/.\n' +
          'The ledger is append-only and every future session reads it.\n\n' +
          `First ${MAX_DETAIL} chars of what you tried to write:\n${text.slice(0, MAX_DETAIL)}…`,
      );
      process.exit(1);
    }
    try {
      console.log(appendEntry({ issue, status, unit, detail: text }));
    } catch (err) {
      console.error(`ledger append failed: ${err.message}`);
      process.exit(1);
    }
    break;
  }
  case 'check':
    cmdCheck();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'tail':
    cmdTail(Number(rest[0]) || 15);
    break;
  case 'find':
    cmdFind(rest.join(' '));
    break;
  default:
    console.error('usage: ledger.mjs append|check|status|tail|find <term>');
    process.exit(1);
}
