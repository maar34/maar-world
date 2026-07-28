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

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = resolve(ROOT, 'MIGRATION-LEDGER.md');

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
  const raw = readFileSync(LEDGER_PATH, 'utf8');
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

/** The committed ledger must still be a prefix of the working copy. */
function appendOnlyViolation() {
  let committed;
  try {
    committed = execFileSync('git', ['show', 'HEAD:MIGRATION-LEDGER.md'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // not committed yet — nothing to compare against
  }
  const current = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8') : '';
  if (!current.startsWith(committed)) {
    const cLines = committed.split('\n');
    const wLines = current.split('\n');
    const at = cLines.findIndex((l, i) => wLines[i] !== l);
    return `committed ledger is no longer a prefix of the working copy (first divergence at line ${at + 1})`;
  }
  return null;
}

function cmdCheck() {
  const { entries, malformed } = readLedger();
  let bad = 0;

  if (!existsSync(LEDGER_PATH)) {
    console.error('FAIL  MIGRATION-LEDGER.md does not exist');
    process.exit(1);
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

  const violation = appendOnlyViolation();
  if (violation) {
    console.error(`FAIL  ${violation}`);
    bad += 1;
  }

  if (bad) process.exit(1);
  console.log(`ledger ok — ${entries.length} entries, append-only intact`);
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

const isEntryPoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [, , cmd, ...rest] = process.argv;

if (isEntryPoint) switch (cmd) {
  case 'append': {
    const [issue, status, unit, ...detail] = rest;
    try {
      console.log(appendEntry({ issue, status, unit, detail: detail.join(' ') }));
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
  default:
    console.error('usage: ledger.mjs append|check|status|tail');
    process.exit(1);
}
