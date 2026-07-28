#!/usr/bin/env node
/**
 * Proves the verify suite actually fails on a broken build.
 *
 * MW-3 acceptance criterion: "`npm run verify` runs and exits non-zero on a
 * deliberately broken build." A verification harness that has never been seen to
 * fail is not evidence of anything, so this constructs fixtures with known
 * defects and asserts the exit code and the specific failure text.
 *
 * Fixtures are built in a temp directory; the real repo is never touched.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));

/** Same fingerprint verify:cards uses for a frozen card description. */
const fingerprint = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);

const cardTitle = (code) => `Fixture Card ${code}`;
const cardDescription = (code) => `Frozen description for fixture card ${code}.`;

/** A fixture that should pass cleanly: 35 codes, all emitted, all noindex. */
function goodFixture(root) {
  const codes = [
    ...Array.from({ length: 34 }, (_, i) => `EBT${String(5599 + i).padStart(4, '0')}`),
  ];
  const expectations = (code) => ({
    title: cardTitle(code),
    descriptionSha256: fingerprint(cardDescription(code)),
    players: [],
    downloads: [],
  });
  const cards = codes.map((code) => ({ code, source: 'skysounds', expect: expectations(code) }));
  cards.push({ code: 'STW3344', source: 'stoney_way', expect: expectations('STW3344') });

  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });

  writeFileSync(join(root, 'routes/nfc-cards.json'), JSON.stringify({ cards }, null, 2));

  const routes = [];
  const policies = [];
  for (const { code } of cards) {
    for (const url of [`/${code}`, `/${code}.html`]) {
      routes.push({ url, origin: 'maar.world', status: 200 });
      policies.push({ url, origin: 'maar.world', policy: 'preserve', servedAt: url });
    }
  }
  writeFileSync(join(root, 'routes/manifest.production.json'), JSON.stringify({ routes }, null, 2));
  writeFileSync(join(root, 'routes/policy.json'), JSON.stringify({ routes: policies }, null, 2));

  const page = (code) =>
    `<!doctype html><html><head><meta name="robots" content="noindex">` +
    `<title>${cardTitle(code)} — Maar World</title></head><body><h1>${cardTitle(code)}</h1>` +
    `<p class="description">${cardDescription(code)}</p>` +
    `<p>${'Card content for verification fixtures. '.repeat(8)}</p></body></html>`;

  for (const { code } of cards) writeFileSync(join(root, 'dist', `${code}.html`), page(code));

  return cards;
}

