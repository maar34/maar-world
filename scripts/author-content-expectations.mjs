#!/usr/bin/env node
/**
 * Author verify/content-expectations.json (MW-7 / MW-8).
 *
 * The design is new, so visual diffing against production is meaningless. This
 * is what replaces it: per page, the headings, the body length, the images, the
 * embeds and the external links that must still be there. "The page exists but
 * half the content vanished" is the failure mode it exists to catch.
 *
 * ── Why this script was rewritten ─────────────────────────────────────────────
 *
 * The previous version filtered every candidate heading through the build:
 *
 *     if (builtText.includes(h)) headings.push(h); else missed.push(...)
 *
 * A heading absent from the build was therefore absent from the expectation
 * file, so verify:content could not fail on it. The assertion set was filtered
 * by the thing it asserts. 55 of 95 pages ended up asserting zero headings —
 * every Collect card page, /lab, /tree, /resume, /eng-feedback, /helix-diagram
 * among them — and `minTextLength` was 90% of the *build*, a floor under the
 * migrated page rather than the production one, so it could never detect that
 * the migration had lost text. Multiple content regressions shipped green.
 *
 * Nothing in this file now reads dist/ to decide what to assert. dist/ is read
 * only at the end, to print an audit of which assertions the current build does
 * not satisfy. Deleting dist/ changes the audit output and not one expectation.
 *
 * ── Where the expectations come from ──────────────────────────────────────────
 *
 * `routes/manifest.production.json` carries a real fingerprint per production
 * route: headings, imageCount, iframeCount, outboundLinks, textLength,
 * textSha256. That is the authority.
 *
 * The manifest fingerprint is whole-page, though: it includes the legacy theme's
 * header, nav, sidebar, footer, Disqus section and cookie banner, none of which
 * was ported. Asserting it verbatim would assert chrome. So the read-only legacy
 * `_site/` builds one directory up are used as a secondary baseline: they
 * reproduce production's `textSha256` exactly for 275 of the 307 production page
 * routes, which makes them production's own HTML for those pages. The chrome
 * regions are removed from that HTML by name — see CHROME below — and the
 * fingerprint is recomputed on what is left. Every page records which regions
 * were removed and why, so a reader can see what is not being asserted.
 *
 * Where the legacy build does not reproduce production byte-for-byte the page is
 * still used, and marked `legacy-site-approximate` with both lengths recorded.
 * Where no legacy file exists at all the page falls back to the whole-page
 * manifest fingerprint, marked `manifest-whole-page`, and says so.
 *
 * ── The only things deliberately not asserted ─────────────────────────────────
 *
 * 1. CHROME — the theme regions listed below, per page, by name.
 * 2. NORMALISATIONS — the three text rules in `normaliseHeading`, applied to
 *    every page and stated in the file.
 * 3. PER-PAGE EXCLUSIONS — the explicit table in EXCLUSIONS, each with a reason
 *    and the ledger entry that decided it. Nothing is filtered out silently:
 *    an exclusion that stops applying is reported as a stale exclusion.
 *
 * `minTextLength` is TEXT_FRACTION of production's *body* length. It is not a
 * floor under the build.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, indexDist, readDistFile } from './lib/artifacts.mjs';
import { resolveRoute } from './lib/routes.mjs';
import { plainText, decodeAttrEntities, comparable } from './lib/html-text.mjs';
import { mainContent } from './verify-content.mjs';

/**
 * Both page sources. `migrated/` is generated, `authored/` is hand-written, and
 * this audit wants every record either way: a page with no production baseline
 * is worth a human look whichever directory it came from.
 */
const PAGE_DIRS = [join(ROOT, 'src/content/migrated'), join(ROOT, 'src/content/authored')];

/** Read-only legacy checkouts. Never written to. */
const LEGACY_SITE = {
  'maar.world': join(ROOT, '..', 'maar.world-site', '_site'),
  'collect.maar.world': join(ROOT, '..', 'collect.maar.world', '_site'),
  'tree.maar.world': join(ROOT, '..', 'tree.maar.world', '_site'),
};

/** Body text must be at least this share of production's body text. */
const TEXT_FRACTION = 0.85;

/**
 * Legacy-theme chrome regions removed before fingerprinting production.
 *
 * Each is a whole element removed with its subtree. These are the parts of the
 * production page that were deliberately not ported, so asserting them would
 * assert a decision already taken rather than the content of the page.
 */
