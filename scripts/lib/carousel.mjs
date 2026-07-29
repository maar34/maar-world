/**
 * The dead theme's photo swiper, rebuilt as ui/carousel — spec §06.
 *
 * Five pages carry 38 `.swiper__slide` elements. The swiper's JavaScript is
 * gone, because MW-7 allows application JavaScript on exactly one page, so
 * those slides have simply STACKED ever since: the home page shows eleven
 * photographs one under another with a caption between each. That is what the
 * owner meant by "the images go into carousels, they do not go into a sequence
 * of images — this changed a lot the navigation".
 *
 * WHY THE MIGRATION AND NOT A STYLESHEET. The spec's accessibility section asks
 * for "a labelled group with aria-roledescription='carousel', slides as list
 * items, the counter in a polite live region". Those are elements and
 * attributes; CSS cannot add a role, a live region or a list. Styling the
 * theme's div soup would have produced something that looked like a carousel
 * and announced as nothing. This is the second of the two routes the ledger
 * recorded for dead theme names — change what the migration emits — and it is
 * the right one whenever the fix is structural rather than visual.
 *
 * A separate module, not a function inside migrate-pages.mjs, for one practical
 * reason: importing that script RUNS the whole migration, so a selftest case
 * could not exercise the transform without regenerating 95 content records.
 * `lib/headings.mjs` and `lib/html-text.mjs` are split out for the same reason.
 */

/**
 * The index just past the `</div>` that closes the `<div …>` starting at
 * `open`.
 *
 * Depth-counted, and that is the whole point of it existing. The first version
 * of this transform used `<div class="swiper__wrapper">([\s\S]*?)</div>\s*</div>`
 * and a non-greedy match stops at the first `</div></div>` it meets — which,
 * inside a slide that holds an image AND a caption div, is the caption's. It
 * converted 2 of 6 carousels and left 28 slides behind, silently, because the
 * output was still valid HTML.
 */
function matchingDivEnd(html, open) {
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
 * By token, not by exact attribute string. Nine of the 38 slides are
 * `class="swiper__slide orb-slide"` — the theme's own modifier — and an
 * exact-string matcher silently left every one of them stacked while reporting
 * five carousels built. A class attribute is a list; matching it as an opaque
 * string is matching the wrong thing.
 */
function blocks(html, className) {
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
 * Rewrite every populated `.swiper__wrapper` into the spec's carousel.
 *
 * Content-agnostic about what a slide holds: three of the 38 are `<video>`
 * rather than `<img>`, and every child is carried over untouched. Nothing is
 * dropped, so `verify:content`'s per-page image count and text floor are
 * unchanged by construction.
 *
 * An empty wrapper is left exactly as it was — /orbiters has one, and a
 * carousel of nothing is not a carousel.
 */
export function swiperToCarousel(html, { label = 'photographs', idPrefix = 'carousel' } = {}) {
  const wrappers = blocks(html, 'swiper__wrapper');
  if (wrappers.length === 0) return html;

  let out = '';
  let cursor = 0;
  let n = 0;

  for (const wrapper of wrappers) {
    const slides = blocks(wrapper.inner, 'swiper__slide');
    if (slides.length === 0) continue;

    n += 1;
    const id = `${idPrefix}-${n}`;

    const items = slides.map((slide, i) => {
      let body = slide.inner;
      let caption = '';
      const caps = blocks(body, 'slide-caption');
      if (caps.length > 0) {
        caption = caps[0].inner.trim();
        body = body.slice(0, caps[0].start) + body.slice(caps[0].end);
      }
      const media = `<div class="carousel__frame">${body.trim()}</div>`;
      const figure = caption
        ? `<figure class="carousel__figure">${media}<figcaption class="carousel__caption">${caption}</figcaption></figure>`
        : media;
      return `<li class="carousel__slide" id="${id}-${i + 1}">${figure}</li>`;
    });

    const controls = slides
      .map(
        (_, i) =>
          `<li><a class="carousel__control" href="#${id}-${i + 1}" aria-label="go to slide ${i + 1} of ${slides.length}">${i + 1}</a></li>`,
      )
      .join('');

    const carousel =
      `<section class="carousel" aria-roledescription="carousel" aria-label="${label}">` +
      `<ul class="carousel__track" role="list">${items.join('')}</ul>` +
      `<div class="carousel__chrome">` +
      `<ul class="carousel__controls" role="list">${controls}</ul>` +
      `<p class="carousel__counter" aria-live="polite">${slides.length} slides</p>` +
      `</div>` +
      `</section>`;

    out += html.slice(cursor, wrapper.start) + carousel;
    cursor = wrapper.end;
  }

  return out + html.slice(cursor);
}
