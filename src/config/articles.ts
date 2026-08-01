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
/**
 * The Orbiters instrument — `{orbiters,es/orbiters}`.
 *
 * `cards` names the same three files as `IP_ORCHESTRA.cards`, and they are
 * deliberately NOT one shared list. MW-19 is about a page spelled twice because
 * it has two languages; this is two DIFFERENT pages that happen to show the same
 * three pictures today. Sharing the array would assert that they must always
 * agree, and nothing says the product page and the workshop article can never
 * choose different screenshots. The duplication this file removes is the one
 * between `orbiters` and `es/orbiters`, and that one is gone.
 *
 * `instruments` are query strings, not URLs — `media/PlayEmbed` writes the host,
 * so `play.maar.world` exists once on the site. Note `controlTheSound` opens
 * `c=0` here and `c=2` on the ip-orchestra articles: a real difference between
 * two pages, and the reason these are not shared either.
 */
export const ORBITERS = {
  cards: [
    '/img/interplanetary-players/07_ip-card.jpg',
    '/img/interplanetary-players/10_ip-transit.png',
    '/img/interplanetary-players/08_ip-max-24.jpg',
  ],
  instruments: {
    controlTheSound: '?g=335&s=1&c=0',
    regenerativeModes: '?g=8&s=0&c=21',
  },
  banners: {
    innovativeTradition: '/img/interplanetary-players/maar-world-banner-ovni.jpg',
    harmonyOfTheSpheres:
      '/img/interplanetary-players/Planetary_Musical_Scales_from_Harmony_of_the_Worlds.jpg',
    keplerTelescope: '/img/interplanetary-players/Kepler_Space_Telescope.png',
  },
  /** 6.5s between advances. Real behaviour — see Carousel's `autoplayMs`. */
  carouselAutoplayMs: 6500,
} as const;

/**
 * Booking enquiries — `{bookings,es/bookings}`.
 *
 * ONE EPK, AND IT IS THE ENGLISH ONE. There is no Spanish cut of the press kit,
 * so both halves point at the same file and the Spanish page says in its link
 * text which language the document is in. Linking a PDF that does not exist
 * would be worse than linking the one that does. If a Spanish EPK ever appears,
 * this becomes two fields and the Spanish record's link text loses its note —
 * which is the whole reason the address is here and not written into both
 * bodies, where only one of the two would get changed.
 *
 * `formAction` matches `IP_ORCHESTRA.formAction` today, and they are still two
 * fields rather than one shared constant. They are two forms that happen to
 * post to one inbox; merging them would assert that they must, and the site's
 * forms are deliberately not all one inbox.
 */
export const BOOKINGS = {
  epk: '/img/pdf/English-EPK_Bruna_Guarnieri.pdf',
  formAction: 'https://formspree.io/f/mqkrdkde',
} as const;

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

/**
 * The About page — `{about,es/about}`.
 *
 * One field, and it still belongs here rather than in either record: the
 * portrait is the same photograph in Spanish. The `alt` is not — it is a
 * sentence a reader hears — so it stays in each half.
 */
export const ABOUT = {
  portrait: '/img/about/bruna-profile.webp',
} as const;

/**
 * The booking calendar — `{calendar,es/calendar}`.
 *
 * One Google appointment schedule, both languages. It is never requested on
 * load: `media/EmbedFacade` renders it click-to-load, which is the invariant in
 * AGENTS.md and the reason this is an address rather than an iframe.
 */
export const CALENDAR = {
  bookingUrl:
    'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2E7HM16smJlViabRPO6puSuIFX9H8KtN2opGDoMW3P_dzN9WYnVEyfWp4O4mendFmkBYVsPzvY?gv=true',
} as const;

/**
 * Dadada — `lab/{en,es}/dadada`.
 *
 * One soundcloud track and one instrument, and the two halves were spelling
 * both. `track` is the widget address the facade's anchor points at, kept whole
 * because it is soundcloud's and not ours to reassemble; `liveSet` is a query
 * string, like every other instrument here, because `media/PlayFrame` writes
 * the play.maar.world host.
 *
 * The two soundcloud attribution links stay in the bodies. A link inside a
 * sentence is part of the sentence — the same rule LANDINGS records.
 */
export const DADADA = {
  track:
    'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1685947338%3Fsecret_token%3Ds-LAlb1xhIGLz&color=%23ff5500&auto_play=false&hide_related=true&show_comments=true&show_user=true&show_reposts=false&show_teaser=false&visual=true',
  liveSet: '?g=8&s=0&c=20',
} as const;

/**
 * Orbits and Bodies — `lab/{en,es}/orbits-and-bodies`.
 *
 * A conference paper and the two videos of the performance it describes. All
 * three are the same file in either language: the paper is one PDF, written in
 * English and presented as it is, and a recording is not translated. The words
 * that name them — the PDF's accessible label, the fallback sentence, the link
 * inside it — stay in the two bodies, where they can be read as prose.
 */
export const ORBITS_AND_BODIES = {
  paper: '/img/pdf/WAC25-Orbits-and-Bodies-Bruna-Gabriel.pdf',
  videos: {
    performance: 'https://youtu.be/Tp--LJcp_5o',
    talk: 'https://youtu.be/jaPHJNyjZ1s',
  },
} as const;

/**
 * Helix technical requirements — `lab/en/helix-technical-requirements` and
 * `lab/es/helix-eac-montevideo-2025`.
 *
 * One address, and it is FIRST-PARTY: the interactive diagram is a page of this
 * site, so `media/DiagramFrame` frames it directly rather than behind a
 * click-to-load facade. It is here rather than in either body for the reason
 * every entry in this file is: a diagram is the same diagram in Spanish, and
 * both halves were spelling the path.
 *
 * Note the two halves publish under DIFFERENT slugs — the English one is named
 * for what it is, the Spanish one for the exhibition it was written for — which
 * is exactly why the shared thing has to live somewhere neither of them owns.
 */
export const HELIX = {
  diagram: '/helix-diagram.html',
} as const;

/** One track — `{music,es/music}`. A query string; PlayFrame writes the host. */
export const MUSIC = {
  rabbitHole: '?g=401&s=0&c=0',
} as const;

/**
 * Interplanetary ancestors — `lab/{en,es}/ip-1`, `ip-2`, `ip-3`.
 *
 * Query strings, not URLs: `media/PlayFrame` writes the host, so
 * `play.maar.world` exists once on the site. Thirteen instruments across three
 * articles, in the order each page plays them — named here rather than in the
 * bodies because an address has no language and was otherwise spelled twice,
 * once in each half.
 */
export const IP_ANCESTORS = {
  ip1: ['?g=8&s=0&c=3', '?g=8&s=0&c=4', '?g=8&s=0&c=5', '?g=8&s=0&c=6'],
  ip2: ['?g=8&s=0&c=7', '?g=8&s=0&c=8', '?g=8&s=0&c=9', '?g=8&s=0&c=10', '?g=8&s=0&c=11'],
  ip3: ['?g=8&s=0&c=12', '?g=8&s=0&c=13', '?g=8&s=0&c=14', '?g=8&s=0&c=15'],
} as const;
