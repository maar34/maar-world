#!/usr/bin/env node
/**
 * verify:translations — the relation between a page and its other-language half.
 *
 * The site publishes in English and Spanish. `src/lib/translations.mjs` carries
 * the relation and the layout renders the switcher and the `hreflang` set from
 * it; what nothing checked until now is whether the relation is TRUE.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 *
 * The MW-11 ledger entry `arch/i18n-as-a-relation` records the defect this is
 * the continuation of: `lang` used to be defaulted to `'en'` by BaseLayout, so
 * verify:a11y's "every page declares its own language" assertion could never
 * fail — the layout guaranteed the attribute existed, so the check asserted the
 * layout and not the content, and `/esp-feedback`, a Spanish page, shipped
 * announcing itself as English through a green check.
 *
 * Requiring `lang` in the schema fixed the missing half. This is the other one:
 * a page can now declare `lang: "es"`, carry a `translationOf`, render a
 * switcher and a full `hreflang` set — and still be the English text. Every
 * signal a machine reads says "Spanish"; the words say otherwise. A reader
 * following the switcher lands where they started.
 *
 * That is the specific hazard of the workflow the owner chose: drafts are
 * written here and edited by the owner afterwards, so a page can be published
 * before its prose has been touched. A scaffold that still holds its source
 * text is the thing most likely to slip through, and it is invisible to every
 * other check in the suite.
 *
 * ── What it does NOT claim ────────────────────────────────────────────────────
 *
 * This is not language detection and does not pretend to be. It asserts that a
 * translation is not a COPY of its original — which is checkable exactly, with
 * no dependency and no false positives — and says nothing about whether the
 * Spanish is good, or idiomatic, or the owner's voice. Those need a reader.
 * The check is named for what it proves.
 *
 * ── Where a Spanish page lives ────────────────────────────────────────────────
 *
 * Two rules, both asserted below, and they are not the same rule:
 *
 *   ON DISK   a record sits at `pages/<lang>/<its outputPath>`. ALL 157, both
 *             languages, NO exceptions. This used to be narrower and carried a
 *             list of eleven exemptions; the content tree was reorganised by
 *             language so that one rule reaches everything instead.
 *             See .agents/decisions/0004-content-tree-by-language.md.
 *
 *   AS A URL  a Spanish page is published at `/es/<path>`. This binds NEW
 *             records only, and the eleven URLs in `LEGACY_ES` are frozen in
 *             the route contract — a rule that bound them could only be
 *             satisfied by breaking an invariant.
 *
 * So `LEGACY_ES` is now a list of frozen URLs and nothing else. Where those
 * eleven pages SIT stopped being special; where they are PUBLISHED still is.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { plainText, mainOf } from './lib/html-text.mjs';
import { ROOT, has, ARTIFACTS, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const PAGE_DIRS = [join(ROOT, 'src/content/pages')];

/**
 * Frontmatter by regex rather than by a YAML parser, for the same reason
 * `authoredRoutes()` in verify-routes.mjs does it: this check must not depend
 * on a YAML library, and it must keep working when Astro cannot build — which
 * is exactly the state a broken record puts the repo in.
 */
const field = (text, key) =>
  (new RegExp(`^${key}:\\s*"(.*)"\\s*$`, 'm').exec(text) || [])[1];

function walkRecords(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walkRecords(abs));
    else if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(abs);
  }
  return out;
}

/** Every page record, with the four fields this check reads. */
export function loadPageRecords(dirs = PAGE_DIRS) {
  const out = [];
  for (const abs of dirs.flatMap(walkRecords)) {
    const text = readFileSync(abs, 'utf8');
    const outputPath = field(text, 'outputPath');
    if (!outputPath) continue;
    out.push({
      file: abs.slice(ROOT.length + 1),
      outputPath,
      lang: field(text, 'lang'),
      translationOf: field(text, 'translationOf'),
      translationKey: field(text, 'translationKey'),
    });
  }
  return out;
}

/** dist-relative outputPath → the URL a browser asks for. */
const urlOf = (outputPath) =>
  `/${outputPath.replace(/(^|\/)index$/, '')}`.replace(/\/(?=$)/, '') || '/';

