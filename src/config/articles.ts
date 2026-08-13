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
 *
 * ── TWO VERSIONS ON ONE PAGE ─────────────────────────────────────────────────
 *
 * `instruments` is version one: `play.maar.world`, the Orbiters this page has
 * always shown, and nothing about it changes. `v2` is the rebuilt instrument on
 * `orbiter.plantasia.space`, which the 33 NFC card pages already forward to —
 * see `[cardCode].astro`. Both stay on `/orbiters`: the route is frozen in
 * `routes/manifest.production.json`, so a second page was never an option, and
 * `patterns/VersionSwitch` swaps between them with no JavaScript.
 *
 * A v2 instrument is a DESCRIPTOR, not a query string, because the new app takes
 * three separate ids — `?trackId=…&orbiterId=…&entangledWorldId=…` — and only
 * the first is required. `media/OrbiterEmbed` builds the address, the same way
 * `media/PlayEmbed` writes `play.maar.world` once for version one.
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
  /**
   * THE AUDIO VERSION TWO PLAYS. It is a released Sky Sounds track — the one
   * behind card AXP3732 in `routes/nfc-cards.json`, "SkySounds.2 Card IV". It
   * went in as a placeholder so the frame would play while the page was being
   * built, and the owner kept it on 2026-08-13: *"the track is ok, use that
   * one"*. So it is a choice now, not a stand-in.
   *
   * IT IS ALSO SPELLED IN `routes/nfc-cards.json`, and the two are deliberately
   * not one shared constant. That file is the frozen inventory of what is
   * printed on 35 physical cards; this is what a public page chooses to play.
   * They agree today and nothing says they must — the card is a card whatever
   * this page decides to open on.
   *
   * ONE ORBITER, NOT TWO. Version one is two instruments because
   * `play.maar.world` splits the sound and the modes across two frames; version
   * two does not — one Orbiter carries three dimensions, so the second frame
   * would have been the same instrument shown twice. The owner's instruction on
   * 2026-08-13.
   *
   * `orbiterId` and `entangledWorldId` are deliberately absent rather than
   * guessed: the app resolves the track's own released pairing when they are not
   * named, which is the right default, and inventing an id would silently pin
   * this frame to the wrong instrument. Both are props on `media/OrbiterEmbed`
   * for the day a frame does need pinning.
   */
  v2: {
    orbiter: { trackId: '6919d8fde01d8a7df9d0f5af' },
    /**
     * The editor, demonstrated in the page. `?mode=edit` and nothing else —
     * `getWorldInteractionModeFromUrl` is all this address has to satisfy, and
     * with no `trackId` the editor opens on its own demo rather than on
     * somebody's release. That is the point: it is a look at the workshop, and
     * the invitation under it sends anyone who wants to keep what they make to
     * Plantasia Space, where an account can save and share it.
     */
    editMode: { mode: 'edit' as const },
    /** Where the invitation under the editor goes. */
    plantasiaUrl: 'https://plantasia.space/',
    /**
     * The source. Version two says on the page that it is open source, and a
     * claim like that is worth exactly as much as the link under it — so the
     * sentence and the repository ship together, and the page never says "open
     * source" with nowhere to go.
     *
     * On `allowedNew` in verify/external-links-baseline.json, with the reason in
     * `.agents/decisions/0006-orbiters-v2-links-its-own-source.md`. That list is
     * how a link introduced after the freeze gets reviewed once instead of
     * silently.
     */
    repoUrl: 'https://github.com/plantasia-space/orbiters',
    /**
     * The version-two banner: the vitrola in outer space, wearing the new
     * instrument's own controls. It closes version two the way the Kepler
     * telescope closes version one.
     *
     * IT IS THE PAGE'S STATEMENT, DRAWN. `Vitrola` is the word the Spanish half
     * turns on — the owner's, 2026-08-13, reaching past "tocadiscos" for the
     * older machine and the stained glass inside the name — and this is that
     * sentence as a picture: a brass gramophone whose horn is a window onto a
     * nebula, floating in the same star field the instrument draws. The two
     * arrived in the same conversation and belong to each other.
     *
     * It lives under `/img/orbiters/` rather than `/img/interplanetary-players/`
     * with the rest of this page's art, and the folder is new. Everything in
     * that other directory is version ONE — it is named for what the Orbiters
     * used to be called, which is the distinction this page now draws down its
     * middle. A version-two picture filed under the old product's name would be
     * the one place on the site where the two versions are mixed up.
     *
     * WEBP, LIKE EVERY OTHER BANNER HERE. It arrived as a 1.3 MB PNG and ships
     * at 159 KB — `cwebp -q 92 -m 6 -sharp_yuv`, measured at 42 dB PSNR against
     * the original, which on a picture that is mostly black sky with small
     * bright stars is where banding would have shown first if it were going to.
     * The site self-hosts everything and fetches nothing from anywhere else, so
     * its weight is its own to carry.
     */
    banner: '/img/orbiters/vitrola-espacio-exterior.webp',
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
 * Orbital Creation Workshop — `lab/{en,es}/ip-orchestra-design`.
 *
 * A DIFFERENT ARTICLE FROM `IP_ORCHESTRA` above, which is
 * `lab/{en,es}/ip-orchestra`. They share the workshop and the two instruments
 * and they are still two entries, for the reason `ORBITERS` states one screen
 * up: MW-19 removes the duplication between a page and its own translation, not
 * between two pages that happen to show the same thing today.
 *
 * ── THE POSTER IS THE ONE PICTURE THAT IS GENUINELY PER-LANGUAGE ─────────────
 *
 * Two fields, not one. `Interplanetary-Orchestra.ENG.png` and `.ESP.png` are
 * the same designed sheet with the type set in two languages, which is why this
 * pair is on TRANSLATED_ARTWORK in scripts/verify-translations.mjs — the only
 * exemption to "a photograph is the same photograph in Spanish", and it exists
 * for artwork with WORDS PRINTED ON IT. Showing a Spanish reader the English
 * sheet would be the same half-translated chrome this issue removes.
 *
 * The other addresses have no language and are single fields, as everywhere.
 */
export const IP_ORCHESTRA_DESIGN = {
  poster: {
    en: '/img/lab/Interplanetary-Orchestra.ENG.png',
    es: '/img/lab/Interplanetary-Orchestra.ESP.png',
  },
  summaryVideo: 'https://youtu.be/3FYGWpvH8Gs',
  instruments: {
    controlTheSound: '?g=335&s=1&c=2',
    regenerativeModes: '?g=8&s=0&c=21',
  },
  /** Formspree. The same inbox as IP_ORCHESTRA today, still its own field. */
  formAction: 'https://formspree.io/f/mqkrdkde',
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
