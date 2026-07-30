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
 * `blocks`, and the depth-counted `matchingDivEnd` underneath it, were defined
 * here and now live in `lib/html-blocks.mjs` — `lib/home-family.mjs` needs the
 * same region finder, and the comment recording the bug a naive version of it
 * shipped travels with the code rather than being left behind here.
 */
import { blocks } from './html-blocks.mjs';

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

    /**
     * NO CONTROLS, NO ON-PAGE COUNTER — and this is a correction, not a
     * simplification. The first version emitted a row of numbered links per
     * carousel plus a "11 slides" line, and it looked exactly as bad as that
     * sounds: eleven numbered boxes under every gallery. The owner's words were
     * "we have numbers, we have numbers everywhere".
     *
     * The mistake underneath was drawing a CONSTRAINT on the page. Controls and
     * a counter exist in the spec because a JavaScript carousel needs them to be
     * operable and to say where you are. This one is a native scroll region: it
     * is already operable by swipe, trackpad, scrollbar and — because the track
     * is focusable — arrow keys. Adding eleven links to re-state that was
     * chrome apologising for a limitation nobody had noticed.
     *
     * The count still exists where it is useful and invisible: in the group's
     * accessible name. A screen reader hears "11 photographs, carousel"; the
     * page shows photographs.
     */
    const carousel =
      `<section class="carousel" aria-roledescription="carousel" aria-label="${slides.length} ${label}">` +
      `<ul class="carousel__track" role="list" tabindex="0">${items.join('')}</ul>` +
      `</section>`;

    out += html.slice(cursor, wrapper.start) + carousel;
    cursor = wrapper.end;
  }

  return out + html.slice(cursor);
}
