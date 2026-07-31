/** Stable presentation variants for `patterns/PaperPhrase`. */
import { hash } from './mark.mjs';

const WORD = /\p{L}|\p{N}/u;

/** Same seed, same word treatment — never runtime randomness. */
export function paperPhraseWords(text, seed) {
  return String(text)
    .split(/(\s+)/)
    .filter((token) => !/^\s*$/u.test(token))
    .map((token, index) => {
      const value = hash(`${seed}:${index}:${token}`) >>> 7;
      const style = !WORD.test(token)
        ? 'plain'
        : ['plain', 'paper', 'press', 'italic'][value % 4];
      // Highlighted words stay level. Apart from matching the visual rule, this
      // avoids a separate transformed layer for every moving paper fragment.
      return { token, style };
    });
}