const CHROME = [
  /**
   * `<head>` is not body content, and it was being counted as body text.
   *
   * `plainText()` strips tags but keeps the text INSIDE them, so
   * `<title>Music - MAAR WORLD</title>` contributed 19 characters to what this
   * file called production's *body* length — on all 130 pages. The build side
   * of the same comparison is measured inside `<main>`, which can never contain
   * a `<title>`, so every page's `minTextLength` floor was inflated by the
   * length of its own document title and the comparison was not like for like.
   *
   * It went unnoticed because it only bites where the title is a large share of
   * a short page: `/collect/about` asserted 27 characters of body against a page
   * whose entire body is the word "About", and production's 32 was exactly
   * `"About - COLLECT.MAAR.WORLD"` + `"About"`. Four of the eight text
   * shortfalls were this, to the character.
   *
   * Removed first, before every other region, so nothing below has to reason
   * about head markup.
   */
  ['document-head', 'head', /<head\b[^>]*>/gi,
    'the document <head> — <title> and metadata. plainText() keeps the text inside a tag, so ' +
    'the page title counted as body text on the production side of a comparison whose build ' +
    'side is measured inside <main>. Not body content on either side'],
  /**
   * Material Symbols ligature names, for the reason already stated for headings.
   *
   * `normaliseHeading` has always removed these spans from headings — the first
   * of the three NORMALISATIONS — because `<span class="material-symbols-outlined">
   * speaker_group</span> Bookings` reached a reader as a glyph plus "Bookings",
   * and the font is banned here, so "speaker_group Bookings" is not a string
   * anyone ever saw. The identical span in body copy was left in, and its
   * ligature name counted as body text: `/music` carried a 14-character
   * `nature_people` nobody read, and `/tree/max-network-berlin` six of them.
   *
   * The same argument cannot be true for a heading and false for a paragraph.
   * Applying it to the whole body also makes the heading rule redundant rather
   * than contradicted, which is the direction that leaves both stated.
   */
  ['icon-glyphs', 'span', /<span\b[^>]*material-symbols[^>]*>/gi,
    'Material Symbols icon spans — they reached a reader as a glyph, never as the ligature ' +
    'name in the markup, and the font is banned here. normaliseHeading has always removed ' +
    'them from headings for this reason; body copy was the half that was missed'],
  ['site-header', 'div', /<div\b[^>]*class="[^"]*\bpage__header\b[^"]*"[^>]*>/gi,
    'site header and primary nav — BaseLayout ships no nav; the page shell is MW-11'],
  ['site-footer', 'div', /<div\b[^>]*class="[^"]*\bpage__footer\b[^"]*"[^>]*>/gi,
    'site footer — same MW-11 shell decision'],
  ['sidebar-toc', 'div', /<div\b[^>]*class="[^"]*\bpage__sidebar\b[^"]*"[^>]*>/gi,
    'theme sidebar table of contents — navigation, generated from the headings it lists'],
  ['sidebar-toggle', 'div', /<div\b[^>]*class="[^"]*\bpage__actions\b[^"]*"[^>]*>/gi,
    'the sidebar open/close button — a control, and its label is a Material Symbols glyph'],
  ['aside-toc', 'div', /<div\b[^>]*class="[^"]*\bcol-aside\b[^"]*"[^>]*>/gi,
    'in-article table of contents column — navigation generated from the headings'],
  ['disqus', 'section', /<section\b[^>]*class="[^"]*\bpage__comments\b[^"]*"[^>]*>/gi,
    'Disqus comments mount — a third-party embed the on-load gate forbids'],
  ['cookie-banner', 'div', /<div\b[^>]*id="cookie-notice"[^>]*>/gi,
    'cookie banner and consent panel — their absence is the design (OPERATING-RULES invariant)'],
  ['search-modal', 'div', /<div\b[^>]*class="[^"]*\bpage__search-modal\b[^"]*"[^>]*>/gi,
    'theme search modal — application JavaScript, allowed only in the helix island'],
  ['prev-next', 'div', /<div\b[^>]*class="[^"]*\barticle__section-navigator\b[^"]*"[^>]*>/gi,
    'previous/next article navigator — navigation chrome'],
  ['article-meta', 'div', /<div\b[^>]*class="[^"]*\barticle__info\b[^"]*"[^>]*>/gi,
    'the date and tag chips the theme printed under every title — theme metadata, not page content'],
  ['article-footer-div', 'div', /<div\b[^>]*class="[^"]*\barticle__footer\b[^"]*"[^>]*>/gi,
    'the theme Learn_/Collect_ button pair printed under every article'],
  ['article-footer-el', 'footer', /<footer\b[^>]*class="[^"]*\barticle__footer\b[^"]*"[^>]*>/gi,
    'the theme article footer element — licence and updated-at line'],
];

/**
 * Elements hidden with an inline `display:none`. The theme printed the Jekyll
 * auto-title into `<header style="display:none;"><h1>001_ Maar Sky Sounds.1
 * Card i</h1></header>` on many pages. No reader ever saw it, so it is not
 * content the migration was obliged to keep.
 */
