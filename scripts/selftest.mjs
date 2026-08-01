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

import { CHECK_NAMES } from './verify.mjs';
import { sha, plainText, bodyText, readableText, mainOf } from './lib/html-text.mjs';
import { renderFeed, xmlEscape, rfc822 } from '../src/lib/feed.mjs';
import { routeToFiles } from './lib/routes.mjs';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)));

/** THE fingerprint verify:cards uses — the same function, not a third copy. */
const fingerprint = (text) => sha(text, 32);

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

  // The endpoints production serves that are not pages. A healthy build has
  // them, so the fixture that stands for a healthy build must too — otherwise
  // every case expecting exit 0 fails for a reason unrelated to what it tests.
  for (const f of [
    'feed',
    'feed.xml',
    'robots.txt',
    'sitemap.xml',
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'favicon.svg',
    'apple-touch-icon.png',
    'safari-pinned-tab.svg',
    'site.webmanifest',
    'browserconfig.xml',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'mstile-150x150.png',
  ]) {
    writeFileSync(join(root, 'dist', f), 'fixture');
  }
  // 404.html is a real page and verify:build holds it to the same standard as
  // any other — a title and body text — so the fixture gives it both.
  writeFileSync(
    join(root, 'dist', '404.html'),
    '<!doctype html><html><head><title>Not found</title></head><body><h1>Not found</h1>' +
      `<p>${'That address does not exist here. '.repeat(8)}</p></body></html>`,
  );

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

// --- F9: a body element with no rhythm decision fails verify:build -------
//
// THE CASE THE h1 BUG NEEDED AND DID NOT HAVE. `styles/prose.css` gives every
// page body its vertical rhythm and was maintained as a hand-kept list of
// elements; `h1` was left off it, 61 titles shipped with no space beneath them,
// and no check in the suite could have noticed. These two cases are the check
// that now can — the first proves it fails on exactly that omission, the second
// proves it is not simply always red.

/** A fixture body carrying one styled element and one heading. */
const PROSE_PAGE =
  '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main>' +
  '<div class="prose"><h1>A title</h1><p>Body text. ' +
  'Enough of it that the page is not thin, repeated to clear the floor. '.repeat(8) +
  '</p></div></main></body></html>';

const PROSE_CSS_FULL = '.prose h1 { margin-block: 0 var(--s-12); }\n.prose p { margin-block: 0 var(--s-4); }\n';
const PROSE_CSS_NO_H1 = '.prose p { margin-block: 0 var(--s-4); }\n';

function proseFixture(root, css) {
  goodFixture(root);
  buildableFixture(root);
  mkdirSync(join(root, 'src/styles'), { recursive: true });
  writeFileSync(join(root, 'src/styles/prose.css'), css);
  writeFileSync(join(root, 'dist/article.html'), PROSE_PAGE);
}

check('an element with no rhythm rule and no exemption fails verify:build', (root) => {
  proseFixture(root, PROSE_CSS_NO_H1);
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /rhythm decision/.test(out) && /<h1>/.test(out);
  return {
    ok,
    detail: ok
      ? 'exit 1, the missing h1 rule named'
      : `expected exit 1 naming <h1>, got ${code}\n${out}`,
  };
});

check('the same fixture passes once the rule exists', (root) => {
  proseFixture(root, PROSE_CSS_FULL);
  const { code, out } = run(root, 'verify-build.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// A `"<unknown>"` string inside Astro's hydration runtime is not an element on
// the page. The first version of this check reported it as one.
check('markup inside a <script> is not counted as a page element', (root) => {
  proseFixture(root, PROSE_CSS_FULL);
  const withScript = PROSE_PAGE.replace(
    '</div></main>',
    '</div><script>const s = "<marquee>";</script></main>',
  );
  writeFileSync(join(root, 'dist/article.html'), withScript);
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 0 && !/marquee/.test(out);
  return { ok, detail: ok ? 'script contents ignored' : `expected exit 0 ignoring it, got ${code}\n${out}` };
});

// --- F10: a mark class with no rule fails verify:build -------------------
//
// mark.mjs builds class names by interpolation and mark.css defines them one by
// one. Raising TILTS without adding `.mark--tilt-5` renders a fifth of the cut
// words flat, and every other check stays green: the text is unchanged, the
// page is not hollow, the colours still pass. This is the case that sees it.

check('a rendered mark class with no rule fails verify:build', (root) => {
  proseFixture(root, PROSE_CSS_FULL);
  mkdirSync(join(root, 'src/styles'), { recursive: true });
  writeFileSync(join(root, 'src/styles/mark.css'), '.mark { border-radius: 0; }\n.mark--tilt-1 { transform: rotate(-2deg); }\n');
  writeFileSync(
    join(root, 'dist/article.html'),
    PROSE_PAGE.replace('</div></main>', '</div><h2 class="mark mark--cut mark--tilt-5">t</h2></main>'),
  );
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /component class rendered/.test(out) && /mark--tilt-5/.test(out);
  return {
    ok,
    detail: ok
      ? 'exit 1, the undrawn variant named'
      : `expected exit 1 naming .mark--tilt-5, got ${code}\n${out}`,
  };
});

// The same guarantee for the card, which is the third component to hold a
// class-name correspondence by hand. `.card--entry` shipped with no rule and
// this check named it on its first run.
check('a rendered card variant with no rule fails verify:build', (root) => {
  proseFixture(root, PROSE_CSS_FULL);
  mkdirSync(join(root, 'src/styles'), { recursive: true });
  writeFileSync(join(root, 'src/styles/card.css'), '.card { background: none; }\n.card--entry { display: flex; }\n');
  writeFileSync(
    join(root, 'dist/article.html'),
    PROSE_PAGE.replace('</div></main>', '</div><a class="card card--feature">f</a></main>'),
  );
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 1 && /component class rendered/.test(out) && /card--feature/.test(out);
  return { ok, detail: ok ? 'exit 1, the undrawn variant named' : `expected exit 1 naming .card--feature, got ${code}\n${out}` };
});

// A dead theme put `card`, `card__image` and `card--clickable` INSIDE page
// bodies on four migrated pages. Those names belong to the theme, not to
// patterns/card, and demanding card.css draw them is how a check starts lying.
// The first slicer counted depth from 0 and closed the body at its first nested
// </div>, so most of the body stayed in the scan and reported them anyway.
check('a dead theme class name that collides with a component prefix is not owed a rule', (root) => {
  proseFixture(root, PROSE_CSS_FULL);
  mkdirSync(join(root, 'src/styles'), { recursive: true });
  writeFileSync(join(root, 'src/styles/card.css'), '.card--entry { display: flex; }\n');
  writeFileSync(
    join(root, 'dist/article.html'),
    PROSE_PAGE.replace(
      '</p></div>',
      '</p><div><div><div class="card card--clickable"><div class="card__image">x</div></div></div></div></div>',
    ),
  );
  const { code, out } = run(root, 'verify-build.mjs');
  const ok = code === 0 && !/card--clickable/.test(out);
  return { ok, detail: ok ? 'body content ignored, nested divs and all' : `expected exit 0, got ${code}\n${out}` };
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

// A page declaring origin: "authored" is authorised by existing.
// This is the half of the two-jobs split that lets the site grow: before it,
// the frozen production manifest was also acting as the route allowlist, so
// every new page failed as an extra and publishing required relocking a
// contract that describes sites which are being switched off.
check('an authored page passes verify:routes', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'new-post.html'),
    '<!doctype html><html><head><title>new</title></head><body><p>authored</p></body></html>',
  );
  mkdirSync(join(root, 'src/content/pages/en'), { recursive: true });
  writeFileSync(
    join(root, 'src/content/pages/en/new-post.md'),
    '---\noutputPath: "new-post"\ntitle: "New"\narea: "maar"\nkind: "page"\nlang: "en"\norigin: "authored"\n---\n\nbody\n',
  );
  const { code, out } = run(root, 'verify-routes.mjs');
  // `extra of` appears only in the FAIL detail — the PASS line quotes the
  // assertion's own name, which contains "no production route asks for", so a
  // negative match on that phrase passes vacuously.
  const ok = code === 0 && !/extra of/.test(out);
  return { ok, detail: ok ? 'exit 0, authored route accepted from any directory' : `expected exit 0, got ${code}\n${out}` };
});

/**
 * The other half, and the one that matters: `origin` is the authorisation
 * boundary now that the directory is not. A record that does NOT claim to be
 * authored must not authorise its own URL — otherwise moving the rule off the
 * folder would have quietly turned the frozen policy into a suggestion.
 *
 * Same file, same place, one field different.
 */
check('a migrated-origin record does not authorise its own URL', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'new-post.html'),
    '<!doctype html><html><head><title>new</title></head><body><p>migrated</p></body></html>',
  );
  mkdirSync(join(root, 'src/content/pages/en'), { recursive: true });
  writeFileSync(
    join(root, 'src/content/pages/en/new-post.md'),
    '---\noutputPath: "new-post"\ntitle: "New"\narea: "maar"\nkind: "page"\nlang: "en"\norigin: "migrated"\n---\n\nbody\n',
  );
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code !== 0 && /extra of/.test(out);
  return { ok, detail: ok ? 'a page claiming migrated provenance is still held to the policy' : `expected failure, got ${code}\n${out}` };
});

