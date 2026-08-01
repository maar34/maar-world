/**
 * patterns/mark — which word is marked, and which frozen variant it gets.
 *
 * The spec's folder map says "mark logic lives in patterns/mark and nowhere
 * else — no component reaches for a tilt or a pigment field directly". This
 * file is the *choosing* half of that; `src/styles/mark.css` is the *drawing*
 * half. Nothing here emits a colour, an angle or a length: it emits class
 * names, and the stylesheet owns every value.
 *
 * That split matters because a heading is marked in two different places — the
 * Astro route renders a card's `<h1>` from `card_title`, while every migrated
 * page's `<h1>` is written by `scripts/migrate-pages.mjs` into generated
 * markdown. Both import this module, so there is one rule about which word gets
 * marked, not two that drift.
 *
 * FROZEN, NOT RANDOM. The spec: "chosen per instance and then frozen".
 * `GlyphRun.astro` already demonstrates the shape — derive from a seed with
 * FNV-1a rather than from `Math.random`, so there is no state to persist and a
 * heading cannot reshuffle on re-render or on navigating back. Same seed, same
 * mark, forever.
 */

/** FNV-1a. Small, stable, and not sensitive to the platform's string hashing. */
export function hash(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(input).length; i += 1) {
    h ^= String(input).charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * A seeded 0..n-1, taken from the middle of the hash rather than the bottom.
 *
 * FNV-1a's low bits are the weak end — the final multiply leaves them leaning
 * on the last byte or two of the input — so `hash(x) % 4` over a set of similar
 * strings does not come out flat. Measured on the 59 marked headings, `% 4`
 * straight off the hash put 25 of 37 cut words into two of the four tilt
 * variants, and correlated tilt with tear because both were reading nearly the
 * same bits. `GlyphRun.astro` already shifts before its modulo for this reason;
 * this is the same fix, with a different shift per axis so two draws from one
 * seed are independent.
 */
function pick(seed, salt, n, shift) {
  return ((hash(`${seed}:${salt}`) >>> shift) % n) + 1;
}

/**
 * Words a mark must not land on.
 *
 * A cut word is the heading's subject lifted out and pasted back — 4a marks
 * `place`, `exoplanets`, `lab`, `world`, `human`, `sky`, `card`, every one a
 * concrete noun. Marking `the` or `with` would read as a slip rather than as a
 * choice, so the function words are excluded outright. Spanish is here because
 * ten `/lab/es/*` articles are Spanish and their headings are too.
 */
const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'are',
  'was', 'were', 'has', 'have', 'had', 'its', 'our', 'your', 'you', 'not',
  'but', 'all', 'any', 'can', 'how', 'why', 'what', 'when', 'where', 'who',
  'into', 'than', 'then', 'they', 'them', 'their', 'will', 'out', 'off',
  'over', 'under', 'more', 'most', 'some', 'such', 'also', 'one', 'two',
  'per', 'via', 'about', 'been', 'being', 'does', 'each', 'only', 'other',
  // Spanish
  'del', 'las', 'los', 'una', 'uno', 'por', 'para', 'como', 'que', 'con',
  'sin', 'sus', 'este', 'esta', 'esto', 'entre', 'sobre', 'desde', 'pero',
  'todo', 'toda', 'todos', 'todas', 'ser', 'son', 'era', 'muy', 'más',
]);