function run(root, script, args = []) {
  const r = spawnSync('node', [join(SCRIPTS, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MW_VERIFY_ROOT: root, NO_COLOR: '1' },
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Run git inside a fixture, with an identity so commits work on any machine. */
function git(root, args) {
  const r = spawnSync(
    'git',
    ['-c', 'user.email=selftest@maar.world', '-c', 'user.name=selftest', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } },
  );
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

/** Lock the fixture's contract the same way a human would: the real command. */
function lockFixture(root) {
  const { code, out } = run(root, 'contract-lock.mjs', ['relock']);
  if (code !== 0) throw new Error(`fixture relock failed: ${out}`);
}

const cases = [];
function check(name, fn) {
  const root = mkdtempSync(join(tmpdir(), 'mw-selftest-'));
  try {
    const result = fn(root);
    cases.push({ name, ...result });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// 1. Healthy fixture passes.
check('intact build passes verify:cards', (root) => {
  goodFixture(root);
  const { code, out } = run(root, 'verify-cards.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 2. A missing card page fails.
check('deleting one card page fails verify:cards', (root) => {
  goodFixture(root);
  rmSync(join(root, 'dist', 'EBT5599.html'));
  const { code, out } = run(root, 'verify-cards.mjs');
  const ok = code === 1 && /every card code emits/.test(out);
  return { ok, detail: ok ? 'exit 1, missing page reported' : `expected exit 1 + message, got ${code}\n${out}` };
});

// 3. Wrong casing fails — the bug a case-insensitive filesystem would hide.
check('re-casing a card filename fails verify:cards', (root) => {
  goodFixture(root);
  rmSync(join(root, 'dist', 'EBT5599.html'));
  writeFileSync(
    join(root, 'dist', 'ebt5599.html'),
    '<!doctype html><html><head><meta name="robots" content="noindex"></head><body><h1>EBT5599</h1><p>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</p></body></html>',
  );
  const { code, out } = run(root, 'verify-cards.mjs');
  const ok = code === 1 && /case-stable/.test(out);
  return { ok, detail: ok ? 'exit 1, casing drift reported' : `expected exit 1 + casing message, got ${code}\n${out}` };
});

// 4. Dropping the _stoney_way card fails — the 34-vs-35 trap.
check('dropping STW3344 fails verify:cards', (root) => {
  goodFixture(root);
  const cards = JSON.parse(
    spawnSync('cat', [join(root, 'routes/nfc-cards.json')], { encoding: 'utf8' }).stdout,
  ).cards.filter((c) => c.code !== 'STW3344');
  writeFileSync(join(root, 'routes/nfc-cards.json'), JSON.stringify({ cards }, null, 2));
  const { code, out } = run(root, 'verify-cards.mjs');
  const ok = code === 1 && /STW3344 present|exactly 35/.test(out);
  return { ok, detail: ok ? 'exit 1, 34-vs-35 caught' : `expected exit 1, got ${code}\n${out}` };
});

// 5. Losing noindex fails.
check('stripping noindex fails verify:cards', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'STW3344.html'),
    '<!doctype html><html><head><title>STW3344</title></head><body><h1>STW3344</h1><p>' + 'y'.repeat(300) + '</p></body></html>',
  );
  const { code, out } = run(root, 'verify-cards.mjs');
  const ok = code === 1 && /noindex/.test(out);
  return { ok, detail: ok ? 'exit 1, missing noindex reported' : `expected exit 1, got ${code}\n${out}` };
});

// 6. Redirecting a card URL fails — the contract says never redirect.
check('redirecting a card URL fails verify:cards', (root) => {
  goodFixture(root);
  const policy = JSON.parse(
    spawnSync('cat', [join(root, 'routes/policy.json')], { encoding: 'utf8' }).stdout,
  );
  const target = policy.routes.find((r) => r.url === '/STW3344');
  target.policy = 'redirect';
  target.target = '/cards/stw3344';
  writeFileSync(join(root, 'routes/policy.json'), JSON.stringify(policy, null, 2));
  const { code, out } = run(root, 'verify-cards.mjs');
  const ok = code === 1 && /no card URL is redirected/.test(out);
  return { ok, detail: ok ? 'exit 1, redirect rejected' : `expected exit 1, got ${code}\n${out}` };
});

// 7. A missing preserved route fails verify:routes.
check('missing preserved route fails verify:routes', (root) => {
  goodFixture(root);
  rmSync(join(root, 'dist', 'EBT5600.html'));
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /every preserved route exists/.test(out);
  return { ok, detail: ok ? 'exit 1, missing route reported' : `expected exit 1, got ${code}\n${out}` };
});

// 8. An unclassified route fails verify:routes.
check('route without a policy fails verify:routes', (root) => {
  goodFixture(root);
  const manifest = JSON.parse(
    spawnSync('cat', [join(root, 'routes/manifest.production.json')], { encoding: 'utf8' }).stdout,
  );
  manifest.routes.push({ url: '/unclassified', origin: 'maar.world', status: 200 });
  writeFileSync(join(root, 'routes/manifest.production.json'), JSON.stringify(manifest, null, 2));
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /explicit preserve\/redirect\/drop policy/.test(out);
  return { ok, detail: ok ? 'exit 1, unclassified route reported' : `expected exit 1, got ${code}\n${out}` };
});

// 9. A third-party on-load resource fails verify:links.
check('third-party iframe fails verify:links', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'embed.html'),
    '<!doctype html><html><body><iframe src="https://www.youtube.com/embed/abc"></iframe></body></html>',
  );
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 1 && /third-party request fires on page load/.test(out);
  return { ok, detail: ok ? 'exit 1, third-party embed reported' : `expected exit 1, got ${code}\n${out}` };
});

// 10. A same-domain iframe is allowed — play.maar.world is same-site.
check('play.maar.world iframe passes verify:links', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'player.html'),
    '<!doctype html><html><body><iframe src="https://play.maar.world/?g=334"></iframe></body></html>',
  );
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 0;
  return { ok, detail: ok ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// --- F1: the frozen contract has an integrity lock ----------------------

// 11. A locked, untouched contract passes verify:contract.
check('locked contract passes verify:contract', (root) => {
  goodFixture(root);
  lockFixture(root);
  const { code, out } = run(root, 'verify-contract.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 12. The demonstrated bypass: shrink the manifest, regenerate policy to match.
//     verify:routes is *still* satisfied — a smaller contract is easier to meet —
//     so verify:contract is the only thing standing between that and a green run.
check('deleting routes from the manifest fails verify:contract', (root) => {
  goodFixture(root);
  lockFixture(root);
  const mPath = join(root, 'routes/manifest.production.json');
  const pPath = join(root, 'routes/policy.json');
  const manifest = readJson(mPath);
  const keep = new Set(manifest.routes.slice(0, 20).map((r) => `${r.origin}${r.url}`));
  manifest.routes = manifest.routes.filter((r) => keep.has(`${r.origin}${r.url}`));
  writeJson(mPath, manifest);
  const policy = readJson(pPath);
  policy.routes = policy.routes.filter((p) => keep.has(`${p.origin}${p.url}`));
  writeJson(pPath, policy);

  const routes = run(root, 'verify-routes.mjs');
  const contract = run(root, 'verify-contract.mjs');
  // The bypass worked because a smaller contract is trivially satisfied: the
  // missing-route assertion is still green against the untouched build.
  const stillSatisfied = /PASS\s+every preserved route exists in build output/.test(routes.out);
  const ok =
    stillSatisfied && contract.code === 1 && /frozen route set matches|route count is unchanged/.test(contract.out);
  return {
    ok,
    detail: ok
      ? 'the shrunken contract is still satisfied by the build; verify:contract exits 1'
      : `stillSatisfied=${stillSatisfied}, verify:contract ${contract.code}\n${contract.out}\n${routes.out}`,
  };
});

// 13. Deleting the lock must not make the check stop running.
check('deleting the contract lock fails verify:contract', (root) => {
  goodFixture(root);
  lockFixture(root);
  rmSync(join(root, 'routes/contract.lock.json'));
  const { code, out } = run(root, 'verify-contract.mjs');
  const ok = code === 1 && /is missing/.test(out) && !/SKIP/.test(out);
  return { ok, detail: ok ? 'exit 1, missing lock reported (not skipped)' : `expected exit 1, got ${code}\n${out}` };
});

// 14. A self-declared routeCount that does not match the routes present fails.
check('a lying routeCount fails verify:contract', (root) => {
  goodFixture(root);
  const mPath = join(root, 'routes/manifest.production.json');
  const manifest = readJson(mPath);
  manifest.routeCount = manifest.routes.length;
  writeJson(mPath, manifest);
  lockFixture(root);
  const relocked = readJson(mPath);
  relocked.routeCount = 999;
  writeJson(mPath, relocked);
  const { code, out } = run(root, 'verify-contract.mjs');
  const ok = code === 1 && /declares routeCount 999/.test(out);
  return { ok, detail: ok ? 'exit 1, self-declared count rejected' : `expected exit 1, got ${code}\n${out}` };
});

// 15. Flipping a policy decision (preserve -> drop is how an unmigrated route
//     stops being checked) fails verify:contract.
check('flipping a policy decision fails verify:contract', (root) => {
  goodFixture(root);
  lockFixture(root);
  const pPath = join(root, 'routes/policy.json');
  const policy = readJson(pPath);
  policy.routes[0].policy = 'drop';
  delete policy.routes[0].servedAt;
  writeJson(pPath, policy);
  const { code, out } = run(root, 'verify-contract.mjs');
  const ok = code === 1 && /policy decision set matches/.test(out);
  return { ok, detail: ok ? 'exit 1, policy drift reported' : `expected exit 1, got ${code}\n${out}` };
});

// 16. Re-locking never silently accepts removals: it has to be said out loud.
check('contract:relock refuses silent route removals', (root) => {
  goodFixture(root);
  // Commit the fixture so relock has a HEAD to diff against.
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'fixture']);
  lockFixture(root);
  const mPath = join(root, 'routes/manifest.production.json');
  const manifest = readJson(mPath);
  manifest.routes = manifest.routes.slice(0, 10);
  writeJson(mPath, manifest);

  const refused = run(root, 'contract-lock.mjs', ['relock']);
  const accepted = run(root, 'contract-lock.mjs', ['relock', '--accept-removals']);
  const ok = refused.code === 1 && /REFUSED/.test(refused.out) && accepted.code === 0;
  return {
    ok,
    detail: ok
      ? 'relock refuses removals, --accept-removals states it explicitly'
      : `refused=${refused.code} accepted=${accepted.code}\n${refused.out}`,
  };
});

// --- F2: a hollow build is a failed build --------------------------------

/**
 * Make a fixture buildable by verify:build without installing Astro: the check
 * looks for an astro config, node_modules and `npm run build`. The stub build
 * leaves the fixture's dist/ exactly as the case set it up, which is the point —
 * what is under test is the inspection of the output, not the bundler.
 */
function buildableFixture(root) {
  writeFileSync(join(root, 'astro.config.mjs'), 'export default {};\n');
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeJson(join(root, 'package.json'), {
    name: 'mw-selftest-fixture',
    private: true,
    type: 'module',
    scripts: { build: 'node --eval "process.exit(0)"' },
  });
}

const HOLLOW_PAGE = '<!doctype html><html><head></head><body></body></html>';

// 17. A fixture with real pages passes verify:build.
check('build with real pages passes verify:build', (root) => {
  goodFixture(root);
  buildableFixture(root);
  const { code, out } = run(root, 'verify-build.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 18. The demonstrated hollow site: every page empty, build still exits 0.
//     routes and cards were happy with this; verify:build must not be.
check('a hollow dist fails verify:build', (root) => {
  const cards = goodFixture(root);
  buildableFixture(root);
  for (const { code } of cards) writeFileSync(join(root, 'dist', `${code}.html`), HOLLOW_PAGE);
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /no emitted page is hollow/.test(out) && /non-empty <title>/.test(out);
  return {
    ok,
    detail: ok ? 'exit 1, hollow pages and missing titles reported' : `expected exit 1, got ${code}\n${out}`,
  };
});

// 19. Pages that exist but say almost nothing are hollow too.
check('pages with near-zero text fail verify:build', (root) => {
  const cards = goodFixture(root);
  buildableFixture(root);
  for (const { code } of cards) {
    writeFileSync(
      join(root, 'dist', `${code}.html`),
      `<!doctype html><html><head><title>${code}</title></head><body><p>.</p></body></html>`,
    );
  }
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /substantive amount of text/.test(out);
  return { ok, detail: ok ? 'exit 1, thin pages reported' : `expected exit 1, got ${code}\n${out}` };
});

// 20. A build that emits a handful of pages for a 70-route contract is not a build.
check('a near-empty dist fails verify:build', (root) => {
  const cards = goodFixture(root);
  buildableFixture(root);
  for (const { code } of cards.slice(5)) rmSync(join(root, 'dist', `${code}.html`));
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /plausible number of pages/.test(out);
  return { ok, detail: ok ? 'exit 1, page count reported' : `expected exit 1, got ${code}\n${out}` };
});

// --- F3: the ledger is append-only across its whole history --------------

const LEDGER_HEADER = [
  '# Migration ledger',
  '',
  'Append-only. Format:',
  '',
  '```',
  '<UTC stamp>  <MW-n>  <DONE|BLOCKED|NOTE>  <unit>  <detail>',
  '```',
  '',
];

const ledgerLine = (n, issue, status, unit, detail) =>
  [
    `2026-07-2${Math.min(9, 1 + Math.floor(n / 10))}T${String(10 + (n % 10)).padStart(2, '0')}:00Z`.padEnd(18),
    issue.padEnd(6),
    status.padEnd(8),
    unit.padEnd(42),
    detail,
  ]
    .join(' ')
    .trimEnd();

/**
 * A fixture ledger with real git history: two commits, one BLOCKED entry in the
 * middle. Every tamper case below starts from this and then commits its damage,
 * because committing the damage is exactly what defeated the old guard.
 */
function ledgerFixture(root) {
  const first = [
    ...LEDGER_HEADER,
    ledgerLine(0, 'MW-3', 'DONE', 'harness', 'first unit'),
    ledgerLine(1, 'MW-4', 'BLOCKED', 'route-freeze', 'needs a human decision'),
    ledgerLine(2, 'MW-4', 'DONE', 'policy', 'authored'),
    '',
  ].join('\n');
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), first);
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'ledger: first entries']);

  writeFileSync(
    join(root, 'MIGRATION-LEDGER.md'),
    `${first + ledgerLine(3, 'MW-5', 'DONE', 'scaffold', 'astro up')}\n`,
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'ledger: fourth entry']);
}

const ledgerCheck = (root) => run(root, 'ledger.mjs', ['check']);
const ledgerText = (root) => readFileSync(join(root, 'MIGRATION-LEDGER.md'), 'utf8');

// 21. An honestly-grown ledger passes.
check('an append-only ledger passes ledger:check', (root) => {
  ledgerFixture(root);
  const { code, out } = ledgerCheck(root);
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 22. Deleting a middle entry AND COMMITTING IT. The old guard said "intact".
check('deleting a middle entry and committing fails ledger:check', (root) => {
  ledgerFixture(root);
  const kept = ledgerText(root)
    .split('\n')
    .filter((l) => !l.includes('route-freeze'))
    .join('\n');
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), kept);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'tidy']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /not an append|went backwards/.test(out);
  return { ok, detail: ok ? 'exit 1, deletion caught after commit' : `expected exit 1, got ${code}\n${out}` };
});