const HIDDEN_OPEN = /<(div|header|section|span|p|ul|ol|nav|aside|figure)\b[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>/i;

const HIDDEN_REASON =
  'elements with an inline display:none — chiefly the theme\'s hidden Jekyll auto-title <h1>, ' +
  'which no reader ever saw';

/**
 * Per-page exclusions. Each states what is not asserted, how much of it, and
 * why. Applied only where it still bites: an exclusion that no longer changes
 * the expectation is printed as stale, so this table cannot rot into a filter
 * that quietly suppresses a new regression.
 */
const EXCLUSIONS = [
  /**
   * THE SNIPPET BLOCK, REMOVED FROM ALL 34 COLLECT CARD PAGES BY THE OWNER.
   *
   * Production printed a heading "Snippet" and, under it, "Please unmute your
   * device and press PLAY ▶️ button. Player optimized for Chrome and Firefox
   * browsers". Every word of that described the play.maar.world player, which
   * these pages no longer carry: 33 of them embed the Maar Orbiter instead, and
   * the Orbiter has its own transport, is not a snippet, and is not
   * Chrome-and-Firefox-only. Keeping the copy would have made the page instruct
   * the visitor to press a button that is not there.
   *
   * Three entries because the block was three assertions — a heading, an
   * outbound link and 108 characters of body text. They are separate so that if
   * the heading came back tomorrow the *other two* would still be enforced.
   *
   * Ledger: MW-9 content/snippet-note-retired.
   */
  {
    url: /^\/collect\/cards\/.+/,
    kind: 'heading',
    value: 'Snippet',
    reason:
      'the "Snippet" heading named the play.maar.world excerpt player. 33 of these pages now ' +
      'embed the full Maar Orbiter, which is not a snippet, so the heading described nothing ' +
      'on the page. Removed by the owner 2026-07-31. Ledger MW-9 content/snippet-note-retired.',
  },
  {
    url: /^\/collect\/cards\/.+/,
    kind: 'link',
    value: 'https://support.apple.com/en-gb/HT208353',
    reason:
      'the Apple "unmute your iPhone" help link, which only existed inside the removed player ' +
      'note. It is not lost content in its own right — it was the note\'s only link, and the ' +
      'note is gone. Ledger MW-9 content/snippet-note-retired.',
  },
  {
    url: /^\/collect\/cards\/.+/,
    kind: 'text',
    count: 108,
    reason:
      'the 108 characters of the removed block, measured with the same plainText() this file ' +
      'fingerprints production with: "Snippet Please unmute your device and press PLAY ▶️ ' +
      'button. Player optimized for Chrome and Firefox browsers". Ledger MW-9 ' +
      'content/snippet-note-retired.',
  },
  {
    url: '/',
    kind: 'text',
    count: 297,
    reason:
      'the ten home-carousel captions were invented migration copy that does not describe the ' +
      'photographs. The owner removed them; the images remain, with empty alt text because no ' +
      'accurate textual alternative is available. This is an intentional content correction, not loss.',
  },
  /**
   * `/collect/cards` had an `images: 34` exclusion here until 2026-07-30. The
   * owner approved self-hosting, the 34 thumbnails are in media/collect/img/cards/
   * as webp, and the grid asserts all 34 again. The exclusion is gone rather
   * than zeroed: this table is a list of things not being checked, and an
   * entry that excludes nothing is the shape a suppression hides in.
   */
  /**
   * THE DISQUS MOUNT THAT IS NOT IN THE DISQUS REGION.
   *
   * `page__comments` is already a named CHROME region, so the theme's comments
   * section is excluded on all 130 pages and always has been. On these eight
   * Lab articles the embed was ALSO pasted into the article body — a
   * `<div id="disqus_thread">` inside `article__content`, above the theme's own
   * mount — so the region strip never reached it and its `<noscript>` fallback
   * link survived into the expectation.
   *
   * It is the same decision as the region, at a different place in the DOM: no
   * Disqus, because a third-party embed firing on page load is what the
   * no-analytics / no-cookie-banner invariant forbids, and the comments were
   * deliberately not ported. One RegExp rather than eight copies — the four
   * articles exist in both languages.
   *
   * Ledger: MW-7 lab/disqus-and-continue-reading.
   */
  {
    url: /^\/lab\/(en|es)\/(dadada|ip-1|ip-2|ip-3)$/,
    kind: 'link',
    value: 'https://disqus.com/?ref_noscript',
    reason:
      'the "comments powered by Disqus" <noscript> fallback link. These eight articles carry ' +
      'the Disqus embed inside the article body as well as in the theme\'s page__comments ' +
      'section, which is already excluded as chrome on every page, so the body copy of it ' +
      'outlived the region strip. Disqus is a third-party embed the on-load gate forbids and ' +
      'the comments were deliberately not ported. Ledger MW-7 lab/disqus-and-continue-reading.',
  },
  /**
   * THE TWO RETIRED FEEDBACK FORMS.
   *
   * Both were a Google Form iframe wrapping out-of-date questions. They are now
   * 200 + instant meta-refresh stubs to /bookings — the house pattern
   * /interplanetary-players already used, and the pattern production itself uses
   * to retire a URL, because a static host cannot serve a true 301. The routes
   * stay `preserve`, so nothing about the contract moved; what went is the
   * embed, on purpose.
   *
   * The ledger entry recording this says the expectation was moved from 1 to 0
   * "with a reason". The reason never reached this table, so both pages have
   * been reported as content loss ever since. It is written down now.
   *
   * Ledger: MW-9 pages/feedback-retired.
   */
  {
    url: '/eng-feedback',
    kind: 'embeds',
    count: 1,
    reason:
      'the Google Form iframe. The form asked out-of-date questions and the page is now a ' +
      '200 + meta-refresh stub to /bookings, which is how production retires a URL on a ' +
      'static host. The form URL is recorded in routes/external-link-removals.json. ' +
      'Ledger MW-9 pages/feedback-retired.',
  },
  {
    url: '/esp-feedback',
    kind: 'embeds',
    count: 1,
    reason:
      'the Google Form iframe — the Spanish half of the same retirement. Ledger MW-9 ' +
      'pages/feedback-retired.',
  },
  {
    url: '/lab/en/ip-orchestra',
    kind: 'images',
    count: 2,
    reason:
      '/img/about/Bruna.jpeg is referenced by production and exists in no read-only ' +
      'checkout — it is a broken image in production too (Ledger MW-7 pages/dead-legacy-img). ' +
      'The MMAT sponsor logo is the other: its Dropbox link answers "File Deleted", so it ' +
      'is broken in production as well and there is nothing to self-host. It is a text ' +
      'credit until the file is supplied. UArtes was the same case and is restored — the ' +
      'owner sent the file 2026-07-31. Ledger MW-6 lab/dead-sponsor-logos.',
  },
  {
    url: '/lab/es/ip-orchestra',
    kind: 'images',
    count: 2,
    reason:
      '/img/about/Bruna.jpeg is referenced by production and exists in no read-only ' +
      'checkout — it is a broken image in production too (Ledger MW-7 pages/dead-legacy-img). ' +
      'The MMAT sponsor logo is the other: its Dropbox link answers "File Deleted", so it ' +
      'is broken in production as well and there is nothing to self-host. It is a text ' +
      'credit until the file is supplied. UArtes was the same case and is restored — the ' +
      'owner sent the file 2026-07-31. Ledger MW-6 lab/dead-sponsor-logos.',
  },
  /**
   * THE LAB'S TEN SPANISH ENTRIES, WHICH MOVED RATHER THAN LEFT.
   *
   * Production's /lab listed all twenty Lab records — ten pieces, each written
   * twice — one after another, with each pair adjacent because the two halves
   * share a date. The owner's instruction of 2026-07-31, in their own words:
   * "if we have English selected we show the English articles, if we have
   * Spanish selected we show the Spanish articles."
   *
   * So page family 02 lists the entries in ITS OWN language. Every one of the
   * ten headings below is now on /es/lab, the Spanish translation of this page,
   * which the header's language chip links to and which `translationOf` in
   * src/content/authored/es/lab.md relates to it. Each Spanish article also
   * remains reachable from its English twin's own language switch, and no URL
   * changed.
   *
   * This is the SECOND entry in this table that records real content leaving a
   * page rather than a check disagreeing with itself — see the home page's ten
   * photographs below. It differs from that one in that the content did not
   * stop being served: it is on another page of this build, and /es/lab has no
   * production baseline only because production had no Spanish Lab index.
   *
   * The text figure is derived, not tuned. Production's /lab body is 5783
   * characters, of which roughly 250 is the heading and statement; the twenty
   * entries are the remaining ~5533, so the ten Spanish ones are ~2766.
   *
   * Ledger: MW-11 design/page-family-02-lab.
   */
  {
    url: '/lab',
    kind: 'heading',
    values: [
      'Helix — Requisitos técnicos',
      'Música, Abstracción y el Retorno al Juego',
      'Música, Acceso y la Mente Humana',
      'Órbitas y Cuerpos',
      'Taller de creación orbital',
      'Taller de creación orbital: Orbiters Orchestra (ES)',
      'Dadada (ES)',
      'Ancestros interplanetarios 3-3 (ES)',
      'Ancestros interplanetarios 2-3 (ES)',
      'Ancestros interplanetarios 1-3 (ES)',
    ],
    reason:
      'the ten Spanish Lab entries. Page family 02 lists an index in its own language, by the ' +
      "owner's instruction of 2026-07-31; all ten are served on /es/lab, the translation of " +
      'this page that the header language chip links to. Content moved, not removed. ' +
      'Ledger MW-11 design/page-family-02-lab.',
  },
  {
    url: '/lab',
    kind: 'text',
    count: 2766,
    reason:
      'the body text of those same ten Spanish entries — title, date, excerpt and tags each. ' +
      "Derived: production's /lab body is 5783 chars, ~250 of it the heading and statement, so " +
      'the twenty entries are ~5533 and the Spanish half ~2766. Same decision as the heading ' +
      'exclusion above; the text is served on /es/lab.',
  },
  /**
   * THE HOME PAGE'S TEN PHOTOGRAPHS.
   *
   * Production's home page carried eleven photographs stacked one under
   * another, which the migration turned into `ui/carousel`. Family 01 replaced
   * that: the spec for a home page is "one feature card, then three entry
   * cards, no sidebar", and `homeMediaSections()` in scripts/lib/home-family.mjs
   * cuts the whole `section-block--photos` / `--videos` region in favour of
   * `patterns/collage-field`. It matches the outer section rather than
   * individual media so the decision stays reversible in one place.
   *
   * Ten, not eleven: `2024_ss-2.jpeg` was PROMOTED to the feature card's cover
   * and is still on the page. The build serves five images — that cover, the
   * collage header and three entry-card covers.
   *
   * THIS IS THE ONE ENTRY IN THIS TABLE THAT RECORDS REAL CONTENT LEAVING A
   * PAGE rather than a check disagreeing with itself, and it is worth the
   * owner's eye: ten photographs of the cards is a substantial thing for a home
   * page to stop showing, and the ledger note on the carousel captions (below)
   * was written when the images were still there and says so.
   *
   * Ledger: MW-11 design/page-family-01-home, design/home-content-is-fields.
   */
  {
    url: '/',
    kind: 'images',
    count: 10,
    reason:
      'ten of production\'s eleven home photographs. Family 01 replaced the photo section with ' +
      'patterns/collage-field — see homeMediaSections() in scripts/lib/home-family.mjs, which ' +
      'cuts the section as a whole. The eleventh, 2024_ss-2.jpeg, is promoted to the feature ' +
      'card cover and is still served. Ledger MW-11 design/page-family-01-home. This one is a ' +
      'design decision about content, not a check artifact — worth re-confirming with the owner.',
  },
  /**
   * PRODUCTION SERVES A BROKEN PAGE HERE AND THE STUB IS THE FIX.
   *
   * Jekyll printed the entire redirect document as ESCAPED VISIBLE TEXT. What
   * production's 148 characters of "body" actually are, in full:
   *
   *   &lt;!DOCTYPE html&gt;&lt;html lang="en"&gt;&lt;head&gt; Redirecting…
   *   &lt;/head&gt;&lt;body&gt; Redirecting to /orbiters …
   *   &lt;/body&gt;&lt;/html&gt;
   *
   * A visitor sees raw markup. Only the 26 characters "Redirecting to /orbiters
   * …" were ever meant to be read, and the build's stub serves exactly that
   * line and performs the redirect properly. The count is the other 122 — the
   * escaped markup and the duplicated title inside the escaped head — measured,
   * not estimated.
   */
  {
    url: '/interplanetary-players',
    kind: 'text',
    count: 122,
    reason:
      'the escaped literal of a redirect document that Jekyll printed as visible text on ' +
      'production — "&lt;!DOCTYPE html&gt;…&lt;/html&gt;" — leaving only the 26 characters ' +
      '"Redirecting to /orbiters …" that a reader was meant to see. The migrated stub serves ' +
      'that line and redirects properly, so this is production\'s defect being fixed, not ' +
      'content lost. Ledger MW-7 sitemap/orbiters-once.',
  },
  /**
   * /subscribe IS RETIRED, AND THE MAILCHIMP FORM IS WHAT WENT.
   *
   * Three entries because the signup was three assertions: the heading, the
   * copy and form, and the outbound eepurl.com action. Separate so that if the
   * heading came back tomorrow the other two would still be enforced.
   *
   * The images exclusion below is older and covers the fourth piece, Mailchimp's
   * eep.io attribution logo — a third-party request on page load, which the
   * no-analytics / no-cookie-banner invariant forbids. Its emptied anchor is the
   * a11y defect recorded under MW-11 a11y/emptied-anchors.
   */
  {
    url: '/subscribe',
    kind: 'heading',
    value: 'Join mail list',
    reason:
      'the Mailchimp signup form\'s own heading. The page is retired to a 200 + meta-refresh ' +
      'stub and there is no form under the heading to name. Ledger MW-11 a11y/emptied-anchors.',
  },
  {
    url: '/subscribe',
    kind: 'text',
    count: 274,
    reason:
      'the Mailchimp signup body, measured with the same plainText() this file fingerprints ' +
      'production with: the "Thank you for subscribing…" blurb, "* indicates required" and the ' +
      '"Email *" field label — 274 characters, the whole of the page apart from its heading. ' +
      'The page is retired; what remains is a stub saying so. Ledger MW-11 a11y/emptied-anchors.',
  },
  {
    url: '/subscribe',
    kind: 'link',
    value: 'http://eepurl.com/if7emL',
    reason:
      'the Mailchimp attribution link. Its only child was the eep.io logo <img>, which cannot ' +
      'be served without a third-party request on page load, and an anchor with no content is ' +
      'a zero-size tab stop — so the anchor went with it rather than shipping empty. Recorded ' +
      'in routes/external-link-removals.json. Ledger MW-11 a11y/emptied-anchors.',
  },
  /**
   * THE /tree CHECKOUT IS AHEAD OF THE FROZEN MANIFEST, SO ITS LENGTH IS WRONG.
   *
   * `/tree` is the one page in the corpus whose `_site` checkout disagrees with
   * `routes/manifest.production.json` on TEXT LENGTH, not merely on hash: 398
   * characters against production's 354. The 44-character difference is the old
   * link-in-bio set — "Orbits and Bodies (IRCAM)", "Explore SkySounds Cards",
   * "Listen to SoundCloud Sets" — which live production no longer serves. The
   * manifest's `outboundLinks` for `tree.maar.world/` lists exactly the four
   * destinations in `TREE_LINKS` and no SoundCloud, and the link half of this is
   * already handled structurally by the manifest intersection above.
   *
   * The count is that measured difference, `legacySiteTextLength -
   * production.textLength`, not a number chosen to make the page pass.
   */
  {
    url: '/tree',
    kind: 'text',
    count: 44,
    reason:
      'the ../tree.maar.world/_site checkout is STALE for this page — 398 characters against ' +
      'the frozen manifest\'s 354, the only page in the corpus where the two disagree on ' +
      'length. The 44 characters are the retired link-in-bio labels the checkout still ' +
      'carries and live production does not. The manifest records the four destinations the ' +
      'build serves. Ledger MW-7 content/residue-is-check-side.',
  },
  {
    url: '/radio',
    kind: 'images',
    count: 1,
    reason:
      'the Mailchimp eep.io logo. Serving it fires a third-party request on page load, ' +
      'which the no-analytics / no-cookie-banner invariant forbids.',
  },
  {
    url: '/subscribe',
    kind: 'images',
    count: 1,
    reason:
      'the Mailchimp eep.io logo. Serving it fires a third-party request on page load, ' +
      'which the no-analytics / no-cookie-banner invariant forbids.',
  },
  {
    url: '/tree',
    kind: 'images',
    count: 1,
    reason:
      'the Tree hub image is hotlinked from herbarium.plantasia.space — a third-party ' +
      'request on page load — and the asset is in no read-only checkout, so it cannot be ' +
      'self-hosted here. Ledger MW-8 tree/sunflower-image (BLOCKED): needs the file or an ' +
      'exception.',
  },
  {
    url: '/collect/cards/034_-maar-sky-sounds-wild-card',
    kind: 'embeds',
    count: 1,
    reason:
      'production\'s only iframe on the wild card is <iframe src=""> — an empty player ' +
      'that loads nothing. There is no embed to preserve.',
  },
];

// ── HTML helpers ─────────────────────────────────────────────────────────────

/**
 * THE function verify:content and freeze-routes use — not a copy of it.
 *
 * This used to be a third byte-identical implementation, and the comment here
 * read "Same text extraction verify:content and freeze-routes.mjs use", which
 * was a claim rather than a guarantee. It matters more here than anywhere:
 * `sha16(stripTags(html)) === prod.route.textSha256` below decides whether a
 * page gets an exact baseline or a weaker fallback, and that comparison is only
 * meaningful if both sides ran the same code.
 */
const stripTags = plainText;

const decodeEntities = decodeAttrEntities;

/**
 * Remove every element matching `openRe`, with its subtree, by counting
 * open/close tags of `tagName`. A regex cannot match balanced tags, and a
 * non-greedy `[\s\S]*?</div>` would stop at the first nested close and leave
 * the rest of the chrome behind — which is how chrome text leaks into a
 * "body-only" figure and quietly inflates the length being asserted.
 */
function stripElement(html, openRe, tagName) {
  let out = html;
  for (let guard = 0; guard < 200; guard += 1) {
    const re = new RegExp(openRe.source, 'gi');
    const open = re.exec(out);
    if (!open) return out;

    const scan = new RegExp(`<(/?)${tagName}\\b`, 'gi');
    scan.lastIndex = open.index + open[0].length;
    let depth = 1;
    let end = out.length;
    let m;
    while ((m = scan.exec(out))) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        const close = out.indexOf('>', m.index);
        end = close === -1 ? out.length : close + 1;
        break;
      }
    }
    out = `${out.slice(0, open.index)} ${out.slice(end)}`;
  }
  return out;
}

