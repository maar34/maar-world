#!/usr/bin/env node
/**
 * npm run i18n:map — every page, beside its other-language half.
 *
 * The one command that answers "where is the mirror of this page". The relation
 * lives in frontmatter, so without this, finding a page's translation means
 * grepping 157 records across two directories — which is what "everything is
 * spread" described.
 *
 * Prints file paths, not URLs, because the question it answers is "which file
 * do I open".
 *
 *   npm run i18n:map            every page
 *   npm run i18n:map collect    only paths containing "collect"
 *   npm run i18n:map --todo     only English pages with no Spanish half
 */

import { loadPageRecords, pairsOf } from './verify-translations.mjs';

const args = process.argv.slice(2);
const todoOnly = args.includes('--todo');
const filter = args.find((a) => !a.startsWith('--'));

const records = loadPageRecords();
const pairs = pairsOf(records);

/** original outputPath -> its translation's record. */
const twin = new Map(pairs.map((p) => [p.original.outputPath, p.translation]));

const short = (f) => f.replace('src/content/', '');
const en = records
  .filter((r) => r.lang === 'en')
  .sort((a, b) => a.outputPath.localeCompare(b.outputPath));

const rows = en
  .map((r) => ({ en: r, es: twin.get(r.outputPath) ?? null }))
  .filter((row) => (todoOnly ? !row.es : true))
  .filter((row) => (filter ? row.en.outputPath.includes(filter) : true));

const width = Math.max(20, ...rows.map((r) => short(r.en.file).length));

console.log(`\n${'ENGLISH'.padEnd(width)}  SPANISH`);
console.log(`${'-'.repeat(width)}  ${'-'.repeat(width)}`);
for (const row of rows) {
  console.log(`${short(row.en.file).padEnd(width)}  ${row.es ? short(row.es.file) : '— none —'}`);
}

const missing = en.filter((r) => !twin.has(r.outputPath)).length;
console.log(
  `\n${rows.length} shown · ${en.length} English pages · ${en.length - missing} translated · ${missing} without a Spanish half`,
);
console.log('\nTHE RULE: authored/es/<path> is the translation of migrated/<path>.');
console.log('verify:translations fails if any file breaks it.\n');