// 23. Deleting every BLOCKED line and committing — the record of what needs a
//     human is the record an agent has the most incentive to lose.
check('deleting every BLOCKED line and committing fails ledger:check', (root) => {
  ledgerFixture(root);
  const kept = ledgerText(root)
    .split('\n')
    .filter((l) => !/\bBLOCKED\b/.test(l))
    .join('\n');
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), kept);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'clean up']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /not an append|went backwards/.test(out);
  return { ok, detail: ok ? 'exit 1, BLOCKED deletion caught' : `expected exit 1, got ${code}\n${out}` };
});

// 24. Rewriting the last commit instead of adding one.
check('git commit --amend that drops an entry fails ledger:check', (root) => {
  ledgerFixture(root);
  const kept = ledgerText(root)
    .split('\n')
    .filter((l) => !l.includes('route-freeze'))
    .join('\n');
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), kept);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '--amend', '-m', 'ledger: fourth entry']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /not an append|went backwards/.test(out);
  return { ok, detail: ok ? 'exit 1, amend caught' : `expected exit 1, got ${code}\n${out}` };
});

// 25. CI's case: the working copy IS HEAD. The old guard could never fire here.
check('a tampered ledger fails ledger:check with a clean working tree', (root) => {
  ledgerFixture(root);
  const kept = ledgerText(root)
    .split('\n')
    .filter((l) => !l.includes('route-freeze'))
    .join('\n');
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), kept);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'tidy']);
  const status = git(root, ['status', '--porcelain']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && status.out.trim() === '';
  return {
    ok,
    detail: ok ? 'exit 1 with nothing uncommitted — the CI case' : `status="${status.out.trim()}" exit=${code}\n${out}`,
  };
});

