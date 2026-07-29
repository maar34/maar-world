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