// ...and the split must not become a hole. An emitted page with no authored
// record behind it still fails, even with the authored directory present.
check('an unbacked page still fails when an authored directory exists', (root) => {
  goodFixture(root);
  writeFileSync(
    join(root, 'dist', 'leftover.html'),
    '<!doctype html><html><head><title>leftover</title></head><body><p>orphan</p></body></html>',
  );
  mkdirSync(join(root, 'src/content/authored'), { recursive: true });
  writeFileSync(
    join(root, 'src/content/authored/other.md'),
    '---\noutputPath: "other"\ntitle: "Other"\narea: "maar"\nkind: "page"\n---\n\nbody\n',
  );
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /leftover\.html/.test(out);
  return { ok, detail: ok ? 'exit 1, unbacked page still reported' : `expected exit 1, got ${code}\n${out}` };
});

// A long extension is still an extension. `.webmanifest` is 11 characters and
// the bound was 8, so /site.webmanifest resolved as site.webmanifest.html and
// every page linking to it reported a broken link against a file in dist/.
check('a .webmanifest URL resolves to the file, not to file.html', () => {
  const got = routeToFiles('/site.webmanifest');
  const ok = got.length === 1 && got[0] === 'site.webmanifest';
  return { ok, detail: ok ? 'resolved verbatim' : `got ${JSON.stringify(got)}` };
});

// --- the feed, and the endpoints that fail silently when absent ----------
// A malformed feed is worse than no feed: a reader that hits a parse error may
// unsubscribe on its own. These pin the two things most likely to break it.
check('feed escaping does & before < — the classic double-escape bug', () => {
  const got = xmlEscape('a & b <c> "d"');
  const ok = got === 'a &amp; b &lt;c&gt; &quot;d&quot;';
  return { ok, detail: ok ? got : `got ${JSON.stringify(got)}` };
});

check('feed dates are RFC-822, which RSS requires — not ISO-8601', () => {
  const got = rfc822('2026-03-24');
  const ok = got === 'Tue, 24 Mar 2026 00:00:00 GMT';
  return { ok, detail: ok ? got : `got ${JSON.stringify(got)}` };
});

check('the feed is well-formed and drops undated items', () => {
  const item = (outputPath, date, title) => ({ data: { outputPath, date, title, lang: 'en' } });
  const xml = renderFeed({
    origin: 'https://maar.world',
    title: 'maar world',
    description: 'x & y',
    items: [item('lab/en/a', '2026-01-01', 'A <b>'), item('lab/en/undated', null, 'skip me')],
  });
  const ok =
    xml.startsWith('<?xml') &&
    (xml.match(/<item>/g) || []).length === 1 &&
    xml.includes('A &lt;b&gt;') &&
    xml.includes('x &amp; y') &&
    !xml.includes('skip me') &&
    xml.includes('rel="self"');
  return { ok, detail: ok ? 'one item, escaped, self-referential' : xml.slice(0, 300) };
});

// The endpoints check must be able to fail, or it is decoration.
check('a missing /feed.xml fails verify:routes', (root) => {
  goodFixture(root);
  rmSync(join(root, 'dist', 'feed.xml'));
  const { code, out } = run(root, 'verify-routes.mjs');
  const ok = code === 1 && /feed\.xml/.test(out) && /fail silently/.test(out);
  return { ok, detail: ok ? 'exit 1, missing endpoint named' : `expected exit 1, got ${code}\n${out}` };
});

// --- lib/html-text: the three forms, and why they must stay three --------
// These exist to stop a future tidy-up from "unifying" them. plainText's exact
// output is baked into routes/manifest.production.json as textSha256, so
// changing it invalidates a frozen contract; the other two answer different
// questions and decode differently on purpose.
check('the three text forms differ in exactly the documented ways', () => {
  const html = '<body><!-- c --><p>a&nbsp;b &amp; c &#8212; d</p><script>x()</script></body>';
  const plain = plainText(html);
  const body = bodyText(html);
  const readable = readableText(html);
  const ok =
    plain.includes('&amp;') &&        // plainText decodes nothing but &nbsp;
    plain.includes('c') &&
    !body.includes('&amp;') &&        // bodyText turns every entity into a space
    !body.includes('&') &&
    readable.includes('&') &&         // readableText decodes properly...
    readable.includes('\u2014') &&    // ...including numeric
    !plain.includes('x()') &&         // none of them keep script contents
    !body.includes('x()') &&
    !readable.includes('x()');
  return {
    ok,
    detail: ok
      ? 'plain keeps entities, body blanks them, readable decodes them'
      : `plain=${JSON.stringify(plain)} body=${JSON.stringify(body)} readable=${JSON.stringify(readable)}`,
  };
});

