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

/** A record's body — everything after the frontmatter, verbatim. */
export const bodyOf = (text) => {
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return fm ? text.slice(fm[0].length) : text;
};

/** Every page record, with the fields this check reads. */
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
      body: bodyOf(text),
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
 * ── STRUCTURE IS AUTHORED IN ENGLISH — MW-19 ──────────────────────────────────
 *
 * A Spanish record must not carry structural markup in its body.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 *
 * The migration turned Jekyll pages into records whose bodies hold raw HTML, so
 * translating a page meant copying the WHOLE page and translating the words
 * inside it. Structure and copy were fused in the body, and then that fusion was
 * duplicated per language. Changing one component meant editing it twice and
 * keeping the two in step by hand.
 *
 * They did not stay in step. `collect/index` drifted by two elements with nobody
 * editing it to diverge, and the Spanish page visibly rendered differently from
 * the English one. NOTHING IN THIS SUITE COULD SEE IT — every URL built, every
 * link resolved, the whole suite was green throughout, and it took the owner
 * noticing with their own eyes. This is that report turned into an assertion,
 * which is the same thing the navigation-leak check above is.
 *
 * ── Why this rule and not "the two must not diverge" ──────────────────────────
 *
 * Owner's decision, 2026-08-01: ENGLISH IS THE SOURCE OF TRUTH, because it is
 * the language the site is worked in most. So the rule names ONE SIDE as
 * correct rather than comparing two things that are both editable — sharper,
 * and checkable without deciding which of two differing pages is the mistake.
 *
 * It does not make Spanish second-class OUTPUT. Both halves render through the
 * same component and therefore render identically; this decides where the
 * structure is AUTHORED, not how it is served.
 *
 * ── Why there is a list, and what it is ───────────────────────────────────────
 *
 * 34 Spanish records carry structural markup today. The rule cannot be enforced
 * outright until each one's English half has moved its structure into a page
 * family, which is MW-19 step 2 — sixteen pages, worst first.
 *
 * So this is a RATCHET, in the exact shape `LEGACY_ES` above already uses on
 * this site, and for the same reason: an assertion that cannot be turned on
 * until a long job finishes is an assertion nobody turns on. What it buys
 * immediately:
 *
 *   · a NEW Spanish page cannot introduce structural markup at all
 *   · a converted page cannot regress — `collect/index` is not on this list and
 *     can never be added to it
 *   · every conversion in step 2 must DELETE a line here, in the same diff a
 *     reviewer reads
 *
 * THE LIST IS CLOSED. It may shrink — that is the work — and it must never
 * grow. `STRUCTURED_ES_CLOSED_AT` holds it against exactly the bypass that
 * typing a path into it would be, which is the same bypass as re-freezing a
 * route manifest to make verify:routes pass, and just as green.
 *
 * A line whose record no longer carries markup is reported too. Without that
 * the list would rot into a record of pages that USED to be a problem, and
 * every stale line silently widens the hole.
 */
/**
 * CASE-INSENSITIVE, WHICH ALSO CATCHES COMPONENT NAMES. `<Figure …/>` in an
 * `.mdx` body is a component call, not a `<figure>` element, but this pattern
 * cannot tell them apart and counts it — three of them failed a correctly
 * converted `/orbiters` before the component was renamed to `Picture`. The
 * insensitivity is deliberate (`<DIV>` is valid HTML and must not slip past),
 * so the rule is on the naming side: a component rendered from a body must not
 * be named for one of these tags. `Section`, `Article`, `Table` and `Span` are
 * the remaining traps.
 */
export const STRUCTURAL_TAGS = /<(?:div|section|figure|ul|ol|table|article|span|img|iframe|a)\b/gi;

/**
 * How many structural elements a body carries. The measure MW-19 audited with.
 *
 * HTML COMMENTS ARE CUT FIRST, and that is part of the rule rather than part of
 * reading a file. A converted record explains in a note what its body used to
 * hold — both halves of `collect/index` do — and a rule that counted the words
 * of that note would fail the very page it was written to protect. Stripping
 * here rather than in `bodyOf` keeps the rule self-contained: a fixture holding
 * a raw body is measured exactly as a real record is.
 */