/** Letters, plus the apostrophe and hyphen that sit *inside* a word. */
const WORD_CORE = /^[\p{L}][\p{L}'’-]*[\p{L}]$|^[\p{L}]+$/u;

/**
 * The four torn-paper edges, and the four angles.
 *
 * Both sets are counts, not values — `mark.css` holds the polygons and the
 * degrees. Four of each because the spec's own tilt set is four values, so if
 * the owner settles the tilt question by keeping the spec's numbers it is a
 * value swap in one file and not a change of shape here.
 */
const TEARS = 4;
const TILTS = 4;

/**
 * Is this token something a mark may land on?
 *
 * Punctuation is stripped before the test and restored after, so `deck.` is
 * eligible and only `deck` is wrapped — 4a never puts a full stop inside the
 * cream field.
 */
function eligible(word) {
  if (word.length < 3) return false;
  if (!WORD_CORE.test(word)) return false;
  return !STOPWORDS.has(word.toLowerCase());
}

/**
 * The letters at the heart of a token — `Skylight` out of `Skylight.1`.
 *
 * Used to DECIDE whether a token may be marked, and never to decide what gets
 * wrapped: a mark always wraps the whole whitespace-delimited token, punctuation
 * and all. Wrapping only the core would split a token across a tag boundary, and
 * a tag boundary is a word boundary to anything that reads the built HTML with a
 * regex — `verify-content.mjs` replaces every tag with a space, so
 * `<span>Skylight</span>.1` reads as "Skylight .1" and the assertion that the
 * page still carries the heading "Skylight.1" fails. It found three real cases
 * on the first run.
 *
 * Marking the whole token is also the more honest reading of 4a, whose seven cut
 * words are each a complete token — the mockup never tears a word in half and
 * leaves its punctuation outside the paper.
 */
function core(token) {
  const m = /^[^\p{L}]*(.*?)[^\p{L}]*$/su.exec(token);
  return m ? m[1] : token;
}

/**
 * Which word, and which mark.
 *
 * Word choice is **longest eligible word, ties broken by the seed**, not a
 * seeded pick over all of them. That is a deliberate difference from
 * `GlyphRun`, whose glyphs carry no meaning and so may be picked freely: a
 * mark lands on a word a reader sees, and the longest word in a lowercase
 * heading is nearly always its subject. Checked against 4a's seven cut words,
 * the rule reproduces four of them exactly (`place`, `exoplanets`, `lab`,
 * `human`) and picks a defensible neighbour in the other three. A uniform
 * random pick reproduces none of them reliably and lands on `in`, `the` and
 * `at` about as often as on the noun.
 *
 * Returns `null` when the heading offers nothing to mark — an unmarked heading
 * is correct, and inventing a mark on `# FAQ` is not.
 */
export function chooseMark(text, seed) {
  const tokens = String(text).split(/(\s+)/);
  const candidates = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (/^\s*$/.test(tokens[i])) continue;
    const word = core(tokens[i]);
    if (eligible(word)) candidates.push({ index: i, core: word });
  }
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const c of candidates) {
    if (c.core.length > best.core.length) best = c;
    else if (c.core.length === best.core.length) {
      // A tie is where the seed gets its say, so two headings with the same
      // shape do not both mark their first long word.
      if (hash(`${seed}:${c.core}`) > hash(`${seed}:${best.core}`)) best = c;
    }
  }

  /**
   * Cut or highlight, weighted two to one.
   *
   * 4a carries seven cut words against three distinct highlights, and the cut
   * word is the signature — it is the thing the owner means by the language.
   * An even split would make the page read as two treatments competing rather
   * than one with a quieter relative.
   *
   * ONE EXCEPTION, and it is the owner's call after seeing the first build:
   * a highlight on a heading with only one word paints the entire heading, and
   * it stops reading as a marked word and starts reading as a badge. `/lab`,
   * whose `<h1>` is the single word "lab", was the case that showed it.
   *
   * So a one-word heading takes the cut word instead of the highlight. It is
   * the right way round rather than an escape hatch: a highlight is a stroke
   * laid *over* running text and needs text either side of it to read as one,
   * while a cut word is a clipping that is complete on its own — 4a's own `sky`
   * and `lab` are exactly that. The heading still gets a mark; it gets the mark
   * that survives being the whole line.
   */
  const alone = candidates.length === 1;
  const kind = !alone && pick(seed, 'kind', 3, 7) === 1 ? 'highlight' : 'cut';

  return {
    index: best.index,
    word: best.core,
    kind,
    // Highlights are never tilted and never torn: the spec says mark.highlight
    // is "always horizontal", and gives it a flat field with no radius.
    tilt: kind === 'cut' ? pick(seed, 'tilt', TILTS, 11) : 0,
    tear: kind === 'cut' ? pick(seed, 'tear', TEARS, 19) : 0,
  };
}

/**
 * A strict roman numeral, and only in the canonical subtractive spelling.
 *
 * Deliberately strict rather than "a run of the letters i v x l c d m": every
 * card title in the collection ends in one of `I`–`XI`, but `WildCard` ends in
 * a `d` and `SkySounds` in an `s`, and a loose test stamps the tail of an
 * ordinary word. The lookahead rejects the empty match that the three optional
 * groups would otherwise allow.
 */
