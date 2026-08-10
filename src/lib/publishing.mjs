/**
 * When a record is allowed to exist as a route.
 *
 * ── ONE DEFINITION, TWO CALLERS ──────────────────────────────────────────────
 *
 * `src/pages/[...page].astro` uses this to decide what to build, and
 * `scripts/publish-due.mjs` uses it to decide whether a scheduled CI run has
 * anything to do. Those two answers MUST agree: a guard that says "nothing due"
 * about a page the build would have published means the page silently never
 * appears, and nobody is watching for a thing that does not happen. So the rule
 * lives here and neither caller is allowed its own copy.
 *
 * ── THE DATE IS INCLUSIVE, AND MIDNIGHT UTC ──────────────────────────────────
 *
 * `publishAfter: "2026-09-15"` publishes from 2026-09-15T00:00:00Z. "After" is
 * read as "on or after", which is the reading a person writing a release date
 * means, and the alternative is an off-by-one nobody discovers until the day.
 *
 * UTC and not local time, because the only clock that decides this in practice
 * is a GitHub runner's, and that is UTC. A date written from Tenerife in summer
 * therefore turns over an hour before local midnight. That is stated rather than
 * corrected: a timezone-aware rule would need a timezone on every record, and
 * the imprecision that matters here is the scheduler's, not the clock's — GitHub
 * cron is best-effort and can lag by an hour on its own.
 */
export const isPublishable = (data, now = new Date()) => {
  const when = data?.publishAfter;
  if (!when) return true;
  const at = Date.parse(`${when}T00:00:00Z`);
  /**
   * An unparseable date publishes. It cannot be validated here — this runs
   * against already-loaded records — but `verify:schemas` rejects any shape but
   * YYYY-MM-DD, so reaching this branch means the schema was bypassed. Between
   * "publish something early" and "hide a page forever with no error anywhere",
   * the loud failure is the visible one.
   */
  if (Number.isNaN(at)) return true;
  return at <= now.getTime();
};

/**
 * The records that may be built, with held pages AND anything orphaned by them
 * removed.
 *
 * ── A TRANSLATION CANNOT OUTLIVE ITS ORIGINAL ────────────────────────────────
 *
 * `publishAfter` is written per record, and the obvious mistake is to write it
 * on the English half and forget the Spanish one. The naive filter then
 * publishes a Spanish page whose `translationOf` names a page that does not
 * exist: `verify:translations` fails on the dangling relation, and if it did
 * not, the page would ship with a language switcher pointing at a 404.
 *
 * Rather than make that an error someone has to remember, holding a page holds
 * its translations with it. The date is a fact about the WORK, not about one
 * language of it, and a person writing a release date on the English half means
 * the piece is not out yet.
 *
 * The reverse is not true and must not be: an English page whose Spanish half
 * is held simply has no translation yet, which is the ordinary state of
 * fourteen pages on this site today.
 */
export const publishable = (entries, now = new Date()) => {
  const kept = entries.filter((e) => isPublishable(e.data, now));
  const heldOriginals = new Set(
    entries.filter((e) => !isPublishable(e.data, now)).map((e) => e.data.outputPath),
  );
  if (heldOriginals.size === 0) return kept;
  return kept.filter((e) => !(e.data.translationOf && heldOriginals.has(e.data.translationOf)));
};

/**
 * The records whose live state disagrees with what the rule says it should be.
 *
 * Deliberately SYMMETRIC, and that is the whole reason this returns two lists
 * rather than a boolean. The obvious guard — "is anything due that is not yet
 * out?" — only covers publishing. Moving a `publishAfter` forward on a page
 * that is already live is an unpublish, and it would sit there published,
 * indefinitely, because no push happened and the guard saw nothing due.
 *
 * `live` is a predicate the caller supplies, so this stays pure and testable.
 */
export const publishingDrift = (records, live, now = new Date()) => {
  const shouldPublish = [];
  const shouldHide = [];
  for (const r of records) {
    if (!r.publishAfter) continue;
    const wanted = isPublishable(r, now);
    const isLive = live(r);
    if (wanted && !isLive) shouldPublish.push(r);
    if (!wanted && isLive) shouldHide.push(r);
  }
  return { shouldPublish, shouldHide };
};