export const structuralCount = (body) =>
  (String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').match(STRUCTURAL_TAGS) || []).length;

/**
 * The Spanish records whose bodies still hold structure, by `outputPath`.
 *
 * Ordered worst first, which is also the order MW-19 step 2 works in. Delete a
 * line when its pair's structure moves into a page family; never add one.
 */
export const STRUCTURED_ES = new Set([
  'es/radio',
  'lab/es/ip-orchestra-design',
  'lab/es/ip-2',
  'lab/es/ip-3',
  'lab/es/orbits-and-bodies',
  'lab/es/ip-1',
  'lab/es/dadada',
  'es/collect/docs/tutorials',
  'es/collect/docs/ent-cards',
  'es/collect/docs/releases/skysounds',
  'es/collect/cards',
  'es/collect/docs/ent-cards/nfc',
  'es/collect/docs/mw',
  'es/collect/docs/orbiters/development',
  'es/collect/documentation',
  'lab/es/helix-eac-montevideo-2025',
]);

/**
 * Chrome words that are the same in English and Spanish, deliberately.
 *
 * The header on a Spanish page must be Spanish. It was not: `/es` shipped a
 * navigation reading "orbiters · lab · landings · bookings · about" and two
 * buttons saying "collect cards" and "Enter the lab", under Spanish body copy.
 * The owner asked why, 2026-08-01: *"all the shell is not translated, why
 * didn't we use i18n for this?"* — and the answer was that this site had
 * per-language strings in four different shapes already and the navigation had
 * none of them. It has `labelEs` now, read through `labelFor`.
 *
 * These are the words that survive translation because they are NAMES rather
 * than words: the brand, the two product areas, and the language chips a reader
 * uses to switch. Translating "Orbiters" would rename the instrument.
 *
 * Anything not on this list appearing identically in both headers is a label
 * somebody forgot to translate, which is what the assertion is for.
 */
export const SHARED_CHROME_WORDS = new Set([
  /* The wordmark, as the brand link announces it. A brand is not translated. */
  'Maar World',
  'maar world',
  /* The two product areas. Translating "Orbiters" would rename the instrument,
     and "Collect" is the name of a section of this site, not the verb. */
  'collect',
  'Collect',
  'Orbiters',
  'Lab',
  /* The language chips themselves — a reader looking for Spanish looks for
     "es", in either language. */
  'es',
  'en',
  /* The About link is drawn as its icon alone — "just leave the info button"
     — and "info" is the same word in both languages. It exists only as the
     accessible name, since a link with no text cannot be announced. */
  'info',
]);

/**
 * The only pairs whose PICTURES may legitimately differ, by English outputPath.
 *
 * A photograph is the same photograph in Spanish, so two halves showing
 * different files is a defect by default — it is how `/es/landings`,
 * `/es/bookings`, `/es/orbiters`, `/es/about` and `/es/calendar` came to render
 * no header at all, and how the Spanish home page came to draw one of its three
 * cards with no picture. Both were lookups keyed by an English-only path,
 * returning nothing on a miss, invisible to every check in the suite.
 *
 * The exception is artwork with WORDS PRINTED ON IT. The Orbiters Orchestra
 * poster exists as `Interplanetary-Orchestra.ENG.png` and
 * `Interplanetary-Orchestra.ESP.png` because it is a designed sheet with type,
 * and showing a reader the English sheet on a Spanish page would be the same
 * half-translated chrome this issue removes. That is a picture that is genuinely
 * per-language, and it is the only kind that is.
 *
 * `lab` is here because the Lab index draws that poster as one of its eleven
 * card covers, not for a reason of its own.
 */
export const TRANSLATED_ARTWORK = new Set(['lab/en/ip-orchestra-design', 'lab']);

/**
 * A page's shape, with every word removed: tag names and first classes, in order.
 *
 * Pure, and exported, for the reason `spanishFiling` and `spanishStructure` are:
 * an assertion nobody can run on a fixture is an assertion nobody has watched
 * fail. `scripts/selftest.mjs` drives it in both directions.
 *
 * ── WHAT IT DELIBERATELY IGNORES ─────────────────────────────────────────────
 *
 * THE CHROME. Only the rendered body is measured. The header, the language
 * switcher and the footer are drawn by the layout from the record's own `lang`,
 * so they differ between two halves BY DESIGN, and a check that compared them
 * would fail on the one thing that is supposed to be per-language.
 *
 * EVERY ATTRIBUTE BUT THE FIRST CLASS. Ids are per-language on purpose — a
 * carousel's slide anchors carry an `es-` prefix so the two halves cannot
 * collide — and `alt`, `title` and `aria-label` are copy. Comparing them would
 * report a correct translation as a defect. Tag plus first class is enough to
 * catch the thing that matters: a band, a plate or a list that exists on one
 * half and not the other.
 */
export const elementSkeleton = (html) => {
  const m = /<div class="prose"[\s\S]*?(?=<\/main>|<footer)/.exec(html);
  return (
    (m ? m[0] : html)
      .match(/<([a-z][\w-]*)\b[^>]*>/g)
      ?.map((t) => {
        const tag = /^<([a-z][\w-]*)/.exec(t)[1];
        const cls = /class="([^"]*)"/.exec(t);
        return cls ? `${tag}.${cls[1].split(/\s+/)[0]}` : tag;
      })
      .join(' ') ?? ''
  );
};

