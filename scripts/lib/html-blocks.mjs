/**
 * Finding a `<div>` region by class name, correctly.
 *
 * This lived inside `lib/carousel.mjs` and now has a second consumer
 * (`lib/home-family.mjs`), so it moved here rather than being written twice.
 * That matters more than tidiness: the comment on `matchingDivEnd` records a
 * bug that a naive version of this shipped, and a copy-paste of the *naive*
 * version is exactly what a second author would write. One implementation, one
 * place to be right.
 */

/**
 * The index just past the `</div>` that closes the `<div …>` starting at
 * `open`.
 *
 * Depth-counted, and that is the whole point of it existing. The first version
 * of the carousel transform used
 * `<div class="swiper__wrapper">([\s\S]*?)</div>\s*</div>` and a non-greedy
 * match stops at the first `</div></div>` it meets — which, inside a slide that
 * holds an image AND a caption div, is the caption's. It converted 2 of 6
 * carousels and left 28 slides behind, silently, because the output was still
 * valid HTML.
 */
export function matchingDivEnd(html, open) {
  let depth = 0;
  let i = open;
  for (;;) {
    const next = html.slice(i).search(/<\/?div\b/);
    if (next === -1) return -1;
    i += next;
    const closing = html.startsWith('</div', i);
    depth += closing ? -1 : 1;
    const tagEnd = html.indexOf('>', i);
    if (tagEnd === -1) return -1;
    i = tagEnd + 1;
    if (depth === 0) return i;
  }
}

/**
 * Every `<div>` region whose class list CONTAINS `className`.
 *
 * By token, not by exact attribute string. Nine of the 38 carousel slides are
 * `class="swiper__slide orb-slide"` — the theme's own modifier — and an
 * exact-string matcher silently left every one of them stacked while reporting
 * five carousels built. A class attribute is a list; matching it as an opaque
 * string is matching the wrong thing.
 *
 * Regions nested inside a region already returned are skipped, so the result is
 * always a flat set of siblings.
 */
export function blocks(html, className) {
  const out = [];
  const token = new RegExp(`(^|\\s)${className}($|\\s)`);
  for (const m of html.matchAll(/<div\b[^>]*>/g)) {
    const cls = /class="([^"]*)"/.exec(m[0]);
    if (!cls || !token.test(cls[1])) continue;
    const start = m.index;
    if (out.some((b) => start < b.end)) continue; // nested inside one already taken
    const end = matchingDivEnd(html, start);
    if (end === -1) continue;
    out.push({ start, end, inner: html.slice(start + m[0].length, end - '</div>'.length) });
  }
  return out;
}

/**
 * Remove regions from `html`, back to front so earlier offsets stay valid.
 *
 * Front to back is the version that looks right and is wrong: every removal
 * shifts every later index by the length of what was cut, and the second splice
 * lands in the middle of an element. Taking them in reverse means no index is
 * ever stale.
 */
export function cutBlocks(html, regions) {
  let out = html;
  for (const r of [...regions].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}