// 26. A missing ledger is not a passing ledger.
check('a missing ledger fails ledger:check', (root) => {
  ledgerFixture(root);
  rmSync(join(root, 'MIGRATION-LEDGER.md'));
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /does not exist/.test(out) && !/append-only intact/.test(out);
  return { ok, detail: ok ? 'exit 1, missing file reported' : `expected exit 1, got ${code}\n${out}` };
});

// 27. Neither is an empty one.
check('an entry-less ledger fails ledger:check', (root) => {
  writeFileSync(join(root, 'MIGRATION-LEDGER.md'), `${LEDGER_HEADER.join('\n')}\n`);
  git(root, ['init', '-q']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'empty ledger']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /no entries/.test(out);
  return { ok, detail: ok ? 'exit 1, empty ledger rejected' : `expected exit 1, got ${code}\n${out}` };
});

// 28. An uncommitted ledger cannot prove anything about its own history.
check('an uncommitted ledger fails ledger:check', (root) => {
  writeFileSync(
    join(root, 'MIGRATION-LEDGER.md'),
    `${[...LEDGER_HEADER, ledgerLine(0, 'MW-3', 'DONE', 'harness', 'first unit')].join('\n')}\n`,
  );
  git(root, ['init', '-q']);
  const { code, out } = ledgerCheck(root);
  const ok = code === 1 && /no committed history/.test(out);
  return { ok, detail: ok ? 'exit 1, no history reported' : `expected exit 1, got ${code}\n${out}` };
});