// The pair that has to agree: freeze-routes computes textSha256 and
// author-content-expectations recomputes it. They call one function now, but a
// case that pins the fingerprint form is what makes that a guarantee.
check('plainText is stable — the frozen manifest depends on it', () => {
  const got = plainText('<div>  the <b>maar</b>&nbsp;remembers  </div>');
  const ok = got === 'the maar remembers';
  return { ok, detail: ok ? got : `got ${JSON.stringify(got)}` };
});

check('mainOf takes the LAST closing main, not the first', () => {
  const got = mainOf('<body><main><div>a</div><section>b</section></main></body>');
  const ok = got === '<div>a</div><section>b</section>';
  return { ok, detail: ok ? 'inner content only' : `got ${JSON.stringify(got)}` };
});

// --- patterns/translations: the relation, tested directly ----------------
// These are the first cases that exercise a src/ module rather than a script.
// translations.mjs is pure, so it needs no fixture — and it is the one place
// that decides whether two pages are the same page in another language, which
// nothing in the build could answer at all before MW-11.
const T = await import('../src/lib/translations.mjs');
const rec = (outputPath, lang, translationKey) => ({ data: { outputPath, lang, translationKey } });

check('alternatesFor finds the other-language page', () => {
  const en = rec('lab/en/shared-culture', 'en', 'k');
  const es = rec('lab/es/cultura-compartida', 'es', 'k');
  const got = T.alternatesFor(en, [en, es, rec('about', 'en', undefined)]);
  const ok = got.length === 1 && got[0].data.outputPath === 'lab/es/cultura-compartida';
  return { ok, detail: ok ? 'paired across divergent slugs' : `got ${JSON.stringify(got.map((g) => g.data.outputPath))}` };
});

check('a page with no translationKey has no alternates', () => {
  const solo = rec('about', 'en', undefined);
  const got = T.alternatesFor(solo, [solo, rec('lab/es/x', 'es', 'k')]);
  return { ok: got.length === 0, detail: got.length === 0 ? 'empty, as it must be' : `got ${got.length}` };
});

// A switcher offering one choice is a label, not a control. 75 of the site's
// pages exist in one language only, so this is the common case and rendering a
// single-item switcher on all of them would claim translations that do not exist.
check('languageChoices is empty when there is nothing to switch to', () => {
  const solo = rec('about', 'en', undefined);
  const paired = rec('lab/en/a', 'en', 'k');
  const other = rec('lab/es/a', 'es', 'k');
  const none = T.languageChoices(solo, [solo]);
  const two = T.languageChoices(paired, [paired, other]);
  const ok = none.length === 0 && two.length === 2 && two[0].lang === 'en' && two[0].current === true;
  return { ok, detail: ok ? 'empty for solo, two entries in language order for a pair' : `${none.length} / ${two.length}` };
});

/**
 * The SECOND form of the relation — an authored translation naming the migrated
 * page it translates.
 *
 * It exists because `translationKey` needs the key on both halves, and outside
 * the Lab the English half is a migrated record that migrate-pages.mjs rewrites
 * on every run, so a key added there does not survive. These assert that the
 * two forms resolve to the same thing and that the edge is followed in BOTH
 * directions — an original finding its translation is the direction that
 * renders the switcher on the English page, and it is the one a
 * translation-side-only implementation silently gets wrong.
 */
const recOf = (outputPath, lang, translationOf) => ({ data: { outputPath, lang, translationOf } });

check('alternatesFor follows translationOf from the original', () => {
  const en = rec('about', 'en', undefined);
  const es = recOf('es/about', 'es', 'about');
  const got = T.alternatesFor(en, [en, es, rec('music', 'en', undefined)]);
  const ok = got.length === 1 && got[0].data.outputPath === 'es/about';
  return { ok, detail: ok ? 'the English half finds its translation' : `got ${JSON.stringify(got.map((g) => g.data.outputPath))}` };
});

check('alternatesFor follows translationOf from the translation', () => {
  const en = rec('about', 'en', undefined);
  const es = recOf('es/about', 'es', 'about');
  const got = T.alternatesFor(es, [en, es]);
  const ok = got.length === 1 && got[0].data.outputPath === 'about';
  return { ok, detail: ok ? 'the Spanish half finds its original' : `got ${JSON.stringify(got.map((g) => g.data.outputPath))}` };
});

/**
 * A dangling relation is the silent failure this whole design exists to avoid:
 * it does not error, it just makes the switcher not render, so a published
 * translation becomes unreachable from its original and looks like a page that
 * was never translated.
 */
check('validateTranslations catches a translationOf naming no page', () => {
  const problems = T.validateTranslations([rec('about', 'en', undefined), recOf('es/about', 'es', 'abuot')]);
  const ok = problems.length === 1 && /names no page/.test(problems[0]);
  return { ok, detail: ok ? 'a typo in an outputPath is caught' : `got ${JSON.stringify(problems)}` };
});

check('validateTranslations catches a page naming itself', () => {
  const problems = T.validateTranslations([recOf('es/about', 'es', 'es/about')]);
  const ok = problems.length === 1 && /names the page itself/.test(problems[0]);
  return { ok, detail: ok ? 'self-reference caught' : `got ${JSON.stringify(problems)}` };
});

check('validateTranslations passes a sound relation', () => {
  const problems = T.validateTranslations([rec('about', 'en', undefined), recOf('es/about', 'es', 'about')]);
  return { ok: problems.length === 0, detail: problems.length === 0 ? 'no false positive' : `got ${JSON.stringify(problems)}` };
});

/**
 * verify:translations resolves both forms into one list of pairs, so the
 * assertions downstream of it do not care which form a pair used. If this ever
 * returned only one form, half the site's pairs would stop being checked and
 * the suite would still be green.
 */
const VT = await import('./verify-translations.mjs');

