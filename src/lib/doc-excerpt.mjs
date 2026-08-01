/**
 * The opening sentence of a documentation article, taken from the article.
 *
 * MW-16 asks each Docs card to carry "the article's short introduction or
 * excerpt … when available". The records have no `description` — the migration
 * never wrote one — so the choice was to author ten new intros or to read the
 * one each article already opens with. This reads it.
 *
 * THAT DISTINCTION IS THE WHOLE POINT. Invented card copy is copy nobody
 * maintains: it drifts from the article the moment the article is edited, and
 * `verify:content` cannot catch it because it is not derived from anything.
 * What this returns is a substring of the body the page itself renders, so it
 * is either right or the article is wrong.
 *
 * "WHEN AVAILABLE" IS LOAD-BEARING, NOT A HEDGE. `tutorials` opens with a
 * heading, two consent facades and a row of hashtags and has no prose paragraph
 * at all. It returns null and the card renders without an excerpt, which
 * `Card.astro` already treats as a designed state ("missing slots degrade, they
 * do not collapse"). Manufacturing a sentence for it would be the invented copy
 * this exists to avoid.
 *
 * NOT TRUNCATED HERE, DELIBERATELY. `.card__excerpt` clamps with
 * `-webkit-line-clamp`, and card.css states why: the full sentence stays in the
 * DOM so a screen reader gets all of it and `verify:content`'s text floor still
 * counts it. Cutting the string in the template would delete content to make a
 * layout fit — the exact thing that check exists to catch.
 */

/**
 * Lines that are structure rather than prose.
 *
 * The bodies are migrated Jekyll: markdown and raw HTML in the same file, which
 * is why this matches both spellings of the same thing. `embed-facade` is the
 * click-to-load stand-in for a third-party embed — it is a `<p>`, so it is the
 * one paragraph that has to be named explicitly or every video article would
 * open with "watch this video on youtube".
 */
const STRUCTURAL = [
  /^\s*#{1,6}\s/,                     // markdown heading
  /**
   * AN `.mdx` BODY OPENS WITH ITS IMPORTS, AND THEY ARE NOT PROSE.
   *
   * This shipped: `/collect/documentation` and `/es/collect/documentation`
   * rendered cards reading "import Mark from
   * '../../../../../../components/patterns/Mark.astro';". The line is long
   * enough to clear MIN_EXCERPT_CHARS and contains letters, so every test below
   * passed it — the filter was written when every body was `.md` and the first
   * line of a body could only ever be content.
   *
   * `export const` too: converted articles declare their slide arrays and
   * facade strings that way.
   */
  /^\s*(?:import|export)\s/,
  /^\s*<\/?(?:h[1-6]|hr|div|figure|img|ul|ol|li|table|thead|tbody|tr|td|th|iframe|blockquote|section|header|nav|aside|form|br)\b/i,
  /^\s*<p[^>]*class="[^"]*embed-facade/i,
  /^\s*!\[/,                          // markdown image
  /^\s*[-*+]\s/,                      // bullet item
  /^\s*\d+\.\s/,                      // ordered item
  /^\s*[-*_]{3,}\s*$/,                // thematic break
  /^\s*\|/,                           // table row
  /^\s*>/,                            // blockquote
  /^\s*```/,                          // fence
];

/** Inline markup removed so the card shows words, not spans. */
function toPlainText(line) {
  return line
    /* A markdown link keeps its label and loses its address: the card is
       already one link target, so an address inside it would be unreachable
       text either way. */
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]{1,3}(?=\S)([^*_]*)(?<=\S)[*_]{1,3}/g, '$1')
    /* Entities the migration emitted. Decoded rather than stripped — `&amp;`
       left as-is would print in the middle of a sentence. */
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The shortest run of characters worth showing.
 *
 * A stray fragment — a lone "Front", a date, an image credit — is noise on a
 * card, and every real opening sentence in these ten articles clears this
 * comfortably. Below it the answer is "no excerpt", not "a bad excerpt".
 */
const MIN_EXCERPT_CHARS = 40;

/**
 * @param {string} body The record's raw body, frontmatter already stripped.
 * @returns {string | null} The article's first prose paragraph, or null.
 */
export function docExcerpt(body) {
  if (!body) return null;

  /* Translator notes live in HTML comments at the top of every authored ES
     file. They are addressed to whoever edits the file, never to a reader, so
     they are removed before anything else looks at the text. */
  const withoutComments = body
    .replace(/<!--[\s\S]*?-->/g, '')
    /* The same notes, in the spelling `.mdx` requires. A converted record
       carries its explanation as a JSX comment rather than an HTML one, and it
       is addressed to the same reader: whoever edits the file, never a
       visitor. Stripped before anything else looks at the text, for the same
       reason and in the same breath as the HTML form above. */
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

  for (const rawLine of withoutComments.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (STRUCTURAL.some((re) => re.test(line))) continue;

    const text = toPlainText(line);
    /* Requires a letter, not just length: a line of punctuation or numbers
       clears a character count and still says nothing. Unicode-aware so the
       Spanish articles are judged by the same rule as the English ones. */
    if (text.length >= MIN_EXCERPT_CHARS && /\p{L}/u.test(text)) return text;
  }

  return null;
}
