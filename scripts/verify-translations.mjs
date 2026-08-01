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
 * Two rules, both asserted below, and both bounded by the same closed list:
 *
 *   ON DISK   a translation sits at `authored/es/` + the path of the page it
 *             translates. Every Spanish record is at that mirror or is named in
 *             `LEGACY_ES` — the set is closed, so a record cannot sit outside
 *             both and go unremarked, which is what eleven of them did.
 *
 *   AS A URL  a Spanish page is published at `/es/<path>`. This binds NEW
 *             records only. The eleven legacy URLs are frozen in the route
 *             contract and stay exactly where they are; a rule that bound them
 *             could only be satisfied by breaking an invariant.
 *
 * The list is the whole mechanism, and `LEGACY_ES` documents its own terms.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { plainText, mainOf } from './lib/html-text.mjs';
import { ROOT, has, ARTIFACTS, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';

const PAGE_DIRS = [join(ROOT, 'src/content/migrated'), join(ROOT, 'src/content/authored')];

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

/** Where a record actually sits, as a path relative to the authored root. */
export const filedAt = (r) =>
  decode(r.file.replace(/^src\/content\/authored\//, '').replace(/\.mdx?$/, ''));

/**
 * Is this record at the mirror of the page it translates?
 *
 * One definition, used by both the mirror rule and the coverage assertion after
 * it, so the two can never disagree about what "at the mirror" means. A record
 * with no `translationOf` makes no claim to be at a mirror and is not at one.
 */
export const isAtMirror = (r) => Boolean(r.translationOf) && filedAt(r) === `es/${r.translationOf}`;

/**
 * ── THE LEGACY SPANISH FILING EXCEPTIONS ──────────────────────────────────────
 *
 * Every Spanish record is either at the mirror — `authored/es/<path>`, asserted
 * below — or named here. There is no third state, and that is the entire point.
 * Before this list existed, eleven of the site's seventy-two Spanish records
 * were outside every rule in this file and nothing said so: they were not
 * exempted, they were never looked at. An unlisted exception cannot be told
 * apart from an oversight, and this file could not tell them apart either.
 *
 * The eleven are frozen, not tolerated-for-now. Their URLs are in
 * `routes/manifest.production.json` and under the contract lock, so
 * `/lab/es/dadada` cannot become `/es/lab/dadada` — moving one is a contract
 * change, not a tidy-up. See AGENTS.md, "Never modify the frozen route manifest".
 *
 * Two shapes, and the difference between them matters:
 *
 *   'infix'    — filed `<area>/es/<slug>`, the shape the migration produced.
 *                These ten are PAIRED, via `translationKey`. They are exempt
 *                from where they are FILED and from nothing else: all ten are
 *                in `pairsOf` and are held to every other assertion here,
 *                including the copy check.
 *
 *   'unpaired' — has no other-language half at all and is not supposed to
 *                acquire one. `/esp-feedback` is a retired redirect stub to
 *                `/bookings` (the NOINDEX block in astro.config.mjs). Listing
 *                it IS its fix: a missing pair becomes a stated fact instead of
 *                an unnoticed one. Do not invent a counterpart for it.
 *
 * THIS LIST IS CLOSED. It may shrink — deleting a legacy page is ordinary work,
 * and the assertion below then requires the line to go with it. It must never
 * grow: a new Spanish page belongs at the mirror, and adding a line here to turn
 * a check green is precisely the bypass these checks exist to catch.
 * `LEGACY_ES_CLOSED_AT` holds the count against exactly that. Raising it is a
 * decision, taken in a diff someone reads — which is the most a source file can
 * ask for, and more than the previous silence asked.
 */
export const LEGACY_ES = new Map([
  ['src/content/migrated/lab/es/cultura-compartida.md', 'infix'],
  ['src/content/migrated/lab/es/dadada.md', 'infix'],
  ['src/content/migrated/lab/es/helix-eac-montevideo-2025.md', 'infix'],
  ['src/content/migrated/lab/es/ip-1.md', 'infix'],
  ['src/content/migrated/lab/es/ip-2.md', 'infix'],
  ['src/content/migrated/lab/es/ip-3.md', 'infix'],
  ['src/content/migrated/lab/es/ip-orchestra-design.md', 'infix'],
  ['src/content/migrated/lab/es/ip-orchestra.md', 'infix'],
  ['src/content/migrated/lab/es/musica-retorno-al-juego.md', 'infix'],
  ['src/content/migrated/lab/es/orbits-and-bodies.md', 'infix'],
  ['src/content/migrated/esp-feedback.md', 'unpaired'],
]);

/** The size `LEGACY_ES` may not exceed. See the note above: it may only shrink. */
export const LEGACY_ES_CLOSED_AT = 11;

/**
 * Where every Spanish record sits, and whether it is allowed to sit there.
 *
 * Pure, and separated from the reporting for the reason `pairsOf` is: an
 * assertion nobody can run on a fixture is an assertion nobody has watched fail.
 * These four lists are exercised directly in scripts/selftest.mjs, in both
 * directions, so the checks below are known to be falsifiable and not merely
 * green. The parameters exist for those fixtures — production passes neither.
 */
export function spanishFiling(records, legacy = LEGACY_ES, closedAt = LEGACY_ES_CLOSED_AT) {
  const byFile = new Map(records.map((r) => [r.file, r]));
  const es = records.filter((r) => r.lang === 'es');
  const listed = es.filter((r) => legacy.has(r.file));

  // A Spanish record is at the mirror, or it is named. There is no third state.
  const unaccounted = es
    .filter((r) => !isAtMirror(r) && !legacy.has(r.file))
    .map((r) => `${r.file} → /${r.outputPath}`);

  // A named exception must still describe a real record, in the recorded shape.
  // The 'unpaired' arm is the one carrying meaning rather than hygiene: it
  // asserts /esp-feedback still has no other-language half, so that absence is
  // a claim the suite makes rather than a thing nobody looked at.
  const staleExceptions = [];
  for (const [file, shape] of legacy) {
    const r = byFile.get(file);
    if (!r) {
      staleExceptions.push(`${file} is listed but is no longer a page record — remove the line`);
    } else if (r.lang !== 'es') {
      staleExceptions.push(`${file} is listed as Spanish but declares lang "${r.lang}"`);
    } else if (shape === 'infix' && !r.translationKey) {
      staleExceptions.push(`${file} is listed as paired but carries no translationKey`);
    } else if (shape === 'unpaired' && (r.translationKey || r.translationOf)) {
      staleExceptions.push(`${file} is listed as having no other-language half but now names one`);
    }
  }

  // The list may shrink, never grow — otherwise the two lists above are
  // satisfiable by typing a path into it.
  const overgrown = legacy.size > closedAt ? legacy.size : 0;

  // The prefix rule, binding on everything the closed list does not cover.
  const offPrefix = es
    .filter((r) => !legacy.has(r.file) && !r.outputPath.startsWith('es/'))
    .map((r) => `${r.file} publishes /${r.outputPath}`);

  return { es, listed, unaccounted, staleExceptions, overgrown, offPrefix };
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
   * ── THE MIRROR RULE ────────────────────────────────────────────────────────
   *
   * An authored translation's FILE PATH must be `es/` + the file path of the
   * page it translates. `authored/es/collect/decks.md` translates
   * `migrated/collect/decks.md`, and you can see that without opening either.
   *
   * This is the assertion the owner asked for in as many words: "if I want to
   * find the mirror, I can do it." Without it the relation lives only in a
   * frontmatter field, so finding a page's other half means grepping 157
   * records — which is exactly what "everything is spread" felt like.
   *
   * It inspects only records carrying `translationOf`. That is a real limit and
   * not an oversight any more — the assertion after it closes the set.
   */
  const offMirror = records
    .filter((r) => r.translationOf && !isAtMirror(r))
    .map((r) => `${filedAt(r)} — should be es/${r.translationOf}`);

  if (offMirror.length) {
    report.fail(
      'a translation sits at the mirror of its original',
      `${offMirror.length}: ${offMirror.slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'a translation sits at the mirror of its original',
      `authored/es/<path> mirrors migrated/<path> — ${records.filter((r) => r.translationOf).length} files`,
    );
  }

  /**
   * ── EVERY SPANISH RECORD IS ACCOUNTED FOR ──────────────────────────────────
   *
   * The mirror rule above sees only the 61 records that carry `translationOf`.
   * This closes the set: a Spanish record is at the mirror, or it is named in
   * LEGACY_ES. There is no third option, and a record that reaches neither is
   * reported rather than skipped.
   *
   * This is the assertion the gap needed. The eleven records outside the mirror
   * rule were never wrong — they were unexamined, which is worse, because an
   * unexamined record and a correct one look identical from a green suite.
   */
  const { es, listed, unaccounted, staleExceptions, overgrown, offPrefix } = spanishFiling(records);

  if (unaccounted.length) {
    report.fail(
      'every Spanish record is at the mirror or a named exception',
      `${unaccounted.length} accounted for by neither: ${unaccounted.slice(0, 5).join('; ')}` +
        ' — file a translation at src/content/authored/es/<outputPath of the page it translates>',
    );
  } else {
    report.pass(
      'every Spanish record is at the mirror or a named exception',
      `${es.length} Spanish records — ${es.length - listed.length} at the mirror, ` +
        `${listed.length} named in LEGACY_ES`,
    );
  }

  /**
   * ── A NAMED EXCEPTION STILL DESCRIBES A REAL RECORD ────────────────────────
   *
   * A list of exceptions is only worth as much as its accuracy. Left
   * unchecked it rots quietly into a list of paths that used to matter, and
   * every stale line silently widens the hole above. So each entry has to name
   * a record that exists, in Spanish, in the shape recorded for it.
   *
   * The 'unpaired' arm is the one that carries meaning rather than hygiene: it
   * asserts that /esp-feedback still has no other-language half. That absence
   * is now a claim this suite makes and would report on if it changed, which is
   * the difference between a decision and an omission.
   */
  if (staleExceptions.length) {
    report.fail(
      'a named exception still describes a real record',
      `${staleExceptions.length}: ${staleExceptions.slice(0, 5).join('; ')}`,
    );
  } else {
    const infix = [...LEGACY_ES.values()].filter((s) => s === 'infix').length;
    report.pass(
      'a named exception still describes a real record',
      `${LEGACY_ES.size} listed — ${infix} paired but filed <area>/es/<slug>, ` +
        `${LEGACY_ES.size - infix} with no counterpart by design`,
    );
  }

  /**
   * ── THE EXCEPTION LIST IS CLOSED ───────────────────────────────────────────
   *
   * Without this, the two assertions above are satisfiable by typing a path
   * into LEGACY_ES — the same shape of bypass as re-freezing a route manifest
   * to make verify:routes pass, and just as green. The list may shrink; growing
   * it means raising a number in the same diff, where a reviewer sees it.
   */
  if (overgrown) {
    report.fail(
      'the legacy exception list is closed',
      `${overgrown} entries against a closed count of ${LEGACY_ES_CLOSED_AT} — ` +
        'a new Spanish page belongs at the mirror, not on this list',
    );
  } else {
    report.pass(
      'the legacy exception list is closed',
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
   * rather than obeyed. LEGACY_ES is exactly the set it does not reach, which
   * is why the same closed list serves both jobs.
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