/** Remove every inline-hidden element. Returns [html, removedCount]. */
function stripHidden(html) {
  let out = html;
  let removed = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const m = HIDDEN_OPEN.exec(out);
    if (!m) break;
    const before = out.length;
    out = stripElement(out, new RegExp(escapeRe(m[0]), 'g'), m[1]);
    if (out.length >= before) break;
    removed += 1;
  }
  return [out, removed];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The three text rules applied to every production heading, and the only ones.
 *
 * 1. Material Symbols spans. `<h1><span class="material-symbols-outlined">
 *    speaker_group</span> Bookings</h1>` reached a reader as a glyph plus
 *    "Bookings". The font is banned here, so "speaker_group Bookings" is not a
 *    string any reader ever saw. Handled before tag stripping.
 * 2. Markdown emphasis marks left in raw headings.
 * 3. A trailing colon. Production's "Card I:" and the migrated "Card I" are the
 *    same heading; the colon is punctuation joining it to the text below.
 */
const NORMALISATIONS = [
  'material-symbols icon spans removed — they rendered as a glyph, and the font is banned here',
  'markdown emphasis marks (* and `) removed',
  'a single trailing colon removed',
];

function normaliseHeading(inner) {
  const withoutIcons = inner.replace(
    /<span\b[^>]*material-symbols[^>]*>[\s\S]*?<\/span>/gi,
    ' ',
  );
  return stripTags(withoutIcons)
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')
    .trim();
}

