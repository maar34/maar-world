/**
 * Which pages are the same page in another language.
 *
 * The site is English and Spanish, and before this nothing in the build knew
 * that two pages were related at all — no `hreflang`, no field, no link.
 * `/lab/en/shared-culture` and `/lab/es/cultura-compartida` were two unrelated
 * records that happened to say the same thing.
 *
 * The relation is carried by `translationKey` on the record, not derived here.
 * That is the load-bearing decision: three of the ten Lab pairs have slugs that
 * are translations of each other rather than copies, so any rule that reads the
 * path finds 70% of them and — worse — reports nothing at all about the 30% it
 * misses. A stored key is checkable; a derived one fails silently.
 *
 * This module is deliberately tiny and pure so it can be tested without a build.
 */

/** Every language the site publishes in, in the order a switcher lists them. */
export const LANGS = ['en', 'es'];

/** What a language is called in its own language — never in the page's. */
export const LANG_LABEL = { en: 'english', es: 'español' };

/**
 * The other-language versions of a page.
 *
 * Returns `[]` when a page has no translation, which is the common case: 75 of
 * the site's pages exist only in English today. An empty result is not a
 * failure and must not render an empty switcher.
 *
 * `pages` is the whole collection; each entry needs `data.translationKey`,
 * `data.lang` and `data.outputPath`. The page itself is never returned.
 */
export function alternatesFor(page, pages) {
  const self = page.data?.outputPath;
  const key = page.data?.translationKey;

  /**
   * The pair is stated in one of two forms, and this resolves both into one
   * set so nothing downstream has to know which was used.
   *
   *   translationKey  a GROUP NAME on both halves. The ten Lab pairs, where
   *                   both halves are migrated and the migration computes the
   *                   key for both at once.
   *   translationOf   an EDGE from the authored half to the page it translates.
   *                   Every pair outside the Lab, because the English half is a
   *                   migrated record that migrate-pages.mjs rewrites on every
   *                   run — a key added there would not survive. See the field
   *                   comment in src/content/schemas.mjs.
   *
   * `origin` is the page this group hangs off: the original for a translation,
   * and the page itself for an original. Everything pointing at that origin,
   * plus the origin itself, is the group.
   */
  const origin = page.data?.translationOf ?? self;

  const group = pages.filter((p) => {
    if (p.data.outputPath === self) return false;
    if (key && p.data.translationKey === key) return true;
    if (p.data.translationOf === origin) return true;
    return p.data.outputPath === origin;
  });

  return group.sort((a, b) => LANGS.indexOf(a.data.lang) - LANGS.indexOf(b.data.lang));
}

/**
 * Every `translationOf` that names a page which does not exist.
 *
 * A dangling relation renders as "this page has no translation" — the switcher
 * simply does not appear — which is precisely the silent failure that made
 * `translationKey` a stored field rather than a derived one. It has to be loud,
 * so the page route calls this and throws; a typo in an `outputPath` fails the
 * build instead of quietly unpublishing a translation.
 *
 * Returns a list of problems, so the caller decides how to report. Pure, like
 * everything else here.
 */
export function validateTranslations(pages) {
  const known = new Set(pages.map((p) => p.data.outputPath));
  const problems = [];
  for (const p of pages) {
    const target = p.data.translationOf;
    if (!target) continue;
    if (!known.has(target)) {
      problems.push(
        `${p.data.outputPath}: translationOf "${target}" names no page`,
      );
    } else if (target === p.data.outputPath) {
      problems.push(`${p.data.outputPath}: translationOf names the page itself`);
    }
  }
  return problems;
}

/**
 * The page and its alternates together, in language order — what a switcher
 * renders. One entry per language, with the current one flagged.
 *
 * Returns `[]` rather than a single self-entry when there is no translation: a
 * switcher offering one choice is not a switcher, it is a label.
 */
export function languageChoices(page, pages) {
  const others = alternatesFor(page, pages);
  if (others.length === 0) return [];
  return [page, ...others]
    .sort((a, b) => LANGS.indexOf(a.data.lang) - LANGS.indexOf(b.data.lang))
    .map((p) => ({
      lang: p.data.lang,
      label: LANG_LABEL[p.data.lang] ?? p.data.lang,
      outputPath: p.data.outputPath,
      current: p.data.outputPath === page.data.outputPath,
    }));
}

/**
 * The global picker always names the site's two published languages.
 *
 * An unavailable alternate remains visibly present, but is not a link: sending
 * someone to an unrelated Spanish page would look like translation while
 * breaking the relationship this module exists to protect. When translation
 * coverage grows, the same function automatically turns that chip into a link.
 */
export function globalLanguageChoices(page, pages) {
  const available = new Map(
    [page, ...alternatesFor(page, pages)].map((p) => [p.data.lang, p]),
  );

  return LANGS.map((lang) => {
    const match = available.get(lang);
    return {
      lang,
      label: LANG_LABEL[lang] ?? lang,
      outputPath: match?.data.outputPath,
      current: page.data.lang === lang,
      unavailable: !match,
    };
  });
}

/** dist-relative outputPath → the URL a browser asks for. */
const urlOf = (outputPath) =>
  encodeURI(`/${outputPath.replace(/(^|\/)index$/, '')}`.replace(/\/(?=$)/, '')) || '/';

/**
 * English navigation URL → the same destination in `lang`.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 *
 * The header's destinations live in `SECTIONS` in src/config/site.ts as
 * absolute English paths — `/collect`, `/lab`, `/about` — and every page
 * rendered that same list, Spanish pages included. So the switcher worked
 * exactly once: a visitor on `/es/about` who clicked anything in the navigation
 * was returned to English, and had to switch again on every page. Worse, since
 * nothing anywhere linked to `/es/collect`, the Spanish Collect page was
 * unreachable by navigation despite being built and published — a page that
 * exists and cannot be arrived at is indistinguishable from one that is missing,
 * and that is exactly how it was reported.
 *
 * ── Why it resolves the relation instead of adding a prefix ───────────────────
 *
 * `/es/` + the English path would be right for 61 of the 72 Spanish pages and
 * silently wrong for the rest: ten Lab articles publish `/lab/es/<slug>`, three
 * of them under a slug that is a TRANSLATION rather than a copy
 * (`shared-culture` ↔ `cultura-compartida`). A prefix rule sends those to a URL
 * that does not exist. This walks the same stored relation the switcher and the
 * hreflang set already walk, so a destination is either the genuine other half
 * or it is left alone.
 *
 * UNTRANSLATED DESTINATIONS KEEP THEIR ENGLISH URL, deliberately. A nav entry
 * pointing at a page that does not exist would be the inert control this
 * codebase already removed once — the `?tag=EN` buttons at /lab. An English
 * page reached from a Spanish one is a gap in translation coverage; a 404 is a
 * broken site.
 *
 * Returns a plain object so it crosses the component boundary as data.
 */
export function navPathsFor(lang, pages) {
  const out = {};
  if (!lang || lang === 'en') return out;

  for (const p of pages) {
    if (p.data.lang !== lang) continue;
    const english = alternatesFor(p, pages).find((a) => a.data.lang === 'en');
    if (!english) continue;
    out[urlOf(english.data.outputPath)] = urlOf(p.data.outputPath);
  }
  return out;
}