/**
 * THE PAIRS THAT STILL RENDER AS TWO WEBSITES INSTEAD OF ONE.
 *
 * The owner's sentence, 2026-08-01, and it is the clearest statement of what
 * MW-19 is for:
 *
 *   "The same page. It's one website using two languages. It's not two websites
 *    with two different languages. It's one."
 *
 * `STRUCTURED_ES` asserts that a Spanish record carries no structural markup —
 * a rule about the SOURCE. This asserts the property that rule exists to
 * produce, about the OUTPUT: a page and its translation render the same
 * elements in the same order. It is the stronger of the two, because a pair can
 * satisfy the first and still diverge — `collect/docs/orbiters/how-to-use` has
 * no markup in either half and its two bodies still disagree, one writing a list
 * item where the other writes a paragraph.
 *
 * Keyed by the ENGLISH outputPath, because English is the source of truth.
 *
 * CLOSED: it may shrink, never grow. A pair leaves this list by having its
 * structure moved into a component both halves render — never by editing one
 * body until it matches the other, which is two websites kept in step by hand
 * and is exactly the labour this issue removes. A line that no longer describes
 * a real divergence is reported too, so the list cannot rot into a record of
 * pages that USED to disagree.
 */
export const DIVERGENT_PAIRS = new Set([
  'collect/docs/mw',
  'collect/docs/orbiters/how-to-use',
  'collect/docs/releases/skysounds',
  'lab/en/dadada',
  'lab/en/ip-2',
  'lab/en/ip-orchestra-design',
  'lab/en/orbits-and-bodies',
  'radio',
]);

/** The size `DIVERGENT_PAIRS` may not exceed. It may only shrink. */
export const DIVERGENT_PAIRS_CLOSED_AT = 8;

/** The size `STRUCTURED_ES` may not exceed. It may only shrink. */
export const STRUCTURED_ES_CLOSED_AT = 16;

/**
 * Which Spanish records carry structure they are not permitted to carry.
 *
 * Pure, and separated from the reporting for the reason `spanishFiling` is: an
 * assertion nobody can run on a fixture is an assertion nobody has watched fail.
 * Driven in both directions from scripts/selftest.mjs; the parameters exist for
 * those fixtures, and production passes none of them.
 */