/**
 * `~20` is the migration's own encoding for a space in a FILENAME — several
 * Collect cards carry one, and one of them ends in it. The matching
 * `outputPath` holds a literal space, so decoding the file path is what makes
 * the two comparable; the outputPath side needs nothing done to it.
 */
const decode = (p) => p.replace(/~20/g, ' ');

/** Where a record actually sits: path under src/content/pages/, no extension. */
export const filedAt = (r) =>
  decode(r.file.replace(/^src\/content\/pages\//, '').replace(/\.mdx?$/, ''));

/**
 * Where a record MUST sit: `<lang>/` + its own outputPath, with the language
 * segment taken out of the middle.
 *
 * That last part is what makes the tree uniform rather than nearly uniform. Ten
 * Lab pages publish `/lab/es/dadada` — language in the MIDDLE of the URL, a
 * shape frozen in the route contract and unchangeable. Dropping the segment
 * files them beside every other Spanish page at `es/lab/dadada` while their URL
 * stays exactly where production put it. The URL keeps its history; the tree
 * does not have to inherit it.
 */
export const expectedAt = (r) =>
  `${r.lang}/${r.outputPath.split('/').filter((s) => s !== 'en' && s !== 'es').join('/')}`;

/**
 * Is this record where its own outputPath says it belongs?
 *
 * One definition, used by every assertion below, so they cannot disagree about
 * what "correctly filed" means. It applies to all 157 records in both
 * languages — not only to translations — which is the difference between a tree
 * you can navigate and one you have to be told about.
 */
export const isWellFiled = (r) => filedAt(r) === expectedAt(r);

/**
 * ── THE FROZEN OFF-PREFIX SPANISH URLS ────────────────────────────────────────
 *
 * Eleven Spanish pages do not publish under `/es/`, and never will.
 *
 * NOTE WHAT THIS LIST IS NOT, ANY MORE. It used to be a list of filing
 * exceptions — eleven records that sat outside the one rule about where a
 * Spanish page lives. After the content tree was reorganised by language
 * (.agents/decisions/0004-content-tree-by-language.md) there are no filing
 * exceptions left: all 157 records, these eleven included, sit at
 * `pages/<lang>/<outputPath>` and `isWellFiled` holds for every one of them.
 * What survives is purely a URL fact, which is the part that was never ours to
 * change.
 *
 * Their URLs are in `routes/manifest.production.json` and under the contract
 * lock: `/lab/es/dadada` cannot become `/es/lab/dadada`. Moving one is a
 * contract change, not a tidy-up — see AGENTS.md, "Never modify the frozen
 * route manifest". Ten carry the language in the middle of the path, the shape
 * the legacy site served; `/esp-feedback` carries no language marker at all.
 *
 * Two shapes, and the difference still matters:
 *
 *   'infix'    — publishes `/<area>/es/<slug>`. PAIRED, via `translationKey`.
 *                All ten are in `pairsOf` and are held to every assertion here,
 *                including the copy check.
 *
 *   'unpaired' — has no other-language half and is not supposed to acquire one.
 *                `/esp-feedback` is a retired redirect stub to `/bookings` (the
 *                NOINDEX block in astro.config.mjs). Listing it is what makes
 *                its missing pair a stated fact instead of an unnoticed one.
 *                Do not invent a counterpart for it.
 *
 * Keyed by `outputPath` and not by file path, now that the file path is derived
 * from the outputPath and carries no independent information.
 *
 * THIS LIST IS CLOSED. It may shrink — deleting a legacy page is ordinary work,
 * and the assertion below then requires the line to go with it. It must never
 * grow: a new Spanish page publishes under `/es/`, and adding a line here to
 * turn a check green is precisely the bypass these checks exist to catch.
 * `LEGACY_ES_CLOSED_AT` holds the count against exactly that.
 */
export const LEGACY_ES = new Map([
  ['lab/es/cultura-compartida', 'infix'],
  ['lab/es/dadada', 'infix'],
  ['lab/es/helix-eac-montevideo-2025', 'infix'],
  ['lab/es/ip-1', 'infix'],
  ['lab/es/ip-2', 'infix'],
  ['lab/es/ip-3', 'infix'],
  ['lab/es/ip-orchestra-design', 'infix'],
  ['lab/es/ip-orchestra', 'infix'],
  ['lab/es/musica-retorno-al-juego', 'infix'],
  ['lab/es/orbits-and-bodies', 'infix'],
  ['esp-feedback', 'unpaired'],
]);

/** The size `LEGACY_ES` may not exceed. See the note above: it may only shrink. */
export const LEGACY_ES_CLOSED_AT = 11;

/**
 * Where every record sits, and whether it is allowed to sit there.
 *
 * Pure, and separated from the reporting for the reason `pairsOf` is: an
 * assertion nobody can run on a fixture is an assertion nobody has watched fail.
 * These lists are exercised directly in scripts/selftest.mjs, in both
 * directions, so the checks below are known to be falsifiable and not merely
 * green. The parameters exist for those fixtures — production passes neither.
 */
export function spanishFiling(records, legacy = LEGACY_ES, closedAt = LEGACY_ES_CLOSED_AT) {
  const byPath = new Map(records.map((r) => [r.outputPath, r]));
  const es = records.filter((r) => r.lang === 'es');
  const listed = es.filter((r) => legacy.has(r.outputPath));

  // ONE RULE, ALL 157 RECORDS, BOTH LANGUAGES: a record sits at
  // pages/<lang>/<its outputPath>. No exception list, because after the tree
  // was reorganised by language there is nothing left to except.
  const misfiled = records
    .filter((r) => !isWellFiled(r))
    .map((r) => `${r.file} — should be src/content/pages/${expectedAt(r)}`);

  // A named URL exception must still describe a real record, in the recorded
  // shape. The 'unpaired' arm is the one carrying meaning rather than hygiene:
  // it asserts /esp-feedback still has no other-language half, so that absence
  // is a claim the suite makes rather than a thing nobody looked at.
  const staleExceptions = [];
  for (const [outputPath, shape] of legacy) {
    const r = byPath.get(outputPath);
    if (!r) {
      staleExceptions.push(`/${outputPath} is listed but is no longer a page record — remove the line`);
    } else if (r.lang !== 'es') {
      staleExceptions.push(`/${outputPath} is listed as Spanish but declares lang "${r.lang}"`);
    } else if (shape === 'infix' && !r.translationKey) {
      staleExceptions.push(`/${outputPath} is listed as paired but carries no translationKey`);
    } else if (shape === 'unpaired' && (r.translationKey || r.translationOf)) {
      staleExceptions.push(`/${outputPath} is listed as having no other-language half but now names one`);
    }
  }

  // The list may shrink, never grow — otherwise the prefix rule below is
  // satisfiable by typing a URL into it.
  const overgrown = legacy.size > closedAt ? legacy.size : 0;

  // The prefix rule, binding on every Spanish URL the closed list does not cover.
  const offPrefix = es
    .filter((r) => !legacy.has(r.outputPath) && !r.outputPath.startsWith('es/'))
    .map((r) => `${r.file} publishes /${r.outputPath}`);

  return { es, listed, misfiled, staleExceptions, overgrown, offPrefix };
}

/**
 * Pairs, from BOTH forms of the relation.
 *
 * `translationKey` groups both halves by a shared name and is what the ten
 * migrated Lab pairs use. `translationOf` is an edge from an authored
 * translation to the migrated page it translates, and is what everything
 * outside the Lab uses — see the field comment in src/content/schemas.mjs for
 * why the two forms exist. Resolved here into one list of {original,
 * translation} so the assertions below do not care which was used.
 */
export function pairsOf(records) {
  const byPath = new Map(records.map((r) => [r.outputPath, r]));
  const pairs = [];

  for (const r of records) {
    if (!r.translationOf) continue;
    const original = byPath.get(r.translationOf);
    if (original) pairs.push({ original, translation: r, via: 'translationOf' });
  }

  const byKey = new Map();
  for (const r of records) {
    if (!r.translationKey) continue;
    byKey.set(r.translationKey, [...(byKey.get(r.translationKey) ?? []), r]);
  }
  for (const [, group] of byKey) {
    if (group.length !== 2) continue;
    // English is the original where a group has one of each; the pair is
    // symmetric either way, and this only decides which side is printed first.
    const original = group.find((r) => r.lang === 'en') ?? group[0];
    const translation = group.find((r) => r !== original);
    pairs.push({ original, translation, via: 'translationKey' });
  }

  return pairs;
}

export async function checkTranslations(report) {
  const records = loadPageRecords();
  const byPath = new Map(records.map((r) => [r.outputPath, r]));

  // ── The relation must resolve ──────────────────────────────────────────────

  const dangling = records
    .filter((r) => r.translationOf && !byPath.has(r.translationOf))
    .map((r) => `${r.file}: translationOf "${r.translationOf}" names no page`);
  const selfPointing = records
    .filter((r) => r.translationOf && r.translationOf === r.outputPath)
    .map((r) => `${r.file}: translationOf names the page itself`);

  if (dangling.length || selfPointing.length) {
    report.fail(
      'every translation names a page that exists',
      [...dangling, ...selfPointing].slice(0, 6).join('; '),
    );
  } else {
    report.pass(
      'every translation names a page that exists',
      `${records.filter((r) => r.translationOf).length} authored translations resolve`,
    );
  }

  /**
   * ── THE FILING RULE ────────────────────────────────────────────────────────
   *
   * A record sits at `pages/<lang>/<its own outputPath>`. All 157 of them, in
   * both languages, with no exception list.
   *
   * This is the assertion the owner asked for in as many words: "if I want to
   * find the mirror, I can do it." `pages/en/collect/decks.md` and
   * `pages/es/collect/decks.md` are the same page in two languages, and you can
   * see that without opening either or being told the convention.
   *
   * It used to be narrower — `authored/es/<path>` mirrors `migrated/<path>` —
   * and it inspected only the 61 records carrying `translationOf`, because the
   * other 11 Spanish records were filed in shapes the rule could not express.
   * The tree was reorganised by language so that one rule reaches everything;
   * the exceptions were not tolerated, they were removed.
   */
  const { es, listed, misfiled, staleExceptions, overgrown, offPrefix } = spanishFiling(records);

  if (misfiled.length) {
    report.fail(
      'every record sits at pages/<lang>/<its outputPath>',
      `${misfiled.length}: ${misfiled.slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'every record sits at pages/<lang>/<its outputPath>',
      `${records.length} records, one rule, no exceptions — ` +
        `${records.length - es.length} en, ${es.length} es`,
    );
  }

  /**
   * ── AND SO A TRANSLATION SITS BESIDE ITS ORIGINAL ──────────────────────────
   *
   * This follows from the rule above rather than adding to it: if both halves
   * are at `<lang>/<path>`, they differ only in the language root. It is
   * asserted separately because it is the property a person actually uses, and
   * a derived property that nobody checks is one that quietly stops holding.
   */
  const offMirror = records
    .filter((r) => r.translationOf)
    .map((r) => {
      const original = byPath.get(r.translationOf);
      if (!original) return null; // already reported as dangling above
      return filedAt(r) === `es/${filedAt(original).replace(/^en\//, '')}`
        ? null
        : `${filedAt(r)} — its original is at ${filedAt(original)}`;
    })
    .filter(Boolean);

  if (offMirror.length) {
    report.fail(
      'a translation sits at the mirror of its original',
      `${offMirror.length}: ${offMirror.slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'a translation sits at the mirror of its original',
      `es/<path> mirrors en/<path> — ${records.filter((r) => r.translationOf).length} files`,
    );
  }

  /**
   * ── A FROZEN URL STILL DESCRIBES A REAL RECORD ─────────────────────────────
   *
   * A list of exceptions is only worth as much as its accuracy. Left unchecked
   * it rots quietly into a list of URLs that used to matter, and every stale
   * line silently widens the hole in the prefix rule below.
   *
   * The 'unpaired' arm is the one that carries meaning rather than hygiene: it
   * asserts that /esp-feedback still has no other-language half. That absence
   * is now a claim this suite makes and would report on if it changed, which is
   * the difference between a decision and an omission.
   */
  if (staleExceptions.length) {
    report.fail(
      'a frozen Spanish URL still describes a real record',
      `${staleExceptions.length}: ${staleExceptions.slice(0, 5).join('; ')}`,
    );
  } else {
    const infix = [...LEGACY_ES.values()].filter((s) => s === 'infix').length;
    report.pass(
      'a frozen Spanish URL still describes a real record',
      `${LEGACY_ES.size} listed — ${infix} publishing /<area>/es/<slug>, ` +
        `${LEGACY_ES.size - infix} with no counterpart by design`,
    );
  }

  /**
   * ── THE FROZEN LIST IS CLOSED ──────────────────────────────────────────────
   *
   * Without this, the prefix rule below is satisfiable by typing a URL into
   * LEGACY_ES — the same shape of bypass as re-freezing a route manifest to
   * make verify:routes pass, and just as green. The list may shrink; growing it
   * means raising a number in the same diff, where a reviewer sees it.
   */
  if (overgrown) {
    report.fail(
      'the frozen Spanish URL list is closed',
      `${overgrown} entries against a closed count of ${LEGACY_ES_CLOSED_AT} — ` +
        'a new Spanish page publishes under /es/, it does not join this list',
    );
  } else {
    report.pass(
      'the frozen Spanish URL list is closed',
      `${LEGACY_ES.size} of a permitted ${LEGACY_ES_CLOSED_AT} — it may shrink, never grow`,
    );
  }

  /**
   * ── THE PREFIX RULE, BINDING ON NEW RECORDS ONLY ───────────────────────────
   *
   * A Spanish page is published at `/es/<path>`. 61 of the 72 already are, so
   * this writes down what the content already does rather than inventing a
   * convention — see .agents/skills/maar-content-authoring/SKILL.md.
   *
   * It binds new records ONLY, and it has to. The eleven legacy URLs are frozen
   * in the route contract: a rule worded to cover them would be a rule that
   * cannot be satisfied without breaking an invariant, so it would be turned off
   * rather than obeyed. LEGACY_ES is exactly the set it does not reach.
   *
   * This is the ONLY rule the eleven are still exempt from. Where they sit on
   * disk stopped being an exception when the tree was reorganised by language;
   * where they are published never can be.
   */
  if (offPrefix.length) {
    report.fail(
      'a new Spanish page is published under /es/',
      `${offPrefix.length}: ${offPrefix.slice(0, 5).join('; ')} — ` +
        'outputPath must be "es/" + the path of the English page',
    );
  } else {
    report.pass(
      'a new Spanish page is published under /es/',
      `${es.length - listed.length} of ${es.length} Spanish pages under /es/; ` +
        `${listed.length} legacy URLs frozen where they are`,
    );
  }

  const pairs = pairsOf(records);

  // ── A pair must be two LANGUAGES ───────────────────────────────────────────

  const sameLang = pairs
    .filter((p) => p.original.lang === p.translation.lang)
    .map((p) => `${p.translation.outputPath} and ${p.original.outputPath} are both ${p.translation.lang}`);
  if (sameLang.length) {
    report.fail(
      'a translation declares a different language from its original',
      `${sameLang.length}: ${sameLang.slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'a translation declares a different language from its original',
      `${pairs.length} pairs`,
    );
  }

  // ── A translation must not be a copy of its original ───────────────────────

  if (!has('dist')) {
    return report.skip('a translation is not its original', ARTIFACTS.dist.rel, ARTIFACTS.dist.issue);
  }

  const { set } = indexDist();
  const textOf = (outputPath) => {
    const file = resolveRoute(urlOf(outputPath), set);
    return file ? plainText(mainOf(readDistFile(file))) : null;
  };

  const untranslated = [];
  const unbuilt = [];
  for (const { original, translation } of pairs) {
    const a = textOf(original.outputPath);
    const b = textOf(translation.outputPath);
    if (a === null || b === null) {
      unbuilt.push(`${translation.outputPath} or its original is not in the build`);
      continue;
    }
    if (b.length === 0) {
      untranslated.push(`${translation.outputPath}: empty body`);
    } else if (a === b) {
      untranslated.push(`${translation.outputPath}: identical to ${original.outputPath}`);
    }
  }

  /**
   * ── A SPANISH PAGE'S NAVIGATION STAYS IN SPANISH ───────────────────────────
   *
   * The header's destinations live in SECTIONS as absolute English paths, and
   * for a long time every page rendered that same list. So the language
   * switcher worked exactly once: a reader on /es/about who clicked anything in
   * the navigation was returned to English, and /es/collect was reachable from
   * no link anywhere on the site — published, built, and unreachable.
   *
   * NOTHING IN THIS SUITE COULD SEE IT. Every URL involved builds, every link
   * resolves, verify:links was green throughout. It is only wrong if you know
   * which page you meant to arrive at, so it took the owner reporting it. This
   * is that report turned into an assertion.
   *
   * The switcher itself is excluded, and precisely: its links are the ones
   * carrying `hreflang`, which is exactly what marks a link as deliberately
   * crossing languages. Any other header link pointing at an English page that
   * HAS a Spanish half is the defect.
   */
  const enToEs = new Map();
  for (const { original, translation } of pairs) {
    if (original.lang === 'en' && translation.lang === 'es') {
      enToEs.set(urlOf(original.outputPath), urlOf(translation.outputPath));
    }
  }

  const normalise = (href) =>
    decodeURI(href).replace(/\.html$/, '').replace(/\/index$/, '') || '/';

  const leaks = [];
  for (const r of es) {
    const file = resolveRoute(urlOf(r.outputPath), set);
    if (!file) continue;
    const html = readDistFile(file);
    const header = /<header[\s\S]*?<\/header>/.exec(html);
    if (!header) continue;
    // The WHOLE opening tag, because `hreflang` is written after `href` in the
    // markup and a pattern that stops at `href` would read every switcher link
    // as a defect — which is what the first cut of this check did.
    for (const [, tag] of header[0].matchAll(/<a\b([^>]*)>/g)) {
      if (/\bhreflang=/.test(tag)) continue; // the switcher, deliberately crossing
      const href = (/\bhref="([^"]+)"/.exec(tag) || [])[1];
      if (!href || /^(https?:)?\/\//.test(href) || href.startsWith('#')) continue;
      const to = normalise(href);
      if (enToEs.has(to)) {
        leaks.push(`/${r.outputPath} links to ${to} — ${enToEs.get(to)} is its Spanish half`);
      }
    }
  }

  if (leaks.length) {
    report.fail(
      "a Spanish page's navigation stays in Spanish",
      `${leaks.length}: ${[...new Set(leaks)].slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      "a Spanish page's navigation stays in Spanish",
      `${es.length} Spanish pages — no header link drops the reader back to English`,
    );
  }

  /**
   * ── A LINK NAMES THE CANONICAL SPELLING ────────────────────────────────────
   *
   * `…/index.html` is a path the build emits but nobody navigates to: the dev
   * server 404s it, and in production it is a second spelling of a URL that
   * already has a canonical one. It reached the site three ways — the language
   * switcher, the hreflang set and the canonical link itself — because the URL
   * was derived from the BUILD PATH instead of from `outputPath`.
   *
   * Reported by the owner, who found /es/index.html 404ing from the switcher.
   * Card URLs are untouched: /CODE.html is a real contract spelling, and this
   * only rejects a directory index written as a file.
   */
  const indexHtml = [];
  for (const r of records) {
    const file = resolveRoute(urlOf(r.outputPath), set);
    if (!file) continue;
    for (const [, href] of readDistFile(file).matchAll(/href="([^"]*\/index\.html)"/g)) {
      indexHtml.push(`/${r.outputPath} links to ${href}`);
    }
  }

  if (indexHtml.length) {
    report.fail(
      'a link names the canonical URL, not a directory index file',
      `${indexHtml.length}: ${[...new Set(indexHtml)].slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'a link names the canonical URL, not a directory index file',
      `${records.length} pages carry no .../index.html link`,
    );
  }

  if (untranslated.length) {
    report.fail(
      'a translation is not its original',
      `${untranslated.length} page(s) declare a language they do not use: ` +
        untranslated.slice(0, 6).join('; '),
    );
  } else if (unbuilt.length) {
    report.fail('a translation is not its original', unbuilt.slice(0, 6).join('; '));
  } else {
    report.pass(
      'a translation is not its original',
      `${pairs.length} pairs compared on rendered body text`,
    );
  }

  // ── Coverage, always printed: a number nobody looks at is not a status ─────

  const byLang = {};
  for (const r of records) byLang[r.lang ?? '(none)'] = (byLang[r.lang ?? '(none)'] ?? 0) + 1;
  const translated = new Set(pairs.map((p) => p.original.outputPath)).size;
  report.pass(
    'translation coverage is stated',
    `${Object.entries(byLang).map(([l, n]) => `${n} ${l}`).join(', ')} — ` +
      `${translated} of ${byLang.en ?? 0} English pages have a Spanish half`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('verify-translations.mjs')) {
  runStandalone('verify:translations', checkTranslations);
}