// --- F4: the third-party on-load gate, one case per demonstrated bypass ---

/**
 * Each of these is a confirmed miss of the previous scanner: it read only
 * `.html`, only quoted `href|src|action|data`, and only thirteen tag names.
 * Every one of them fires a third-party request before a visitor has chosen
 * anything, which is precisely what shipping with no cookie banner rests on.
 */
const ON_LOAD_BYPASSES = [
  ['<img srcset> fetches on load', '<img srcset="https://cdn.example.com/a.jpg 1x, https://cdn.example.com/b.jpg 2x">'],
  ['<source srcset> fetches on load', '<picture><source srcset="https://cdn.example.com/a.webp"><img src="/a.jpg"></picture>'],
  [
    '@font-face in a <style> block fetches on load',
    '<style>@font-face{font-family:X;src:url(https://fonts.gstatic.com/s/x/v1/x.woff2) format("woff2")}</style>',
  ],
  [
    'background-image in a style attribute fetches on load',
    '<div style="background-image:url(&#x22;https://cdn.example.com/bg.png&#x22;)">x</div>',
  ],
  [
    '<meta http-equiv=refresh> navigates on load',
    '<meta http-equiv="refresh" content="0; url=https://tracker.example.com/land">',
  ],
  ['an unquoted <iframe src> fetches on load', '<iframe src=https://www.youtube.com/embed/abc></iframe>'],
  ['<svg><image href> fetches on load', '<svg><image href="https://cdn.example.com/x.svg" /></svg>'],
  ['@import in a <style> block fetches on load', '<style>@import url("https://unpkg.com/thing/x.css");</style>'],
];

