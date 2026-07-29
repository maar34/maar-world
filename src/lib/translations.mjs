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
  const key = page.data?.translationKey;
  if (!key) return [];
  return pages
    .filter((p) => p.data.translationKey === key && p.data.outputPath !== page.data.outputPath)
    .sort((a, b) => LANGS.indexOf(a.data.lang) - LANGS.indexOf(b.data.lang));
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
