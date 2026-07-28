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

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));

/** A fixture that should pass cleanly: 35 codes, all emitted, all noindex. */
function goodFixture(root) {
  const codes = [
    ...Array.from({ length: 34 }, (_, i) => `EBT${String(5599 + i).padStart(4, '0')}`),
  ];
  const cards = codes.map((code) => ({ code, source: 'skysounds' }));
  cards.push({ code: 'STW3344', source: 'stoney_way' });

  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });

  writeFileSync(join(root, 'routes/nfc-cards.json'), JSON.stringify({ cards }, null, 2));

  const routes = [];
  for (const { code } of cards) {
    routes.push({ url: `/${code}`, policy: 'preserve' });
    routes.push({ url: `/${code}.html`, policy: 'preserve' });
  }
  writeFileSync(join(root, 'routes/manifest.json'), JSON.stringify({ routes }, null, 2));

  const page = (code) =>
    `<!doctype html><html><head><meta name="robots" content="noindex">` +
    `<title>${code}</title></head><body><h1>${code}</h1>` +
    `<p>${'Card content for verification fixtures. '.repeat(8)}</p></body></html>`;

  for (const { code } of cards) writeFileSync(join(root, 'dist', `${code}.html`), page(code));

  return cards;
}

function run(root, script) {
  const r = spawnSync('node', [join(SCRIPTS, script)], {
    encoding: 'utf8',
    env: { ...process.env, MW_VERIFY_ROOT: root, NO_COLOR: '1' },
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
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
  const manifest = JSON.parse(
    spawnSync('cat', [join(root, 'routes/manifest.json')], { encoding: 'utf8' }).stdout,
  );
  const target = manifest.routes.find((r) => r.url === '/STW3344');
  target.policy = 'redirect';
  target.target = '/cards/stw3344';
  writeFileSync(join(root, 'routes/manifest.json'), JSON.stringify(manifest, null, 2));
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
    spawnSync('cat', [join(root, 'routes/manifest.json')], { encoding: 'utf8' }).stdout,
  );
  manifest.routes.push({ url: '/unclassified' });
  writeFileSync(join(root, 'routes/manifest.json'), JSON.stringify(manifest, null, 2));
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
