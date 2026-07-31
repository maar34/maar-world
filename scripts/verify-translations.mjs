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
   * `~20` is the migration's own encoding for a space in a filename (one
   * Collect card ends in one), so it is decoded on both sides rather than
   * treated as a difference.
   */
  const decode = (p) => p.replace(/~20/g, ' ');
  const offMirror = records
    .filter((r) => r.translationOf)
    .map((r) => {
      const actual = decode(r.file.replace(/^src\/content\/authored\//, '').replace(/\.mdx?$/, ''));
      const expected = `es/${r.translationOf}`;
      return actual === expected ? null : `${actual} — should be ${expected}`;
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
      `authored/es/<path> mirrors migrated/<path> — ${records.filter((r) => r.translationOf).length} files`,
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
