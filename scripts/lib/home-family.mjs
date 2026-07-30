/**
 * The home page, read out of the dead theme's markup as page family 01.
 *
 * §08 of the spec gives family 01 one sentence — "one feature card, then three
 * entry cards. no sidebar." — and the home body already holds exactly that,
 * spelled in the Jekyll theme's vocabulary:
 *
 *   .hero--dark        an h2, a paragraph and a call to action   → card.feature
 *   .wip-card  × 3     an h3, a paragraph and a link             → card.entry
 *
 * So this is not a rewrite of the home page's content. It is the same content,
 * read as the structure it always was, and handed to `patterns/card` as props.
 * The owner's question about the carousel — "do we need to invent it again?" —
 * is the same question here, and the answer is the same: compose the component.
 *
 * WHY EXTRACT RATHER THAN TRANSCRIBE. `HOME_SLIDES` in migrate-pages.mjs is a
 * literal table typed out from a Jekyll loop, and it is the shape of defect this
 * repository has shipped three times: a correspondence held between two files by
 * hand with nothing asserting the two agree. Reading the copy out of the body —
 * and then removing the region it came from, so it renders once — has no
 * correspondence to keep. Every region this expects is also reported when it is
 * missing, so a legacy body that changes shape fails loudly instead of quietly
 * dropping the home page's hero.
 *
 * The route decides layout; this decides only what the pieces ARE.
 */

import { blocks, cutBlocks } from './html-blocks.mjs';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/** Visible text of a fragment: tags out, the entities this corpus uses decoded. */
const text = (html) =>
  collapse(
    String(html)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"'),
  );

const firstTag = (html, tag) => {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
  return m ? m[1] : null;
};

/**
 * The one link inside a region, as a destination and a label.
 *
 * A card is one link target, so the anchor does not survive as an anchor — the
 * whole card becomes it. What the anchor said ("collect", "visit", "read") is
 * kept as the card's meta line, because it is the only place the body ever said
 * what following the link would do.
 */
function actionOf(html) {
  const m = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (!m) return null;
  return { href: m[1], label: text(m[2]).toLowerCase() };
}

/** A paragraph with its call-to-action anchor taken out of it. */
const proseOf = (html) => text(String(html).replace(/<a\b[\s\S]*?<\/a>/gi, ' '));

/**
 * `.rot-line` spans, in order.
 *
 * The theme animated these one at a time; with no JavaScript every one of them
 * renders at once, which is why the home page currently prints its statement
 * and then the words "work in progress" in twenty languages as a single run-on
 * paragraph. They are content, so they are carried — as a list of strings the
 * route can set as lines, rather than as a paragraph that reads as a mistake.
 */
const rotLines = (html) =>
  [...String(html).matchAll(/<span\b[^>]*class="[^"]*\brot-line\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => text(m[1]))
    .filter(Boolean);

/**
 * Read family 01 out of the home body.
 *
 * Returns the fields the record gains, the body with those regions removed —
 * so nothing renders twice — and a problem for every region that was expected
 * and not found.
 *
 * @param {string} body  the home body, after the swiper has become a carousel
 *                       and the `<h1>` has been marked
 * @param {object} opts
 * @param {string} opts.cover  root-relative path for the feature card's cover
 */
export function extractHomeFamily(body, { cover } = {}) {
  const problems = [];
  const fields = { family: 'home' };
  const cuts = [];

  /**
   * The `<h1>`, lifted out of the prose.
   *
   * Family 01 puts the page title and its statement above the feature card, and
   * everything below them is components rather than prose — so the heading
   * cannot stay inside the body that renders after them. It is carried as HTML
   * because the migration has already marked one of its words: `# Maar <span
   * class="mark mark--cut …">World</span>`. Re-deriving the mark in the route
   * would roll it a second time from the same seed for no reason.
   */
  const h1 = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
  if (h1) {
    fields.headingHtml = h1[1];
    body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length);
  } else {
    problems.push('index: no <h1> to lift into the family 01 page header');
  }

  // The three `.hero` regions, told apart by the rotator or the modifier each
  // one carries rather than by their order in the file.
  const heroes = blocks(body, 'hero');
  const statement = heroes.find((h) => /rotator--single/.test(h.inner));
  const wip = heroes.find((h) => /rotator--wip/.test(h.inner));
  const featureBlock = heroes.find((h) => /<h2\b/i.test(h.inner) && !/rotator/.test(h.inner));

  if (statement) {
    const lines = rotLines(statement.inner);
    if (lines.length) {
      fields.lede = collapse(lines.join(' '));
      cuts.push(statement);
    } else {
      problems.push('index: the statement hero carries no .rot-line spans');
    }
  } else {
    problems.push('index: no statement hero to read the lede from');
  }

  if (wip) {
    const lines = rotLines(wip.inner);
    if (lines.length) {
      /**
       * "work in progress" and its nineteen translations. The first is the
       * label the three entry cards sit under — the theme's own reading of
       * them, since this rotator introduced exactly those three cards — and the
       * rest are the same words in other languages, which is the whole of what
       * they are.
       */
      fields.tonguesLabel = lines[0];
      fields.tongues = lines.slice(1);
      cuts.push(wip);
    } else {
      problems.push('index: the work-in-progress hero carries no .rot-line spans');
    }
  } else {
    problems.push('index: no work-in-progress hero to read the entry label from');
  }

  if (featureBlock) {
    const title = firstTag(featureBlock.inner, 'h2');
    const para = firstTag(featureBlock.inner, 'p');
    const action = actionOf(featureBlock.inner);
    if (title && para && action) {
      /**
       * Case is kept as written. Lowercase is a styling decision the reset
       * makes — "markup keeps normal capitalisation so screen readers don't
       * spell words out" — and `verify:content` asserts this exact string,
       * capital and all, because production served it.
       */
      fields.feature = {
        title: text(title),
        excerpt: proseOf(para),
        href: action.href,
        meta: action.label,
      };
      if (cover) fields.feature.cover = cover;
      cuts.push(featureBlock);
    } else {
      problems.push('index: the feature hero is missing its heading, prose or action');
    }
  } else {
    problems.push('index: no feature hero to build card.feature from');
  }

  const wipCards = blocks(body, 'wip-card');
  const entries = [];
  for (const c of wipCards) {
    const title = firstTag(c.inner, 'h3');
    const para = firstTag(c.inner, 'p');
    const action = actionOf(c.inner);
    if (!title || !para || !action) {
      problems.push(`index: a .wip-card is missing its heading, prose or link (${text(c.inner).slice(0, 40)})`);
      continue;
    }
    entries.push({ title: text(title), excerpt: proseOf(para), href: action.href, meta: action.label });
    cuts.push(c);
  }

  /**
   * Three, because the spec says three. A fourth would not be a family 01 page,
   * and silently rendering four is how a skeleton stops being one.
   */
  if (entries.length === 3) {
    fields.entries = entries;
  } else {
    problems.push(`index: family 01 wants three entry cards, the body offers ${entries.length}`);
  }

  return { body: cutBlocks(body, cuts).replace(/\n{3,}/g, '\n\n').trim(), fields, problems };
}