/** Fingerprint one page's body — chrome removed, comments removed. */
function bodyFingerprint(html) {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const regions = [];

  for (const [name, tag, re] of CHROME) {
    const before = out.length;
    out = stripElement(out, re, tag);
    if (out.length !== before && !regions.includes(name)) regions.push(name);
  }

  const [visible, hiddenCount] = stripHidden(out);
  out = visible;
  if (hiddenCount) regions.push(`hidden-elements x${hiddenCount}`);

  const headings = [];
  for (const m of out.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const h = normaliseHeading(m[2]);
    if (h && !headings.includes(h)) headings.push(h);
  }

  const links = new Set();
  for (const m of out.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1].trim()).split('#')[0];
    if (/^https?:\/\//i.test(href)) links.add(href);
  }

  const text = stripTags(out);
  return {
    headings,
    images: (out.match(/<img\b/gi) || []).length,
    embeds: (out.match(/<iframe\b/gi) || []).length,
    links: [...links].sort(),
    textLength: text.length,
    excludedRegions: regions,
  };
}

/**
 * Links on the same property. The migration rewrote every one of them to a
 * merged-site path, so the production spelling is not a string the build can
 * contain, and asserting it would assert the merge had not happened.
 */
const OWN_PROPERTY = /^https?:\/\/([a-z0-9-]+\.)*(maar\.world)(\/|$)/i;