check('pairsOf resolves both forms of the relation', () => {
  const records = [
    { outputPath: 'about', lang: 'en' },
    { outputPath: 'es/about', lang: 'es', translationOf: 'about' },
    { outputPath: 'lab/en/a', lang: 'en', translationKey: 'k' },
    { outputPath: 'lab/es/a', lang: 'es', translationKey: 'k' },
    { outputPath: 'music', lang: 'en' },
  ];
  const pairs = VT.pairsOf(records);
  const vias = pairs.map((p) => p.via).sort();
  const ok = pairs.length === 2 && vias[0] === 'translationKey' && vias[1] === 'translationOf';
  return { ok, detail: ok ? 'one pair from each form, and the untranslated page is not one' : `got ${JSON.stringify(pairs.map((p) => [p.via, p.translation.outputPath]))}` };
});

/**
 * ── Where a page is filed ────────────────────────────────────────────────────
 *
 * `spanishFiling` asserts one rule over all 157 records — a record sits at
 * `pages/<lang>/<its outputPath>` — plus the frozen-URL list that the /es/
 * prefix rule does not reach. Every list it returns is empty on the real
 * content, which is exactly the state an assertion can be in while asserting
 * nothing: the eleven records this was written for sat outside the old, narrower
 * rule for months under a green suite. So each arm is driven to FAIL here on a
 * fixture, and the no-false-positive case is asserted beside it.
 *
 * The fixtures pass their own `legacy` map rather than the real one, so these
 * stay true when a legacy page is eventually deleted.
 */
const mirrored = { file: 'src/content/pages/es/about.md', outputPath: 'es/about', lang: 'es', translationOf: 'about' };
const legacyEs = { file: 'src/content/pages/es/lab/dadada.md', outputPath: 'lab/es/dadada', lang: 'es', translationKey: '2023-12-09-dadada' };
const stub = { file: 'src/content/pages/es/esp-feedback.md', outputPath: 'esp-feedback', lang: 'es' };
const LIST = new Map([[legacyEs.outputPath, 'infix'], [stub.outputPath, 'unpaired']]);

check('spanishFiling accepts the tree as it is actually shaped', () => {
  const f = VT.spanishFiling([{ outputPath: 'about', lang: 'en', file: 'src/content/pages/en/about.md' }, mirrored, legacyEs, stub], LIST, 2);
  const ok = f.misfiled.length === 0 && f.staleExceptions.length === 0 && f.offPrefix.length === 0 && f.overgrown === 0;
  return { ok, detail: ok ? 'no false positive, including on the two frozen-URL records' : `got ${JSON.stringify(f.misfiled.concat(f.staleExceptions, f.offPrefix))}` };
});

/**
 * The filing rule reaches a record whatever its URL shape — including the ten
 * whose language sits in the MIDDLE of the URL. That is the whole reason the
 * exception list could be dropped: `/lab/es/dadada` files at `es/lab/dadada`
 * like everything else, and its URL never moves.
 */
check('the filing rule reaches a frozen infix URL like any other record', () => {
  const wrong = { ...legacyEs, file: 'src/content/pages/es/lab/es/dadada.md' };
  const bad = VT.spanishFiling([wrong], LIST, 2).misfiled;
  const good = VT.spanishFiling([legacyEs], LIST, 2).misfiled;
  const ok = bad.length === 1 && bad[0].includes('pages/es/lab/dadada') && good.length === 0;
  return { ok, detail: ok ? 'the language segment is dropped from the path, not from the URL' : `got ${JSON.stringify({ bad, good })}` };
});

check('spanishFiling catches a record filed away from its outputPath', () => {
  const loose = { file: 'src/content/pages/es/nuevo/suelto.md', outputPath: 'otro/sitio', lang: 'es' };
  const enLoose = { file: 'src/content/pages/en/wrong.md', outputPath: 'right', lang: 'en' };
  const f = VT.spanishFiling([mirrored, loose, enLoose], new Map(), 0);
  const ok = f.misfiled.length === 2 && f.misfiled.some((m) => m.includes('otro/sitio')) && f.misfiled.some((m) => m.includes('pages/en/right'));
  return { ok, detail: ok ? 'a misfiled page is reported in EITHER language, not just Spanish' : `got ${JSON.stringify(f.misfiled)}` };
});

check('spanishFiling catches a frozen URL that no longer describes its record', () => {
  const deleted = VT.spanishFiling([mirrored], LIST, 2).staleExceptions;
  const paired = VT.spanishFiling([legacyEs, { ...stub, translationKey: 'k' }], LIST, 2).staleExceptions;
  const unkeyed = VT.spanishFiling([{ ...legacyEs, translationKey: undefined }, stub], LIST, 2).staleExceptions;
  const ok = deleted.length === 2 && paired.length === 1 && paired[0].includes('now names one') && unkeyed.length === 1 && unkeyed[0].includes('no translationKey');
  return { ok, detail: ok ? 'a deleted page, a stub that acquired a pair, and a pair that lost its key' : `got ${JSON.stringify({ deleted, paired, unkeyed })}` };
});

check('spanishFiling catches the frozen URL list growing', () => {
  const f = VT.spanishFiling([legacyEs, stub], LIST, 1);
  const closed = VT.spanishFiling([legacyEs, stub], LIST, 2);
  const ok = f.overgrown === 2 && closed.overgrown === 0;
  return { ok, detail: ok ? 'grandfathering a new URL by listing it does not go unremarked' : `got ${f.overgrown} / ${closed.overgrown}` };
});

check('the prefix rule binds a new page and not a frozen one', () => {
  // Correctly filed on disk yet published off-prefix: the two rules are
  // separate, and a record can satisfy one while breaking the other.
  const offPrefix = { file: 'src/content/pages/es/lab/nuevo.md', outputPath: 'lab/es/nuevo', lang: 'es', translationOf: 'lab/nuevo' };
  const f = VT.spanishFiling([legacyEs, stub, offPrefix], LIST, 2);
  const ok = f.offPrefix.length === 1 && f.offPrefix[0].includes('lab/es/nuevo') && f.misfiled.length === 0;
  return { ok, detail: ok ? 'a new /lab/es/ URL is refused; the frozen one beside it is not, and neither is misfiled' : `got ${JSON.stringify(f.offPrefix)}` };
});

check('the real frozen list is the eleven URLs that predate the prefix rule', () => {
  const infix = [...VT.LEGACY_ES.values()].filter((s) => s === 'infix').length;
  const ok = VT.LEGACY_ES.size === 11 && infix === 10 && VT.LEGACY_ES.get('esp-feedback') === 'unpaired' && VT.LEGACY_ES_CLOSED_AT === 11;
  return { ok, detail: ok ? '10 infix + 1 unpaired, closed at 11' : `got ${VT.LEGACY_ES.size} entries, ${infix} infix, closed at ${VT.LEGACY_ES_CLOSED_AT}` };
});

