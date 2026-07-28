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
  const ok =
    routes.code === 0 && contract.code === 1 && /frozen route set matches|route count is unchanged/.test(contract.out);
  return {
    ok,
    detail: ok
      ? 'verify:routes still exits 0 (the bypass), verify:contract exits 1'
      : `verify:routes ${routes.code}, verify:contract ${contract.code}\n${contract.out}`,
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