// ── Production baseline ──────────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(ROOT, 'routes/manifest.production.json'), 'utf8'));
const policy = JSON.parse(readFileSync(join(ROOT, 'routes/policy.json'), 'utf8'));
const byRoute = new Map(manifest.routes.map((r) => [`${r.origin}${r.url}`, r]));

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Merged-site URL -> the production route that answers it today.
 *
 * Joined through the policy's `servedAt`, percent-decoded on both sides: the
 * Collect card URLs are recorded as `/cards/001_-...card%20I` in the policy and
 * as `.../card I` in the page frontmatter, and the un-decoded join silently
 * missed all 34 of them. Both spellings of a URL are the same document, so the
 * larger fingerprint wins.
 */
const production = new Map();
for (const r of policy.routes) {
  if (r.policy !== 'preserve' || !r.servedAt) continue;
  const prod = byRoute.get(`${r.origin}${r.url}`);
  if (!prod || prod.kind !== 'page' || prod.status !== 200) continue;
  const url = decode(r.servedAt.replace(/\.html$/i, '').replace(/\/index$/, '')) || '/';
  const prev = production.get(url);
  if (!prev || prod.textLength > prev.route.textLength) {
    production.set(url, { route: prod, origin: r.origin, legacyUrl: r.url });
  }
}

/** The legacy build file that answers a production URL, or null. */
function legacyFile(origin, url) {
  const base = LEGACY_SITE[origin];
  if (!base) return null;
  const p = decode(url.split('?')[0].split('#')[0]);
  const candidates =
    p === '/' ? ['index.html'] : p.endsWith('/') ? [`${p.slice(1)}index.html`]
      : [p.slice(1), `${p.slice(1)}.html`, `${p.slice(1)}/index.html`];
  for (const c of candidates) {
    const f = join(base, c);
    try {
      if (statSync(f).isFile()) return f;
    } catch { /* not this candidate */ }
  }
  return null;
}

const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── Author ───────────────────────────────────────────────────────────────────

const usedExclusions = new Set();
const pages = [];

/**
 * The page set is PRODUCTION's, not the migration's.
 *
 * Deriving it from src/content/pages meant a page the migration never wrote had
 * no expectation and therefore could not fail — the same shape of hole as
 * filtering headings through the build. Every URL the policy says is preserved
 * and that production answers with a page gets an entry here, whether or not
 * anything in this repo currently produces it. That is what put the 35 NFC card
 * pages under this check: they are generated from routes/nfc-cards.json rather
 * than from src/content/pages, so a file-driven page set skipped all of them.
 */