// --- patterns/mark: the stamp only stamps an edition number --------------
// The stamp reads its text out of `card_title` rather than out of a new field,
// so the only thing that can go wrong is it reading a numeral where there is
// none. Both cases below are real titles from src/content/cards.
const M = await import('../src/lib/mark.mjs');

check('the stamp takes the edition numeral out of a card title', () => {
  const got = [M.stampText('Card IV'), M.stampText('Card I'), M.stampText('Card XI')];
  const ok = got.join(',') === 'iv,i,xi';
  return { ok, detail: ok ? 'Card IV / I / XI -> iv / i / xi' : `got ${JSON.stringify(got)}` };
});

// `WildCard` ends in a `d` and `SkySounds` in an `s`; a loose "run of roman
// letters" test stamps the tail of both. A card with no numeral gets no stamp.
check('the stamp refuses a title that carries no edition number', () => {
  const got = [M.stampText('WildCard'), M.stampText('SkySounds 3'), M.stampText(''), M.stampText(undefined)];
  const ok = got.every((g) => g === null);
  return { ok, detail: ok ? 'WildCard, SkySounds 3, empty and undefined all unstamped' : `got ${JSON.stringify(got)}` };
});

// --- ui/carousel: the transform that rebuilds the dead swiper ------------
// Both cases below are bugs this transform actually had. A non-greedy regex
// stopped at the first </div></div> — the caption's — and converted 2 of 6
// carousels; and an exact-attribute matcher missed the 9 slides written
// `class="swiper__slide orb-slide"`. Both produced valid HTML and reported
// success, which is why they need cases rather than a comment.
const C = await import('../scripts/lib/carousel.mjs');

const SWIPER = (slideClass = 'swiper__slide') =>
  '<div class="swiper__wrapper">' +
  `<div class="${slideClass}"><img src="/a.jpg" alt="A"><div class="slide-caption">First</div></div>` +
  `<div class="${slideClass}"><img src="/b.jpg" alt="B"></div>` +
  '</div>';

check('every slide survives the swiper-to-carousel rebuild', () => {
  const out = C.swiperToCarousel(SWIPER(), { idPrefix: 't' });
  const slides = (out.match(/class="carousel__slide"/g) || []).length;
  const imgs = (out.match(/<img/g) || []).length;
  const ok = slides === 2 && imgs === 2 && !/swiper__slide/.test(out);
  return { ok, detail: ok ? '2 slides, 2 images, nothing left stacked' : `${slides} slides / ${imgs} imgs\n${out}` };
});

check('a slide with an extra class is still a slide', () => {
  const out = C.swiperToCarousel(SWIPER('swiper__slide orb-slide'), { idPrefix: 't' });
  const slides = (out.match(/class="carousel__slide"/g) || []).length;
  return { ok: slides === 2, detail: slides === 2 ? 'class matched as a token, not a string' : `${slides} of 2 converted` };
});

check('the carousel carries the accessibility contract the spec states', () => {
  const out = C.swiperToCarousel(SWIPER(), { idPrefix: 't' });
  const has = [
    /aria-roledescription="carousel"/.test(out),
    /<ul class="carousel__track"[^>]*role="list"/.test(out),
    /<li class="carousel__slide"/.test(out),
    /aria-label="2 photographs"/.test(out),
    /tabindex="0"/.test(out),
    !/autoplay|setInterval|<script/.test(out),
    // The numbered controls were the owner's "numbers everywhere". They must
    // not come back: the count belongs in the accessible name, not on the page.
    !/carousel__control/.test(out),
  ];
  const ok = has.every(Boolean);
  return { ok, detail: ok ? 'labelled group, list items, focusable track, no controls, no auto-advance' : `checks: ${has.join(',')}` };
});

check('legacy carousel copy becomes a caption below the media', () => {
  const legacy =
    '<div class="swiper__wrapper">' +
    '<div class="swiper__slide"><img src="/a.jpg" alt="A"><div class="text-content"><h2>I</h2><p>Caption copy</p></div></div>' +
    '<div class="swiper__slide orb-slide"><h2 class="orb-step">II</h2><div class="orb-media"><img src="/b.jpg" alt="B"></div><div class="orb-desc"><p>Orbiter copy</p></div></div>' +
    '</div>';
  const out = C.swiperToCarousel(legacy, { idPrefix: 't' });
  const frames = [...out.matchAll(/<div class="carousel__frame">([\s\S]*?)<\/div><figcaption class="carousel__caption">([\s\S]*?)<\/figcaption>/g)];
  const ok =
    frames.length === 2 &&
    !/text-content|orb-desc|orb-step/.test(frames.map(([, frame]) => frame).join('')) &&
    /Caption copy/.test(frames[0][2]) &&
    /carousel__caption-step">II/.test(frames[1][2]) &&
    /Orbiter copy/.test(frames[1][2]);
  return { ok, detail: ok ? 'text-content and orbiter copy become figure captions' : out };
});