export function spanishStructure(
  records,
  permitted = STRUCTURED_ES,
  closedAt = STRUCTURED_ES_CLOSED_AT,
) {
  const es = records.filter((r) => r.lang === 'es');

  const carrying = es.filter((r) => structuralCount(r.body) > 0);

  // The rule itself: markup on a Spanish record the list does not cover.
  const offending = carrying
    .filter((r) => !permitted.has(r.outputPath))
    .map(
      (r) =>
        `${r.file} carries ${structuralCount(r.body)} structural element(s) — ` +
        'structure belongs in a page family, not in a translated body',
    );

  // A listed page that has been converted must lose its line in the same diff.
  const byPath = new Map(es.map((r) => [r.outputPath, r]));
  const stale = [...permitted]
    .filter((p) => {
      const r = byPath.get(p);
      return !r || structuralCount(r.body) === 0;
    })
    .map((p) => `/${p} is listed but carries no structural markup any more — remove the line`);

  const overgrown = permitted.size > closedAt ? permitted.size : 0;

  return { es, carrying, offending, stale, overgrown };
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

  /**
   * ── STRUCTURE IS AUTHORED IN ENGLISH ───────────────────────────────────────
   *
   * See the long note on `spanishStructure` above for why the rule names one
   * side as correct instead of comparing two editable things, and why it is a
   * closed ratchet rather than an absolute rule today.
   */
  const structure = spanishStructure(records);

  if (structure.offending.length) {
    report.fail(
      'a Spanish record carries no structural markup',
      `${structure.offending.length}: ${structure.offending.slice(0, 5).join('; ')} — ` +
        'move the structure into the page family that renders it (MW-19); ' +
        'adding a line to STRUCTURED_ES is the bypass that list exists to make visible',
    );
  } else {
    report.pass(
      'a Spanish record carries no structural markup',
      `${structure.es.length - structure.carrying.length} of ${structure.es.length} Spanish ` +
        `records hold words only; ${STRUCTURED_ES.size} still awaiting MW-19 step 2`,
    );
  }

  if (structure.stale.length) {
    report.fail(
      'every listed Spanish record still carries the markup it is listed for',
      `${structure.stale.length}: ${structure.stale.slice(0, 5).join('; ')}`,
    );
  } else {
    report.pass(
      'every listed Spanish record still carries the markup it is listed for',
      `${STRUCTURED_ES.size} listed, none of them already converted`,
    );
  }

  if (structure.overgrown) {
    report.fail(
      'the structural-markup list is closed',
      `${structure.overgrown} entries against a closed count of ${STRUCTURED_ES_CLOSED_AT} — ` +
        'a page loses its line by having its structure moved, it does not gain one',
    );
  } else {
    report.pass(
      'the structural-markup list is closed',
      `${STRUCTURED_ES.size} of a permitted ${STRUCTURED_ES_CLOSED_AT} — it may shrink, never grow`,
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

  // ── ONE WEBSITE IN TWO LANGUAGES ──────────────────────────────────────────

  const structureOf = (outputPath) => {
    const file = resolveRoute(urlOf(outputPath), set);
    return file ? elementSkeleton(readDistFile(file)) : null;
  };

  const divergent = [];
  let identical = 0;
  for (const { original, translation } of pairs) {
    const a = structureOf(original.outputPath);
    const b = structureOf(translation.outputPath);
    if (a === null || b === null) continue;
    if (a === b) {
      identical += 1;
      continue;
    }
    const A = a.split(' ');
    const B = b.split(' ');
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i += 1;
    divergent.push(
      `${original.outputPath} (${A.length} elements) vs ${translation.outputPath} (${B.length}) — ` +
        `first difference at element ${i + 1}: ${A[i] ?? '(end)'} / ${B[i] ?? '(end)'}`,
    );
  }

  const unexpected = divergent.filter(
    (d) => !DIVERGENT_PAIRS.has(d.slice(0, d.indexOf(' ('))),
  );
  const healed = [...DIVERGENT_PAIRS].filter(
    (p) => !divergent.some((d) => d.startsWith(`${p} (`)),
  );

  if (unexpected.length) {
    report.fail(
      'a page and its translation render the same structure',
      `${unexpected.length} pair(s) diverge: ${unexpected.slice(0, 4).join('; ')} — ` +
        'this is one website in two languages, not two websites; move the structure into a ' +
        'component both halves render (MW-19) rather than editing one body to match the other',
    );
  } else if (healed.length) {
    report.fail(
      'a page and its translation render the same structure',
      `${healed.length} pair(s) listed as divergent no longer are: ${healed.join(', ')} — ` +
        'delete them from DIVERGENT_PAIRS in the same commit that converged them',
    );
  } else {
    report.pass(
      'a page and its translation render the same structure',
      `${identical} of ${identical + divergent.length} pairs render an identical element ` +
        `skeleton; ${divergent.length} still awaiting MW-19 step 2`,
    );
  }

  if (DIVERGENT_PAIRS.size > DIVERGENT_PAIRS_CLOSED_AT) {
    report.fail(
      'the divergent-pair list is closed',
      `${DIVERGENT_PAIRS.size} listed, ${DIVERGENT_PAIRS_CLOSED_AT} permitted — it may shrink, never grow`,
    );
  } else {
    report.pass(
      'the divergent-pair list is closed',
      `${DIVERGENT_PAIRS.size} of a permitted ${DIVERGENT_PAIRS_CLOSED_AT} — it may shrink, never grow`,
    );
  }

  // ── A PICTURE HAS NO LANGUAGE ─────────────────────────────────────────────

  const picturesOf = (outputPath) => {
    const file = resolveRoute(urlOf(outputPath), set);
    if (!file) return null;
    /* THE WHOLE DOCUMENT, not the body — deliberately wider than the structural
       assertion above. Both defects this catches were in the CHROME: the section
       header's collage, and a card cover drawn by a page family. Measuring only
       the body is what let them stand. */
    return (readDistFile(file).match(/<img[^>]*\ssrc="([^"]+)"/g) ?? [])
      .map((t) => /src="([^"]+)"/.exec(t)[1])
      .join(' ');
  };

  const wrongPictures = [];
  let samePictures = 0;
  for (const { original, translation } of pairs) {
    const a = picturesOf(original.outputPath);
    const b = picturesOf(translation.outputPath);
    if (a === null || b === null) continue;
    if (a === b) {
      samePictures += 1;
      continue;
    }
    if (TRANSLATED_ARTWORK.has(original.outputPath)) continue;
    const A = a ? a.split(' ') : [];
    const B = b ? b.split(' ') : [];
    wrongPictures.push(
      `${original.outputPath} shows ${A.length} picture(s), ${translation.outputPath} shows ${B.length}` +
        (A.length === B.length ? ' — same count, different files' : ''),
    );
  }

  if (wrongPictures.length) {
    report.fail(
      'a page and its translation show the same pictures',
      `${wrongPictures.length}: ${wrongPictures.slice(0, 5).join('; ')} — a photograph is the ` +
        'same photograph in Spanish. A lookup keyed by an English-only path (SECTION_COLLAGE, ' +
        'ARTICLE_COVER_FALLBACKS) returns nothing for the Spanish half and the page silently ' +
        'renders without it. If the artwork genuinely carries words, list the pair in ' +
        'TRANSLATED_ARTWORK and say so',
    );
  } else {
    report.pass(
      'a page and its translation show the same pictures',
      `${samePictures} of ${pairs.length} pairs identical; ${TRANSLATED_ARTWORK.size} pair(s) ` +
        'carry artwork with words on it and are listed',
    );
  }

  // ── THE SHELL SPEAKS THE READER'S LANGUAGE ────────────────────────────────

  const chromeLabelsOf = (outputPath) => {
    const file = resolveRoute(urlOf(outputPath), set);
    if (!file) return null;
    const html = readDistFile(file);
    const header = /<header[\s\S]*?<\/header>/.exec(html);
    if (!header) return [];
    /* The words on the navigation links, in order. Not the hrefs — those are
       already asserted above, and a Spanish page can reach the right URL while
       naming it in English, which is exactly what it did. */
    return [...header[0].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  };

  const englishChrome = [];
  let localisedChrome = 0;
  for (const { original, translation } of pairs) {
    if (translation.lang !== 'es') continue;
    const en = chromeLabelsOf(original.outputPath);
    const es = chromeLabelsOf(translation.outputPath);
    if (en === null || es === null || en.length === 0) continue;
    const shared = en.filter((label, i) => es[i] === label && !SHARED_CHROME_WORDS.has(label));
    if (shared.length) {
      englishChrome.push(`${translation.outputPath}: ${[...new Set(shared)].slice(0, 4).join(', ')}`);
    } else {
      localisedChrome += 1;
    }
  }

  if (englishChrome.length) {
    report.fail(
      'a Spanish page names its navigation in Spanish',
      `${englishChrome.length} page(s) show English chrome: ${englishChrome.slice(0, 4).join('; ')} — ` +
        'give the entry a `labelEs` in SECTIONS or HOME_ACTIONS and read it through `labelFor`. ' +
        'If the word is genuinely the same in both languages, add it to SHARED_CHROME_WORDS and say why',
    );
  } else {
    report.pass(
      'a Spanish page names its navigation in Spanish',
      `${localisedChrome} Spanish page(s) — every navigation label translated, ` +
        `${SHARED_CHROME_WORDS.size} words shared by both languages on purpose`,
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