for (const [name, markup] of ON_LOAD_BYPASSES) {
  check(`${name} — fails verify:links`, (root) => {
    goodFixture(root);
    writeFileSync(
      join(root, 'dist', 'leak.html'),
      `<!doctype html><html><head><title>leak</title></head><body>${markup}<p>${'text '.repeat(40)}</p></body></html>`,
    );
    const { code, out } = run(root, 'verify-links.mjs');
    const ok = code === 1 && /third-party request fires on page load/.test(out);
    return { ok, detail: ok ? 'exit 1, on-load fetch reported' : `expected exit 1, got ${code}\n${out}` };
  });
}

// A third-party font inside a built stylesheet — previously 100% invisible,
// because verify:links only ever opened .html files.
check('url() in a built CSS file fails verify:links', (root) => {
  goodFixture(root);
  mkdirSync(join(root, 'dist', '_assets'), { recursive: true });
  writeFileSync(
    join(root, 'dist', '_assets', 'site.css'),
    '@font-face{font-family:Inter;src:url(https://fonts.gstatic.com/s/inter/v1/a.woff2) format("woff2")}\n',
  );
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 1 && /third-party request fires on page load/.test(out) && /fonts\.gstatic\.com/.test(out);
  return { ok, detail: ok ? 'exit 1, CSS font fetch reported' : `expected exit 1, got ${code}\n${out}` };
});

// The gate must not over-fire: a link a person chooses to follow is consent,
// and self-hosted CSS assets are first-party.
check('an <a href> to a third party still passes verify:links', (root) => {
  goodFixture(root);
  mkdirSync(join(root, 'dist', '_assets'), { recursive: true });
  writeFileSync(
    join(root, 'dist', '_assets', 'site.css'),
    '@font-face{font-family:Inter;src:url(/_assets/inter.woff2) format("woff2")}\n' +
      '.hero{background-image:url("../img/hero.jpg")}\n',
  );
  writeFileSync(
    join(root, 'dist', 'links.html'),
    '<!doctype html><html><head><title>links</title></head><body>' +
      '<a href="https://www.youtube.com/watch?v=abc">watch</a>' +
      '<form action="https://formspree.io/f/x"><button>send</button></form>' +
      `<p>${'text '.repeat(40)}</p></body></html>`,
  );
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 0;
  return { ok, detail: ok ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// --- F5: extra routes are reported, not just missing ones -----------------

// A page in dist/ that no production route asks for. dist/ held three of these
// (a synthetic ZZZ0000 card and two route-proof fixtures) with nothing to flag
// them, because only the "missing" half of MW-4's criterion was implemented.
check('an unbacked page in dist fails verify:routes', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'leftover.html'),
    '<!doctype html><html><head><title>leftover</title></head><body><p>orphan</p></body></html>',
  );
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /no production route asks for/.test(out) && /leftover\.html/.test(out);
  return { ok, detail: ok ? 'exit 1, extra page reported by name' : `expected exit 1, got ${code}\n${out}` };
});