const ROMAN = /^(?=[ivxlcdm])m*(c[md]|d?c{0,3})(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/i;

/**
 * patterns/mark — the stamp. Which text a card's cover gets stamped with.
 *
 * The stamp is 4a's fourth mark: meta text in a heavy border, tilted hard,
 * reading as a rubber stamp or a hand-numbered edition. 4a uses it for `i / xii`
 * and for a timecode; `.agents/skills/maar-visual-language/SKILL.md` asks for it on "the card
 * pages' suit/number line — `i / xii` is literally what those pages carry".
 *
 * THE NUMBER IS ALREADY IN THE TITLE. `card_title` is `Card IV`, so the edition
 * numeral needs no new field, no denominator and no counting of records: it is
 * the last token of a title that has more than one. Returning `null` for
 * anything else is the point — `WildCard` is one token and is not an edition,
 * and a card without a numeral gets no stamp rather than an invented one.
 *
 * Lowercased because the whole design is lowercase, and because 4a's own stamps
 * are `i / xii` and `nfc`.
 *
 * NOTE ON PLACEMENT, because the doc's suggestion cannot be followed literally:
 * the suit/number line is a LABEL line, and the spec's rules-of-use table gives
 * "body, ui, labels, captions" no marks at all. The same rule is why the glyph
 * runs were moved out of that line and into the `<h1>`. The stamp therefore goes
 * to the nearest level that permits a mark and has an unused budget — the card
 * cover, where the table allows two marks and a tilt and where `4b` draws a
 * stamp in exactly that corner. The `<h1>` is already at its two.
 */
export function stampText(cardTitle) {
  const tokens = String(cardTitle || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (!ROMAN.test(last)) return null;
  return last.toLowerCase();
}

/**
 * How many angles a scattered deck draws from. `card.css` owns every value.
 *
 * SIX RATHER THAN THE MARK'S FOUR. A cut word is one object in a line and four
 * angles are plenty; a card grid puts thirty-four objects on screen at once,
 * and with four you see the repeat — three cards leaning identically in a row
 * reads as a rendering fault rather than as a hand.
 */
const CARD_TILTS = 6;

/**
 * The angle a card holds. A class name, never an angle.
 *
 * ONE angle per card, used two ways: the default arrangement rests square and
 * takes it on hover, the deck rests at it and squares up on hover. card.css
 * owns which, and tokens.css owns both magnitudes.
 *
 * The salt stays `card-tilt` even though the class is now `card--lean-`: it is
 * the input to the hash, so changing it would re-roll every card's angle across
 * the whole site for no reason other than a rename.
 *
 * This lives here and not in the component for the reason stated at the top of
 * this file: "mark logic lives in patterns/mark and nowhere else — no component
 * reaches for a tilt directly". It is the same idea as the cut word, applied to
 * the whole sheet instead of one clipping out of it — `mark.css` puts it best,
 * "paper does not land square".
 *
 * FROZEN, NOT RANDOM, exactly like every other choice in this module. The seed
 * is the card's own outputPath, so a given card leans the same way in every
 * build and on every visit. `Math.random()` here would reshuffle the whole grid
 * on a back-navigation, which is the one thing a deck laid on a table must not
 * do.
 *
 * THE SHIFT IS MEASURED, NOT PICKED. `pick`'s own note says FNV-1a's low bits
 * lean on the last bytes of the input, and these seeds are the worst case for
 * that: thirty-four paths identical but for a two-digit number and a roman
 * numeral near the end. Shift 23 put 12 of the 34 on one angle and leaned the
 * whole deck left — visible immediately, because a scatter with a bias is not a
 * scatter. Every shift 0–26 was counted over the real seeds; 10 is the flattest
 * (6/4/6/4/6/8, chi-square 2.0 against 9.1 at 23) and it also splits 16 left to
 * 18 right, which is the property that actually matters on screen.
 */
export function cardTiltClass(seed) {
  return `card--lean-${pick(seed, 'card-tilt', CARD_TILTS, 10)}`;
}

/** The class list for a chosen mark. No values — `mark.css` owns those. */
export function markClass(choice) {
  if (choice.kind === 'highlight') return 'mark mark--highlight';
  return `mark mark--cut mark--tilt-${choice.tilt} mark--tear-${choice.tear}`;
}

/**
 * Wrap one word of a plain-text heading in its mark.
 *
 * Returns the text unchanged when there is nothing to mark, and **refuses to
 * touch a heading that already contains markup**: this runs over generated
 * bodies whose headings may carry a glyph run or an anchor, and wrapping a word
 * inside unknown markup is how you produce mis-nested tags. An unmarked heading
 * is a correct heading.
 *
 * The accessible name is unchanged by construction — a `<span>` contributes its
 * text content and nothing else, so the heading still announces exactly the
 * words it did before.
 */
export function markHeadingText(text, seed) {
  if (/[<>&]/.test(text)) return { html: text, choice: null };
  const choice = chooseMark(text, seed);
  if (!choice) return { html: text, choice: null };

  const tokens = String(text).split(/(\s+)/);
  tokens[choice.index] = `<span class="${markClass(choice)}">${tokens[choice.index]}</span>`;
  return { html: tokens.join(''), choice };
}