check('an empty swiper wrapper is left exactly as it was', () => {
  const empty = '<div class="swiper__wrapper"></div>';
  const out = C.swiperToCarousel(empty, { idPrefix: 't' });
  return { ok: out === empty, detail: out === empty ? 'a carousel of nothing is not a carousel' : out };
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

// --- F8: verify:content could not fail ----------------------------------
//
// scripts/author-content-expectations.mjs used to filter every candidate
// heading through the build — `if (builtText.includes(h)) headings.push(h)` —
// so a heading the migration lost was simply left out of the expectation file.
// 55 of 95 pages ended up asserting zero headings, `images`, `embeds` and
// `links` were written on no page at all, and `minTextLength` was 90% of the
// *build*, a floor under the migrated page rather than the production one.
// verify:content reported PASS on a build that had lost 82% of /lab's body.
//
// These cases build an expectation file the way the fixed script does — from a
// production fingerprint — and then break the build one way at a time.

/** Production's fingerprint of the one fixture page, chrome already excluded. */
const CONTENT_PROD = {
  headings: ['Orbits and Bodies', 'Interplanetary ancestors 1-3 (EN)'],
  bodyTextLength: 400,
  images: 2,
  embeds: 1,
  links: ['https://support.apple.com/en-gb/HT208353'],
};

const CONTENT_FRACTION = 0.85;

/**
 * A page that satisfies CONTENT_PROD. Every argument defaults to the intact
 * value, so each case names exactly the one thing it breaks.
 */
function contentPage({
  headings = CONTENT_PROD.headings,
  body = 'Body text for the content fixture. '.repeat(12),
  images = CONTENT_PROD.images,
  embeds = CONTENT_PROD.embeds,
  links = CONTENT_PROD.links,
} = {}) {
  return (
    '<!doctype html><html><head><title>Orbits</title></head><body>' +
    headings.map((h) => `<h2>${h}</h2>`).join('') +
    '<img src="/a.png">'.repeat(images) +
    '<iframe src="https://play.maar.world/?g=1"></iframe>'.repeat(embeds) +
    links.map((l) => `<a href="${l}">note</a>`).join('') +
    `<p>${body}</p></body></html>`
  );
}

/**
 * Write the fixture's expectations exactly as the authoring script writes them:
 * from the production figures above, never from the page on disk.
 */
function contentFixture(root, overrides = {}) {
  mkdirSync(join(root, 'verify'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/orbits.html'), contentPage(overrides.page || {}));

  const page = {
    url: '/orbits',
    production: {
      origin: 'maar.world',
      url: '/orbits',
      baseline: 'legacy-site-exact',
      textLength: 900,
      textSha256: 'deadbeefdeadbeef',
      bodyTextLength: CONTENT_PROD.bodyTextLength,
      headings: 3,
      bodyHeadings: CONTENT_PROD.headings.length,
      imageCount: 2,
      iframeCount: 1,
      outboundLinks: 1,
    },
    excludedRegions: ['site-header', 'site-footer'],
    excludedPerPage: [],
    headings: CONTENT_PROD.headings,
    minTextLength: Math.floor(CONTENT_PROD.bodyTextLength * CONTENT_FRACTION),
    images: CONTENT_PROD.images,
    embeds: CONTENT_PROD.embeds,
    links: CONTENT_PROD.links,
    ...(overrides.page_ || {}),
  };

  writeJson(join(root, 'verify/content-expectations.json'), {
    derivedFrom: 'routes/manifest.production.json',
    textFraction: CONTENT_FRACTION,
    pageCount: 1,
    pages: [page],
    ...(overrides.file || {}),
  });
}

// 46. The intact fixture passes, so a failure below means the break was caught.
check('an intact page passes verify:content', (root) => {
  contentFixture(root);
  const { code, out } = run(root, 'verify-content.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

// 47. A page that lost one of production's headings.
check('a page missing a production heading fails verify:content', (root) => {
  contentFixture(root, { page: { headings: [CONTENT_PROD.headings[0]] } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /missing heading "Interplanetary ancestors 1-3 \(EN\)"/.test(out);
  return { ok, detail: ok ? 'exit 1, lost heading named' : `expected exit 1, got ${code}\n${out}` };
});

// 48. A page that renders fewer images than production. This is the loss that
//     /collect/documentation.html shipped with every heading assertion passing.
check('a page with fewer images than production fails verify:content', (root) => {
  contentFixture(root, { page: { images: 1 } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /1 images, expected at least 2/.test(out);
  return { ok, detail: ok ? 'exit 1, image shortfall reported' : `expected exit 1, got ${code}\n${out}` };
});

check('a page with additional first-party images passes verify:content', (root) => {
  contentFixture(root, { page: { images: 3 } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 0;
  return { ok, detail: ok ? 'production image count is a floor, not a maximum' : `expected exit 0, got ${code}\n${out}` };
});

// 49. A page whose body collapsed but whose headings all survived — /lab kept
//     its title and lost 82% of what was under it.
check('a page whose body text collapsed fails verify:content', (root) => {
  contentFixture(root, { page: { body: 'One line survived.' } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /chars < expected 340/.test(out);
  return { ok, detail: ok ? 'exit 1, text floor breached' : `expected exit 1, got ${code}\n${out}` };
});

// 50. A page that dropped an external link production served.
check('a page missing a production link fails verify:content', (root) => {
  contentFixture(root, { page: { links: [] } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /missing link https:\/\/support\.apple\.com/.test(out);
  return { ok, detail: ok ? 'exit 1, lost link named' : `expected exit 1, got ${code}\n${out}` };
});

// 51. A page that dropped production's embed.
check('a page missing a production embed fails verify:content', (root) => {
  contentFixture(root, { page: { embeds: 0 } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /0 embeds, expected at least 1/.test(out);
  return { ok, detail: ok ? 'exit 1, embed shortfall reported' : `expected exit 1, got ${code}\n${out}` };
});

// 51b. The other half of making the embed count a floor, and the reason it is
//      one: the owner added three videos in MW-9 content/videos-added and all
//      three were reported as content loss on pages that had gained content.
//      Paired with 51 so the loosening cannot quietly become "embeds unchecked".
check('a page with an additional embed passes verify:content', (root) => {
  contentFixture(root, { page: { embeds: 3 } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 0;
  return { ok, detail: ok ? 'production embed count is a floor, not a maximum' : `expected exit 0, got ${code}\n${out}` };
});

/**
 * 51c/51d. THE ENTITY-ENCODING PAIR.
 *
 * Production's Jekyll HTML carries a bare `&` inside a heading; Astro escapes
 * the same string to `&amp;`, as it must. `plainText` decodes neither, so 33
 * NFC card pages reported a heading missing from a page that renders it. The
 * comparison is entity-insensitive now — and 51d is the half that matters,
 * because a decode applied to both sides must not be able to conjure a heading
 * the build does not have.
 */
check('an entity-escaped heading still satisfies verify:content', (root) => {
  contentFixture(root, {
    page: { headings: ['Orbits and Bodies', 'soundscapes &amp; music'] },
    page_: { headings: ['Orbits and Bodies', 'soundscapes & music'] },
  });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 0;
  return { ok, detail: ok ? '&amp; and & compare as one heading' : `expected exit 0, got ${code}\n${out}` };
});

check('a genuinely different heading still fails verify:content', (root) => {
  contentFixture(root, {
    page: { headings: ['Orbits and Bodies', 'soundscapes and music'] },
    page_: { headings: ['Orbits and Bodies', 'soundscapes & music'] },
  });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /missing heading "soundscapes & music"/.test(out);
  return { ok, detail: ok ? 'exit 1, decoding conjures nothing' : `expected exit 1, got ${code}\n${out}` };
});

// 52. The defect itself: an expectation file whose heading list was filtered
//     down to what the build already had. The build satisfies every assertion
//     that is written, which is exactly why the old file passed.
check('an expectation file with filtered-out headings fails verify:content', (root) => {
  contentFixture(root, {
    page: { headings: [CONTENT_PROD.headings[0]] },
    page_: { headings: [CONTENT_PROD.headings[0]] },
  });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /every production body heading is asserted/.test(out) && /asserts 1 of 2/.test(out);
  return { ok, detail: ok ? 'exit 1, hollowed expectation caught' : `expected exit 1, got ${code}\n${out}` };
});

// 53. The other half of the defect: minTextLength taken from the build instead
//     of from production. It looked like a regression floor and was one only
//     under whatever the migration happened to emit.
check('a minTextLength taken from the build fails verify:content', (root) => {
  contentFixture(root, {
    page: { body: 'Short.' },
    page_: { minTextLength: 40 },
  });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /minTextLength is a fraction of production body text/.test(out);
  return { ok, detail: ok ? 'exit 1, build-derived floor caught' : `expected exit 1, got ${code}\n${out}` };
});

// 54. An expectation file that does not say it came from production.
check('expectations not derived from production fail verify:content', (root) => {
  contentFixture(root, { file: { derivedFrom: 'dist/' } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /expectations derive from production/.test(out);
  return { ok, detail: ok ? 'exit 1, provenance rejected' : `expected exit 1, got ${code}\n${out}` };
});

// 55. A page with no production baseline asserts nothing, so it must not pass
//     quietly — that is how 55 pages asserted zero headings and read as green.
check('a page with no production baseline fails verify:content', (root) => {
  contentFixture(root, { page_: { production: null } });
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /every page has a production baseline/.test(out);
  return { ok, detail: ok ? 'exit 1, baseline-less page caught' : `expected exit 1, got ${code}\n${out}` };
});

// 56. The site shell must not pay for the page. Production's side of every
//     assertion has its header, nav and footer removed by name, so the build's
//     side is measured inside <main>. Without that, the shell's brand, area nav
//     and footer add text and links to all 133 pages, lifting a collapsed body
//     back over its floor — the check would go green as the shell landed.
check('shell chrome outside <main> does not satisfy verify:content', (root) => {
  contentFixture(root);
  const shell =
    '<!doctype html><html><body><header><a href="/">Maar World</a>' +
    `<nav>${'Areas maar collect tree. '.repeat(30)}</nav></header>` +
    '<main>' +
    CONTENT_PROD.headings.map((h) => `<h2>${h}</h2>`).join('') +
    '<img src="/a.png">'.repeat(CONTENT_PROD.images) +
    '<iframe src="https://play.maar.world/?g=1"></iframe>' +
    '<p>One line survived.</p></main>' +
    `<footer><a href="${CONTENT_PROD.links[0]}">note</a>` +
    `${'Footer text. '.repeat(30)}</footer></body></html>`;
  writeFileSync(join(root, 'dist/orbits.html'), shell);
  const { code, out } = run(root, 'verify-content.mjs');
  const ok = code === 1 && /chars < expected 340/.test(out) && /missing link/.test(out);
  return {
    ok,
    detail: ok
      ? 'exit 1, shell text and shell link did not count'
      : `expected exit 1 naming both, got ${code}\n${out}`,
  };
});

// --- G: verify:a11y really fails on an inaccessible build ----------------

/**
 * A small, accessible page and the stylesheet that ships with it.
 *
 * Every case below starts from this and breaks exactly one thing, so a case
 * that goes green tells you which assertion stopped working. The tokens are the
 * real ones from src/styles/tokens.css: a fixture with invented colours would
 * prove the contrast arithmetic runs but not that the design passes it.
 *
 * The page also carries the three shapes that are correct but look wrong to a
 * naive check — a wrapping `<label>` with no `for`, an `aria-hidden` region
 * that is also `display:none`, and a decorative `<img alt="">` — so a case
 * would fail if any of those started being reported.
 */
const A11Y_CSS = [
  ':root{--c-maar: #a9d5e8;--c-collect: #f0aecb;--c-tree: #e7c98f;--c-dark: #100f14;',
  // --sf-paper is here because a cut word's field is paper on BOTH surfaces —
  // it is the one token the contrast table asks for that is not swapped by
  // [data-surface='paper'], and the fixture has to carry it for the same reason
  // it carries the others: these are the real values from tokens.css.
  '--pigment-ink: var(--c-dark);--sf-base: #100f14;--ink: #efe7da;--sf-paper: #efe7da;',
  '--ink-muted: color-mix(in srgb, var(--ink) 75%, transparent);',
  '--ink-meta: color-mix(in srgb, var(--ink) 60%, transparent);',
  '--ink-faint: color-mix(in srgb, var(--ink) 40%, transparent);',
  // The stamp's border. Here for the same reason as --sf-paper: the contrast
  // table asks for it, so the fixture carries the real value from tokens.css.
  '--mark-stamp-rule: var(--c-tree);',
  '--action-invert: var(--ink);--focus-c: var(--c-maar)}',
  ':focus-visible{outline:2px solid var(--focus-c)}',
  '@media (prefers-reduced-motion: reduce){*{transition-duration:.01ms !important}}',
  'body{overflow-wrap:break-word}',
  'pre,table{overflow-x:auto}',
].join('');

const A11Y_PAGE = [
  '<!doctype html><html lang="en" data-surface="dark"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title>',
  '<link rel="stylesheet" href="/_assets/site.css"></head><body><div class="shell">',
  '<a class="skip-link" href="#content">Skip to content</a>',
  '<header><nav aria-label="Areas"><ul><li><a href="/">maar</a></li></ul></nav>',
  '<nav aria-label="maar pages"><ul><li><a href="/lab">Lab</a></li></ul></nav></header>',
  '<main id="content"><h1>Fixture</h1><h2>Section</h2><h3>Sub</h3>',
  '<img src="/img/decorative.png" alt="">',
  '<iframe src="https://play.maar.world/?g=8&amp;s=0&amp;c=1" title="fixture player"></iframe>',
  '<p><a href="/elsewhere">a named link</a></p>',
  '<form action="/f" method="post"><label>Your name <input type="text" name="name"></label>',
  '<button type="submit">Send</button></form>',
  '<div class="pdf-fallback" aria-hidden="true" style="display:none;"><a href="/x.pdf">Open</a></div>',
  '<table><tr><th>Column</th></tr><tr><td>Cell</td></tr></table>',
  '</main><footer><p>© Maar World 2023</p></footer></div></body></html>',
].join('');

function a11yFixture(root, page = A11Y_PAGE, css = A11Y_CSS) {
  mkdirSync(join(root, 'dist/_assets'), { recursive: true });
  writeFileSync(join(root, 'dist/_assets/site.css'), css);
  writeFileSync(join(root, 'dist/fixture.html'), page);
}

/** Break one thing in the fixture and assert verify:a11y names it. */
function a11yCase(name, { page = A11Y_PAGE, css = A11Y_CSS, expect }) {
  check(name, (root) => {
    a11yFixture(root, page, css);
    const { code, out } = run(root, 'verify-a11y.mjs');
    const ok = code === 1 && expect.test(out);
    return { ok, detail: ok ? 'exit 1, defect reported' : `expected exit 1 matching ${expect}, got ${code}\n${out}` };
  });
}

check('an accessible page passes verify:a11y', (root) => {
  a11yFixture(root);
  const { code, out } = run(root, 'verify-a11y.mjs');
  return { ok: code === 0, detail: code === 0 ? 'exit 0' : `expected exit 0, got ${code}\n${out}` };
});

a11yCase('an undeclared language fails verify:a11y', {
  page: A11Y_PAGE.replace('<html lang="en"', '<html'),
  expect: /declares its own language/,
});

a11yCase('a viewport that blocks zoom fails verify:a11y', {
  page: A11Y_PAGE.replace('initial-scale=1', 'initial-scale=1, user-scalable=no'),
  expect: /zoomable/,
});

a11yCase('a second <h1> fails verify:a11y', {
  page: A11Y_PAGE.replace('<h2>Section</h2>', '<h1>Second</h1>'),
  expect: /exactly one <h1>/,
});

a11yCase('a page with no <h1> fails verify:a11y', {
  page: A11Y_PAGE.replace('<h1>Fixture</h1>', ''),
  expect: /exactly one <h1>/,
});

a11yCase('a skipped heading level fails verify:a11y', {
  page: A11Y_PAGE.replace('<h3>Sub</h3>', '<h4>Sub</h4>'),
  expect: /skips a heading level/,
});

a11yCase('an image without alt fails verify:a11y', {
  page: A11Y_PAGE.replace('<img src="/img/decorative.png" alt="">', '<img src="/img/decorative.png">'),
  expect: /alt attribute/,
});

a11yCase('an untitled frame fails verify:a11y', {
  page: A11Y_PAGE.replace(' title="fixture player"', ''),
  expect: /carries a title/,
});

a11yCase('a link with no accessible name fails verify:a11y', {
  page: A11Y_PAGE.replace('<a href="/elsewhere">a named link</a>', '<a href="/elsewhere"></a>'),
  expect: /accessible name/,
});

/**
 * The legacy Mailchimp badge is this exact shape: an anchor with nothing in it
 * and a `title`. It computes a name, so a check that only asked "is it named"
 * passed it, and the link is still invisible and unreachable by touch.
 */
a11yCase('an empty link named only by title fails verify:a11y', {
  page: A11Y_PAGE.replace('<a href="/elsewhere">a named link</a>', '<a href="/elsewhere" title="Mailchimp"></a>'),
  expect: /empty target/,
});

a11yCase('an unlabelled form control fails verify:a11y', {
  page: A11Y_PAGE.replace('<label>Your name <input type="text" name="name"></label>', '<input type="text" name="name">'),
  expect: /has a label/,
});

/**
 * `aria-hidden` alone leaves the element in the tab order — hidden from a
 * screen reader and still reachable by keyboard, which is worse than either.
 * The fixture's own `display:none` version must keep passing (case 1).
 */
a11yCase('an aria-hidden link that keeps its tab stop fails verify:a11y', {
  page: A11Y_PAGE.replace('style="display:none;"', ''),
  expect: /keeps a tab stop/,
});

a11yCase('a positive tabindex fails verify:a11y', {
  page: A11Y_PAGE.replace('<a href="/elsewhere">', '<a href="/elsewhere" tabindex="3">'),
  expect: /positive tabindex/,
});

a11yCase('a duplicated id fails verify:a11y', {
  page: A11Y_PAGE.replace('<h2>Section</h2>', '<h2 id="content">Section</h2>'),
  expect: /unique within a page/,
});

a11yCase('a fragment link to nothing fails verify:a11y', {
  page: A11Y_PAGE.replace('href="#content"', 'href="#nowhere"'),
  expect: /points at an element that exists/,
});

a11yCase('a missing <main> landmark fails verify:a11y', {
  page: A11Y_PAGE.replace('<main id="content">', '<div id="content">').replace('</main>', '</div>'),
  expect: /landmarks/,
});

a11yCase('an unnamed navigation landmark fails verify:a11y', {
  page: A11Y_PAGE.replace('<nav aria-label="maar pages">', '<nav>'),
  expect: /navigation landmark is named/,
});

a11yCase('an inline click handler fails verify:a11y', {
  page: A11Y_PAGE.replace('<p><a href="/elsewhere">', '<p><span onclick="go()">go</span><a href="/elsewhere">'),
  expect: /inline event handler/,
});

a11yCase('a table with no header cells fails verify:a11y', {
  page: A11Y_PAGE.replace('<th>Column</th>', '<td>Column</td>'),
  expect: /header cells/,
});

a11yCase('removing the focus outline fails verify:a11y', {
  css: `${A11Y_CSS}\na:focus-visible{outline:none}`,
  expect: /focus ring is never removed/,
});

a11yCase('shipping no reduced-motion block fails verify:a11y', {
  css: A11Y_CSS.replace('@media (prefers-reduced-motion: reduce){*{transition-duration:.01ms !important}}', ''),
  expect: /prefers-reduced-motion/,
});

a11yCase('dropping overflow-wrap fails verify:a11y', {
  css: A11Y_CSS.replace('body{overflow-wrap:break-word}', ''),
  expect: /allowed to wrap/,
});

a11yCase('losing the scroll container for wide content fails verify:a11y', {
  css: A11Y_CSS.replace('pre,table{overflow-x:auto}', ''),
  expect: /scrolls inside itself/,
});

/**
 * The contrast arithmetic, proven against a token change rather than against a
 * hand-written ratio. Darkening `--ink` to a mid grey takes body text under
 * 4.5:1 on the dark surface; nothing else in the fixture moves.
 */
a11yCase('a token change that breaks contrast fails verify:a11y', {
  css: A11Y_CSS.replace('--ink: #efe7da;', '--ink: #4a4750;'),
  expect: /WCAG 2\.2 AA contrast/,
});

// --- F7: the documented source of truth is the strongest command ---------

// OPERATING-RULES designates `npm run verify` as the command whose exit code
// decides whether work is done, but it omitted verify:selftest, verify:schemas
// and ledger:check — all of which CI ran. An agent could satisfy the documented
// source of truth and still be red on push. This asserts the containment holds,
// against the workflow file itself rather than against a copy of its contents.
check('npm run verify runs everything CI runs', () => {
  const workflow = readFileSync(resolve(SCRIPTS, '..', '.github/workflows/verify.yml'), 'utf8');
  const ciCommands = [...workflow.matchAll(/npm run ([a-z0-9:-]+)/g)].map((m) => m[1]);
  const composed = new Set([...CHECK_NAMES, 'verify']);
  const missing = [...new Set(ciCommands)].filter((cmd) => !composed.has(cmd));
  const ok = ciCommands.length > 0 && missing.length === 0;
  return {
    ok,
    detail: ok
      ? `${new Set(ciCommands).size} CI commands, all composed into npm run verify`
      : `not run by npm run verify: ${missing.join(', ')}`,
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