// Scaffolding is allowed, but only from a committed list that gets printed.
check('allowlisted scaffolding passes verify:routes and is printed', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'leftover.html'),
    '<!doctype html><html><head><title>leftover</title></head><body><p>orphan</p></body></html>',
  );
  writeJson(join(root, 'routes/scaffolding-allowlist.json'), {
    files: [{ path: 'leftover.html', reason: 'fixture scaffolding' }],
  });
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 0 && /leftover\.html/.test(out) && /allowed as scaffolding/.test(out);
  return { ok, detail: ok ? 'exit 0, allowlist entry printed' : `expected exit 0 + printed list, got ${code}\n${out}` };
});

// --- F8: the policy/manifest join is checked in both directions ----------

check('a policy for a route not in the manifest fails verify:routes', (root) => {
  goodFixture(root);
  const pPath = join(root, 'routes/policy.json');
  const policy = readJson(pPath);
  policy.routes.push({ url: '/invented', origin: 'maar.world', policy: 'drop', reason: 'never existed' });
  writeJson(pPath, policy);
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /refers to a route in the manifest/.test(out) && /\/invented/.test(out);
  return { ok, detail: ok ? 'exit 1, orphaned policy reported' : `expected exit 1, got ${code}\n${out}` };
});

// --- F6: the external-link baseline ratchets both ways -------------------

const BASELINE_LINKS = ['https://maar-world.bandcamp.com/merch', 'https://www.instagram.com/maar_world_records'];

/** A fixture page carrying a chosen subset of the baseline's outbound links. */
function linkPage(root, urls) {
  mkdirSync(join(root, 'verify'), { recursive: true });
  writeJson(join(root, 'verify/external-links-baseline.json'), { urls: BASELINE_LINKS, allowedNew: [] });
  writeFileSync(
    join(root, 'dist', 'outbound.html'),
    '<!doctype html><html><head><title>outbound</title></head><body>' +
      urls.map((u) => `<a href="${u}">link</a>`).join('') +
      `<p>${'text '.repeat(40)}</p></body></html>`,
  );
}

// 42. Every baseline link still present: nothing to report.
check('a build carrying its baseline links passes verify:links', (root) => {
  goodFixture(root);
  linkPage(root, BASELINE_LINKS);
  const { code, out } = run(root, 'verify-links.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 43. The demonstrated hole: a build with the outbound links deleted reported
//     "PASS — no unreviewed external links introduced", because only additions
//     were ever compared against the baseline.
check('deleting an external link fails verify:links', (root) => {
  goodFixture(root);
  linkPage(root, [BASELINE_LINKS[0]]);
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 1 && /disappears unreviewed/.test(out) && /instagram/.test(out);
  return { ok, detail: ok ? 'exit 1, vanished link reported' : `expected exit 1, got ${code}\n${out}` };
});

// 44. Deleting every external link — the strongest form of the same bypass.
check('a build with no external links at all fails verify:links', (root) => {
  goodFixture(root);
  linkPage(root, []);
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 1 && /2 baseline links vanished/.test(out);
  return { ok, detail: ok ? 'exit 1, both losses reported' : `expected exit 1, got ${code}\n${out}` };
});

// 45. A removal that has been recorded deliberately is allowed through.
check('a recorded removal passes verify:links', (root) => {
  goodFixture(root);
  linkPage(root, [BASELINE_LINKS[0]]);
  writeJson(join(root, 'routes/external-link-removals.json'), { removed: [BASELINE_LINKS[1]] });
  const { code, out } = run(root, 'verify-links.mjs');
  const ok = code === 0 && /all recorded/.test(out);
  return { ok, detail: ok ? 'exit 0, recorded removal accepted' : `expected exit 0, got ${code}\n${out}` };
});

// --- Results ------------------------------------------------------------
console.log('\nverify harness selftest\n');
let failed = 0;
for (const c of cases) {
  if (c.ok) {
    console.log(`  PASS  ${c.name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${c.name}\n        ${c.detail.replace(/\n/g, '\n        ')}`);
  }
}
console.log(`\n  ${cases.length - failed}/${cases.length} selftest cases passed\n`);
process.exit(failed ? 1 : 0);