for (const url of [...production.keys()].sort()) {
  const prod = production.get(url);
  const file = legacyFile(prod.origin, prod.legacyUrl);
  let baseline = 'manifest-whole-page';
  let fp = null;
  let legacyTextLength = null;

  if (file) {
    const html = readFileSync(file, 'utf8');
    legacyTextLength = stripTags(html).length;
    baseline =
      sha16(stripTags(html)) === prod.route.textSha256
        ? 'legacy-site-exact'
        : 'legacy-site-approximate';
    fp = bodyFingerprint(html);
  }

  /**
   * `url` matches one page as a string, or a set of them as a RegExp.
   *
   * The set form exists because a block removed from all 34 Collect card pages is
   * ONE editorial decision, and writing it out 34 times — 102 entries once the
   * heading, the link and the text are each accounted for — would bury the six
   * genuine one-off exclusions in noise and make the table unreadable, which is
   * the state this whole file exists to prevent. The staleness check below keys
   * on the pattern's source, so a set exclusion that stops applying is still
   * reported exactly like a single one.
   */
  const excl = EXCLUSIONS.filter((e) => (e.url instanceof RegExp ? e.url.test(url) : e.url === url));
  const applied = [];
  const take = (kind, value) => {
    const e = excl.find((x) => x.kind === kind);
    if (!e) return value;
    usedExclusions.add(`${e.url}|${e.kind}`);
    applied.push({ kind, count: e.count, reason: e.reason });
    return Math.max(0, value - e.count);
  };

  /**
   * The same idea for the two assertions that are LISTS rather than counts.
   *
   * `headings` and `links` had no exclusion path at all: `take` subtracts a
   * number, and you cannot subtract a number from "the page must contain this
   * heading". So a heading the owner deliberately removed could only be handled
   * by editing the production manifest — i.e. by lying about what production
   * served — which is the one thing the two meta-checks in verify:content exist
   * to make impossible.
   *
   * `value` names the exact string to stop asserting, and the entry is only
   * marked used if that string was actually there. An exclusion for a heading
   * production never had is reported stale rather than passing silently.
   */
  const drop = (kind, list) => {
    const e = excl.find((x) => x.kind === kind);
    if (!e) return list;
    /**
     * `value` names one string; `values` names a set of them that leave a page
     * together as ONE editorial decision.
     *
     * The set form was added for the Lab, where the ten Spanish entries moved
     * to /es/lab in a single change. Ten separate entries could not express it
     * anyway: this lookup is `find`, so only the first exclusion of a kind per
     * page was ever applied, and the other nine would have been silently
     * ignored — a suppression that looks like a table.
     *
     * ALL of them must still be present, or the exclusion does not apply at
     * all and the check fails. A partially-stale exclusion is the shape a
     * suppression hides in: the entry would go on passing while quietly
     * covering less than it claims.
     */
    const wanted = e.values ?? [e.value];
    if (!wanted.every((v) => list.includes(v))) return list;
    usedExclusions.add(`${e.url}|${e.kind}`);
    applied.push({ kind, value: wanted.join(' | '), reason: e.reason });
    return list.filter((x) => !wanted.includes(x));
  };

  const headings = drop(
    'heading',
    fp ? fp.headings : prod.route.headings.map((h) => normaliseHeading(h)).filter(Boolean),
  );
  /**
   * A link the legacy checkout carries and the FROZEN MANIFEST does not is not
   * production's link. It is a stale checkout.
   *
   * `routes/manifest.production.json` is this file's stated authority, and its
   * `outboundLinks` is a WHOLE-PAGE list — chrome included — so it is a strict
   * superset of any link production's body serves. Intersecting with it can
   * therefore only remove a link production does not serve at all; it can never
   * remove one the body has. That makes it a safe filter rather than a weakening.
   *
   * It exists because of `/tree`, the one page whose `_site` checkout does not
   * even agree with the manifest on length (398 against 354) and whose baseline
   * is `legacy-site-approximate` for that reason. The checkout still carries the
   * OLD link-in-bio set — "Listen to SoundCloud Sets" among it — while the
   * frozen manifest records the four destinations the page serves today, which
   * are exactly the four in `TREE_LINKS`. The build matched production and the
   * baseline did not.
   *
   * Across all 130 pages this drops exactly one assertion, that one. It is
   * written as a rule rather than a per-page exclusion because "assert only what
   * production is recorded as serving" is the property, and a stale checkout is
   * a thing that can happen again to any page.
   */
  const inManifest = new Set(prod.route.outboundLinks || []);
  const checkoutLinks = fp ? fp.links : prod.route.outboundLinks || [];
  const rawLinks = fp ? checkoutLinks.filter((l) => inManifest.has(l)) : checkoutLinks;
  const notInManifest = checkoutLinks.length - rawLinks.length;
  const links = drop('link', rawLinks.filter((l) => !OWN_PROPERTY.test(l)));
  const bodyTextLength = fp ? fp.textLength : prod.route.textLength;
  const assertedTextLength = take('text', bodyTextLength);

  pages.push({
    url,
    production: {
      origin: prod.origin,
      url: prod.legacyUrl,
      baseline,
      textLength: prod.route.textLength,
      textSha256: prod.route.textSha256,
      ...(legacyTextLength !== null && baseline === 'legacy-site-approximate'
        ? { legacySiteTextLength: legacyTextLength }
        : {}),
      bodyTextLength,
      headings: prod.route.headings.length,
      bodyHeadings: headings.length,
      imageCount: prod.route.imageCount,
      iframeCount: prod.route.iframeCount,
      outboundLinks: (prod.route.outboundLinks || []).length,
    },
    excludedRegions: fp ? fp.excludedRegions : [],
    excludedPerPage: applied,
    ownPropertyLinksNotAsserted: rawLinks.length - links.length,
    ...(notInManifest ? { staleCheckoutLinksNotAsserted: notInManifest } : {}),
    headings,
    minTextLength: Math.floor(assertedTextLength * TEXT_FRACTION),
    images: take('images', fp ? fp.images : prod.route.imageCount),
    embeds: take('embeds', fp ? fp.embeds : prod.route.iframeCount),
    links,
  });
}

/**
 * Migrated pages that no preserved production route serves. Reported, not
 * asserted: there is no production fingerprint to assert them against. A page
 * appearing here is either a new page or a broken servedAt join, and both are
 * worth a human look.
 */
/** Every record under a page source, at any depth. */
function walkRecords(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walkRecords(abs));
    else if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(abs);
  }
  return out;
}

const withoutProduction = [];
for (const abs of PAGE_DIRS.flatMap(walkRecords)) {
  const outputPath = (/^outputPath:\s*"(.*)"$/m.exec(readFileSync(abs, 'utf8')) || [])[1];
  if (!outputPath) continue;
  const url = `/${outputPath.replace(/(^|\/)index$/, '')}`.replace(/\/(?=$)/, '') || '/';
  if (!production.has(url)) withoutProduction.push(url);
}

const stale = EXCLUSIONS.filter((e) => !usedExclusions.has(`${e.url}|${e.kind}`));

const headingsAsserted = pages.reduce((n, p) => n + p.headings.length, 0);
const imagesAsserted = pages.reduce((n, p) => n + (p.images || 0), 0);
const embedsAsserted = pages.reduce((n, p) => n + (p.embeds || 0), 0);
const linksAsserted = pages.reduce((n, p) => n + (p.links || []).length, 0);

const baselines = {};
for (const p of pages) {
  const k = p.production ? p.production.baseline : 'none';
  baselines[k] = (baselines[k] ?? 0) + 1;
}

