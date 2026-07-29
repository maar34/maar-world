/**
 * HTML → text, in the three forms this repo actually needs.
 *
 * There were five implementations of this across five scripts, three of them
 * byte-identical, plus four separate `decodeEntities` and two `<main>`
 * extractors. That is not merely untidy — it is a correctness risk with a
 * specific shape:
 *
 *   `freeze-routes.mjs` computes `textSha256` for every production route.
 *   `author-content-expectations.mjs` compares its own recomputation against
 *   that hash to decide whether a legacy `_site` build reproduces production
 *   byte-for-byte, and therefore whether a page's expectations are
 *   `legacy-site-exact` or fall back to a weaker whole-page baseline.
 *
 * Those two had to agree exactly, and they agreed only because two separately
 * maintained regex chains happened to be identical — kept in step by a comment
 * reading "Same text extraction verify:content and freeze-routes.mjs use".
 * A comment is not a mechanism. Now they call one function, so agreement is
 * structural.
 *
 * THE THREE FORMS ARE NOT UNIFIED, AND MUST NOT BE. They differ in ways that
 * are correct for their callers, and collapsing them would silently change
 * every frozen fingerprint in the repo. The differences are named here instead,
 * so they can be seen and tested rather than rediscovered:
 *
 *   plainText     comments KEPT, entities NOT decoded except &nbsp;
 *                 The fingerprint form. Its exact output is baked into
 *                 routes/manifest.production.json. Changing it invalidates the
 *                 frozen manifest.
 *   bodyText      comments dropped, every entity → a space, <body> only.
 *                 Asks "did this page render anything at all", not "how does it
 *                 read", so it deliberately does not decode.
 *   readableText  comments dropped, entities properly decoded including
 *                 numeric. What a screen reader would announce, which is the
 *                 only question verify:a11y asks.
 */

import { createHash } from 'node:crypto';

/**
 * Script and style contents are not text a reader ever sees.
 *
 * Exported because verify:build's prose-coverage assertion needs exactly this
 * definition: it scans bodies for element names, and a `"<unknown>"` string
 * inside Astro's hydration runtime is not an element on the page. Two
 * definitions of "what is not visible markup" would drift.
 */
export const dropCode = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The fingerprint form — what `textSha256` in the frozen manifest was computed
 * from, and what must be recomputed identically to compare against it.
 *
 * Note what it does NOT do: it leaves HTML comments in place (they are stripped
 * by the tag regex, which is not the same as being removed with their contents)
 * and it decodes nothing but `&nbsp;`. Both are load-bearing. This is the
 * original implementation verbatim; do not "improve" it without re-freezing the
 * manifest, which is a contract.
 */
export function plainText(html) {
  return collapse(
    dropCode(html)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' '),
  );
}

const BODY_RE = /<body[^>]*>([\s\S]*)<\/body>/i;

/**
 * Visible text in the page body. Deliberately crude — the question is "did this
 * page render anything at all", not "how does it read". Every entity becomes a
 * space rather than its character, which is fine for a length floor and wrong
 * for anything else.
 */
export function bodyText(html) {
  const body = BODY_RE.exec(html);
  return collapse(
    dropCode(body ? body[1] : '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-zA-Z#0-9]+;/g, ' '),
  );
}

/** The named entities that appear in this corpus, plus the two numeric forms. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };

/**
 * Text a reader would hear: markup and comments gone, entities decoded,
 * including numeric ones. An unknown entity becomes a space rather than being
 * left as source, because `&hellip;` announced as "ampersand hellip semicolon"
 * is worse than a gap.
 */
export function readableText(html) {
  return collapse(
    dropCode(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, name) => {
        const key = name.toLowerCase();
        if (key in ENTITIES) return ENTITIES[key];
        if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
        if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
        return ' ';
      }),
  );
}

/**
 * Entities as they appear in ATTRIBUTE values.
 *
 * Separate from `readableText` because the question is different: an `href`
 * written `?a=1&amp;raw=1` is not the URL production requests, and getting that
 * wrong makes the external-link baseline record URLs nobody ever fetched.
 *
 * `&amp;` is decoded FIRST here and last in the checkers' own historical
 * versions. That ordering difference is real: decoding `&amp;` first turns
 * `&amp;#39;` into `&#39;` and then into `'`, which is double-decoding. It is
 * preserved as-was because the frozen external-link baseline was recorded with
 * it, and changing it would move URLs in a committed artifact.
 */
export function decodeAttrEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

/**
 * The page's own content region. The shell owns `<main>`, so everything the
 * checks assert about a page is inside it.
 *
 * Falls back to the whole document when there is no `<main>` — a page without
 * one is a page whose content region is the document, and returning nothing
 * would make every assertion about it vacuously pass.
 */
export function mainOf(html) {
  const open = /<main\b[^>]*>/i.exec(html);
  if (!open) return html;
  const close = html.lastIndexOf('</main>');
  if (close <= open.index) return html;
  return html.slice(open.index + open[0].length, close);
}

/** A stable short hash. `length` is in hex characters, so 32 is 128 bits. */
export function sha(text, length = 32) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, length);
}
