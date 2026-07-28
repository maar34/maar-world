#!/usr/bin/env node
/**
 * Migrate the 35 NFC card records into the typed `cards` collection.
 *
 * Source: maar.world-site/collections/_skysounds (34) and _stoney_way (1),
 * read-only. `_skysounds` is kept as the canonical collection and
 * collect/_cards is retired as a duplicate: the card content is consistent
 * between them and only the dead commerce links differed.
 *
 * Dropped on the way through:
 *   layout, show_title, header, footer   — presentation, now the template's job
 *   ent_link, physical_link, digital_link — dead storefronts. Commerce
 *       destinations come from one config value (see src/config/site.ts), which
 *       is the whole reason 183 links could die at once without anyone noticing.
 *
 * Kept verbatim: permalink, the Dropbox art and audio URLs, and every
 * play.maar.world link. Migrating Dropbox is explicitly out of scope.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/artifacts.mjs';
import { SCHEMAS } from '../src/content/schemas.mjs';

const LEGACY = join(ROOT, '..', 'maar.world-site', 'collections');
const OUT = join(ROOT, 'src/content/cards');

const SOURCES = [
  { dir: join(LEGACY, '_skysounds'), source: 'skysounds' },
  { dir: join(LEGACY, '_stoney_way'), source: 'stoney_way' },
];

const DROP = new Set([
  'layout', 'show_title', 'header', 'footer',
  'ent_link', 'physical_link', 'digital_link',
]);

/**
 * Minimal frontmatter reader. The card frontmatter is flat `key: value` plus a
 * single nested `titles:` block, so a full YAML parser would be more dependency
 * than the shape warrants. Values are trimmed: several carry trailing spaces.
 */
function parse(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('no frontmatter');
  const [, fm, body] = m;
  const data = {};
  const titles = {};
  let inTitles = false;

  for (const line of fm.split('\n')) {
    if (!line.trim()) continue;
    if (/^titles:\s*$/.test(line)) { inTitles = true; continue; }

    if (inTitles) {
      if (/^\s+\S/.test(line)) {
        // e.g. "  en      : &EN       Maar Sky Sounds Card I"
        const t = /^\s+([a-z-]+)\s*:\s*(?:&\S+\s+)?(.*)$/i.exec(line);
        if (t) titles[t[1]] = t[2].trim();
        continue;
      }
      inTitles = false;
    }

    const kv = /^([a-z_0-9]+)\s*:\s*(.*)$/i.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^-?\d+$/.test(value)) value = Number(value);
    data[key] = value;
  }

  if (Object.keys(titles).length) data.titles = titles;
  return { data, body: body.trim() };
}

/** YAML that is also valid JSON for every scalar — no quoting surprises. */
function toFrontmatter(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
    } else if (typeof v === 'boolean' || typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.join('\n');
}

const written = [];
const problems = [];

for (const { dir, source } of SOURCES) {
  if (!existsSync(dir)) {
    problems.push(`missing source directory: ${dir}`);
    continue;
  }

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const { data, body } = parse(readFileSync(join(dir, file), 'utf8'));

    if (!data.permalink) {
      problems.push(`${file}: no permalink`);
      continue;
    }
    const code = String(data.permalink).replace(/^\//, '');

    const record = {
      permalink: `/${code}`,
      source,
      suit_title: data.suit_title,
      card_title: data.card_title,
      card_description: data.card_description,
      cover: data.cover,
      card_image: data.card_image,
      titles: data.titles,
      key: typeof data.key === 'string' ? data.key.trim() : data.key,
      player: data.player,
      player2: data.player2,
      snip_player: data.snip_player,
      download: data.download,
      download2: data.download2,
      track_version: data.track_version,
      track_v2_id: data.track_v2_id,
      track_v2_slug: data.track_v2_slug,
      // Card pages are noindex in production and stay that way.
      noindex: true,
    };

    for (const k of DROP) delete record[k];
    // An empty value is an absent field, not a malformed one. The wild card
    // (DWE1406) ships blank `download`, `download2` and `snip_player` keys.
    for (const k of Object.keys(record)) {
      if (record[k] === undefined || (typeof record[k] === 'string' && record[k].trim() === '')) {
        delete record[k];
      }
    }

    const result = SCHEMAS.cards.safeParse(record);
    if (!result.success) {
      problems.push(
        `${file} (${code}): ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
      continue;
    }

    /**
     * Resolve Liquid interpolations in the body.
     *
     * Two cards (DWE1406, STW3344) carry raw-HTML bodies containing
     * `{{ page.card_image }}`, `{{ page.player }}` and friends. Jekyll
     * substituted those at render time; Astro's markdown does not process
     * Liquid and would emit the braces literally — a visibly broken page and
     * broken image/iframe URLs.
     *
     * Substituting from the same frontmatter Jekyll read reproduces exactly
     * what production serves, and keeps the file plain `.md` rather than
     * forcing it to MDX, which the raw HTML (`class=`, `style=`, bare `<br>`)
     * would not survive.
     *
     * Whitespace inside the braces is inconsistent in the source
     * (`{{ page.card_image}}`), so the pattern tolerates it. Anything left
     * unresolved is an error rather than a silent passthrough.
     */
    let resolvedBody = body.replace(
      /\{\{\s*page\.([a-z_0-9]+)\s*\}\}/gi,
      (whole, key) => {
        const value = record[key] ?? data[key];
        if (value === undefined || value === null || value === '') {
          problems.push(`${file} (${code}): body references {{ page.${key} }} which has no value`);
          return whole;
        }
        return String(value);
      },
    );

    const leftover = resolvedBody.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g);
    if (leftover) {
      problems.push(`${file} (${code}): unresolved template syntax: ${[...new Set(leftover)].slice(0, 3).join(', ')}`);
    }

    const out = `---\n${toFrontmatter(record)}\n---\n${resolvedBody ? `\n${resolvedBody}\n` : ''}`;
    writeFileSync(join(OUT, `${code}.md`), out);
    written.push({ code, source, hasBody: body.length > 0 });
  }
}

if (problems.length) {
  console.error(`\nmigrate-cards: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const bySource = written.reduce((a, w) => ({ ...a, [w.source]: (a[w.source] || 0) + 1 }), {});
console.log(`migrated ${written.length} cards -> src/content/cards/`);
console.log(`  ${JSON.stringify(bySource)}`);
console.log(`  with body content: ${written.filter((w) => w.hasBody).map((w) => w.code).join(', ') || 'none'}`);

if (written.length !== 35) {
  console.error(`\nREFUSING: expected 35 cards, wrote ${written.length}`);
  process.exit(1);
}