writeFileSync(
  join(ROOT, 'verify/content-expectations.json'),
  `${JSON.stringify(
    {
      note:
        'Per-page content-presence assertions for the migrated pages (MW-7 / MW-8). ' +
        'Every figure here is derived from PRODUCTION — routes/manifest.production.json, ' +
        'refined by the read-only legacy _site builds that reproduce its textSha256 — and ' +
        'never from dist/. An earlier version filtered each candidate heading through the ' +
        'build and kept only the ones that survived, which made verify:content structurally ' +
        'incapable of failing; regenerating this file must never consult the build again. ' +
        'headings, images, embeds and links are what production serves, minus the legacy ' +
        'theme chrome named per page in excludedRegions and minus the per-page exclusions ' +
        'named in excludedPerPage. minTextLength is a fraction of production body text after any ' +
        'explicit text exclusion, never of the build. Regenerate with scripts/author-content-expectations.mjs.',
      authoredAt: new Date().toISOString(),
      derivedFrom: 'routes/manifest.production.json',
      legacyBaseline:
        'the read-only _site builds in ../maar.world-site, ../collect.maar.world and ' +
        '../tree.maar.world, used only where they reproduce the frozen production ' +
        'fingerprint; each page records which, under production.baseline',
      textFraction: TEXT_FRACTION,
      headingNormalisations: NORMALISATIONS,
      chromeExcluded: [
        ...CHROME.map(([region, , , reason]) => ({ region, reason })),
        { region: 'hidden-elements', reason: HIDDEN_REASON },
        { region: 'html-comments', reason:
          'HTML comments. The theme shipped a commented-out <iframe> example on every ' +
          'page, which the whole-page manifest fingerprint counts as a real embed.' },
      ],
      chromeExcludedNote:
        'Each page lists, under excludedRegions, which of these regions its production ' +
        'HTML actually carried and this file therefore does not assert.',
      ownPropertyLinkNote:
        'Links to *.maar.world are not asserted: the migration rewrote them to merged-site ' +
        'paths, so the production spelling cannot appear in the build. Every page records ' +
        'how many it had under ownPropertyLinksNotAsserted.',
      staleCheckoutLinkNote:
        'A link is asserted only if routes/manifest.production.json also records it for that ' +
        'route. The manifest list is whole-page, so it is a superset of the body links a ' +
        'legacy _site checkout yields, and the intersection can only drop a link production ' +
        'does not serve at all. Pages where the checkout is ahead of or behind the frozen ' +
        'manifest record the count under staleCheckoutLinksNotAsserted.',
      pageCount: pages.length,
      migratedPagesWithoutProduction: withoutProduction.length,
      baselines,
      headingsAsserted,
      imagesAsserted,
      embedsAsserted,
      linksAsserted,
      pages,
    },
    null,
    2,
  )}\n`,
);

// ── Audit against the current build (assertions above do not depend on this) ──

console.log(
  `content-expectations: ${pages.length} pages — ${headingsAsserted} headings, ` +
    `${imagesAsserted} images, ${embedsAsserted} embeds, ${linksAsserted} links asserted`,
);
console.log(`baselines: ${JSON.stringify(baselines)}`);

if (withoutProduction.length) {
  console.log(
    `\nMIGRATED PAGES WITH NO PRODUCTION BASELINE (${withoutProduction.length}) — ` +
      'nothing asserts these:',
  );
  for (const u of withoutProduction) console.log(`  ${u}`);
}
if (stale.length) {
  console.log(`\nSTALE PER-PAGE EXCLUSIONS (${stale.length}) — no longer bite, delete them:`);
  for (const e of stale) console.log(`  ${e.url} (${e.kind})`);
}

const { set } = indexDist();
const failures = [];
for (const page of pages) {
  const file = resolveRoute(page.url, set);
  if (!file) {
    failures.push(`${page.url}: not in build output`);
    continue;
  }
  const html = mainContent(readDistFile(file));
  const text = stripTags(html);
  // Headings compare on decoded text, lengths on the fingerprint form — the
  // same split verify:content makes. See `comparable` in lib/html-text.mjs.
  const readable = comparable(html);
  for (const h of page.headings) {
    if (!readable.includes(comparable(h))) failures.push(`${page.url}: missing heading "${h}"`);
  }
  if (typeof page.minTextLength === 'number' && text.length < page.minTextLength) {
    failures.push(`${page.url}: text ${text.length} chars < ${page.minTextLength} required`);
  }
  /**
   * A FLOOR, matching verify:content exactly.
   *
   * This audit asked for equality while the check it audits asks for at-least,
   * so it printed six pages — /about, /bookings, /calendar, /collect, /lab,
   * /orbiters — as unsatisfied assertions that verify:content passes, every one
   * of them a page that gained first-party artwork in MW-11. An audit that is
   * stricter than the check it reports on cannot ever print "the current build
   * satisfies every assertion", which is the line a reader trusts.
   */
  if (typeof page.images === 'number') {
    const n = (html.match(/<img\b/gi) || []).length;
    if (n < page.images) failures.push(`${page.url}: ${n} images, expected at least ${page.images}`);
  }
  if (typeof page.embeds === 'number') {
    const n = (html.match(/<iframe\b/gi) || []).length + (html.match(/data-embed-facade/gi) || []).length;
    if (n < page.embeds) failures.push(`${page.url}: ${n} embeds, expected at least ${page.embeds}`);
  }
  for (const href of page.links || []) if (!html.includes(href)) failures.push(`${page.url}: missing link ${href}`);
}

if (failures.length) {
  console.log(`\nTHE CURRENT BUILD DOES NOT SATISFY ${failures.length} OF THESE ASSERTIONS:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(
    '\nThese are the expectations, not the build. Fix the migration, or record a reasoned ' +
      'per-page exclusion in EXCLUSIONS — never drop the assertion.',
  );
} else {
  console.log('\nthe current build satisfies every assertion');
}
