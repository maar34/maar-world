/**
 * Per-article media, named once for both language halves — MW-19.
 *
 * A photograph is the same photograph in Spanish. `src/content/pages/en/lab/*`
 * and `src/content/pages/es/lab/*` are two documents in two languages, and the
 * only thing they should have in common is the pictures — so the pictures live
 * here and each half imports them, rather than each half spelling eight image
 * paths that can come to disagree.
 *
 * That is the same rule as `COLLECT_JOURNEY_IMAGES` in `site.ts`, one level out:
 * the Collect landing's belong to a page family, and these belong to an article,
 * so they are not in the family's config.
 *
 * ── WHAT LIVES HERE AND WHAT DOES NOT ────────────────────────────────────────
 *
 *   here     image paths, and the query strings that identify a play.maar.world
 *            instrument. Things with no language.
 *   the .mdx the words — every caption, every heading, every `alt`. `alt` is a
 *            sentence a reader hears, so it is copy and it travels with the
 *            language, not with the file path.
 *
 * ── WHY A SEPARATE FILE FROM site.ts ─────────────────────────────────────────
 *
 * `site.ts` is configuration for the SITE — its sections, its navigation, its
 * collages, its one commerce destination. An article's own photographs are not
 * site configuration; they are that article's, and putting fifteen articles'
 * media into the file that also decides the header would make the header hard
 * to find. Fifteen more of these are coming as MW-19 step 2 converts the rest.
 */

/**
 * Orbital Creation Workshop: Orbiters Orchestra — `lab/{en,es}/ip-orchestra`.
 *
 * `cards` is the instrument walkthrough, three screenshots with a numeral and a
 * sentence each. `sessions` is the photo run, five images and no words at all —
 * which is why its slides carry only an `alt`.
 *
 * The play.maar.world embeds are query strings, not URLs: `media/PlayEmbed`
 * writes the host, so the address exists once on the site. See that component.
 */
export const IP_ORCHESTRA = {
  cards: [
    '/img/interplanetary-players/07_ip-card.jpg',
    '/img/interplanetary-players/10_ip-transit.png',
    '/img/interplanetary-players/08_ip-max-24.jpg',
  ],
  sessions: [
    '/img/collect-landing/2024_ss-12.jpeg',
    '/img/collect-landing/2024_ss-10.jpeg',
    '/img/collect-landing/2024_ss-8.jpeg',
    '/img/collect-landing/2024_ss-11.jpeg',
    '/img/collect-landing/2024_ss-2.jpeg',
  ],
  instruments: {
    controlTheSound: '?g=335&s=1&c=2',
    regenerativeModes: '?g=8&s=0&c=21',
  },
  logos: [
    { src: '/img/logos/uartes.webp', href: 'https://www.uartes.edu.ec' },
    { src: '/img/about/mw-logo-transparent.png' },
  ],
  /** Formspree. Per form — the site's forms are not all one inbox. */
  formAction: 'https://formspree.io/f/mqkrdkde',
  /** The host university, linked from both halves' opening paragraph. */
  universityUrl: 'https://www.uartes.edu.ec/sitio/',
} as const;

/**
 * Sonic events on planet earth — `{landings,es/landings}`.
 *
 * Six captioned videos punctuate a concert history that runs from 2025 back to
 * 2011. Only the addresses are here: a video is the same video in Spanish, and
 * the caption naming it is not, so the captions stay in the two bodies.
 *
 * ── WHY THE PROSE LINKS ARE NOT IN THIS LIST ─────────────────────────────────
 *
 * Four of these six also appear as an ordinary link in the running text just
 * above their plate, and those links stay written out in both bodies. That is
 * deliberate rather than an oversight: a markdown link carries its own target —
 * `[words](address)` takes no expression — so hoisting them here would mean
 * writing raw anchor markup back into the bodies, which is the exact thing this
 * conversion removes, and would put both halves back on the STRUCTURED_ES list.
 * A link inside a sentence is part of the sentence. A plate is structure.
 */
export const LANDINGS = {
  videos: {
    trappistLive: 'https://youtu.be/GYhV2qAPZ6w',
    exoplanetasExcerpt: 'https://vimeo.com/252728417',
    exoplanetasMore: 'https://youtu.be/riEIWUQ-OWQ',
    watsonSays: 'https://vimeo.com/235986660',
    luminiscencia: 'https://vimeo.com/137703428',
    tembey: 'https://vimeo.com/104399616',
  },
} as const;
