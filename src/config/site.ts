/**
 * Single-source site configuration.
 *
 * The commerce destination lives here and ONLY here.
 *
 * The reason 183 commerce links died at once on the legacy sites is that store
 * URLs were hardcoded into every card record: when the storefront moved, every
 * one of them had to change, so none of them did. A future move to Artizen must
 * be a one-line change in this file, not a sweep across 35 content files.
 *
 * No card, page or component may hardcode a storefront URL.
 */

export const SITE = {
  domain: 'maar.world',
  origin: 'https://maar.world',
  title: 'maar world',
} as const;

/**
 * The single configurable card destination.
 *
 * Deliberately null. MW-1 and MW-6 both rule that no Bandcamp, storefront,
 * checkout or commerce integration is introduced by this rebuild, and that card
 * pages link to one configurable destination — the Artizen project page — once
 * its URL exists. It does not exist yet, so card pages render no destination
 * link at all rather than resurrecting a storefront.
 *
 * (ARCHITECTURE-REVIEW-ADDENDUM §5 recommended repointing everything at
 * Bandcamp. The issues supersede it, and they are explicit.)
 *
 * The old destinations are all dead and are NOT migrated:
 *   physical.maar.world     no DNS record
 *   digital.maar.world      no DNS record
 *   maarworld.gumroad.com   404, store gone
 *
 * When the Artizen URL exists, set `destinationUrl` here — one line, one place.
 * The content schemas reject per-record commerce fields precisely so this stays
 * true; 183 links died at once because every card carried its own copy.
 */
export const COMMERCE: {
  destinationUrl: string | null;
  destinationName: string;
} = {
  destinationUrl: null,
  destinationName: 'artizen',
};

/**
 * The three merged areas. One pigment role each — this is how Maar, Collect and
 * Tree stay legible as distinct areas inside a single site.
 */
export const NAVIGATION_ICONS = {
  category: 'category',
  satellite_alt: 'satellite_alt',
  science: 'science',
  travel_explore: 'travel_explore',
  speaker_group: 'speaker_group',
  info: 'info',
  language: 'language',
  keyboard_arrow_down: 'keyboard_arrow_down',
  menu: 'menu',
  close: 'close',
  hearing: 'hearing',
  description: 'description',
} as const;

export type NavigationIconName = keyof typeof NAVIGATION_ICONS;

type AreaConfig = {
  pathPrefix: string;
  pigment: string;
  label: string;
  icon?: NavigationIconName;
};

export const AREAS: Record<'maar' | 'collect' | 'tree', AreaConfig> = {
  maar: { pathPrefix: '', pigment: 'var(--c-maar)', label: 'maar' },
  collect: { pathPrefix: '/collect', pigment: 'var(--c-collect)', label: 'collect', icon: 'category' },
  tree: { pathPrefix: '/tree', pigment: 'var(--c-tree)', label: 'tree' },
};

export type AreaName = keyof typeof AREAS;

/**
 * Which areas the header actually offers, and why it is not all three.
 *
 * `AREAS` is the pigment and path registry for the three merged origins — every
 * page belongs to one of them and takes its colour from it. That is a different
 * question from what the navigation lists, and conflating the two put three
 * entries in the header that a visitor did not need:
 *
 *   maar    the brand link IS this destination. A wordmark and a nav entry that
 *           both go to `/`, sitting beside each other, are two tab stops and two
 *           announcements of the same page. The brand stays; the entry goes.
 *   tree    a link-in-bio page. Its whole purpose is to be handed out directly —
 *           in a social profile, on a card — and land someone on a short list of
 *           outbound destinations. Nobody browses to it from inside the site, so
 *           it is reachable at `/tree` and is not header navigation.
 *
 * `collect` is the only area that is genuinely somewhere else on this site, so
 * it is the only one listed. Removing an entry here removes it from the header
 * at both widths; the area keeps its pigment and its URL either way.
 */
export const HEADER_AREAS: readonly AreaName[] = ['collect'];

/**
 * The section links inside each area — the second row of the header.
 *
 * This lived inside `src/components/ui/SiteHeader.astro`, which is where it was
 * used and not where anyone would look for it: `AREAS` is here, the header
 * reads it from here, and a person asking "what is in the navigation" opens the
 * config module. Navigation is configuration, not markup.
 *
 * These are the legacy header of each origin, measured from the live sites and
 * recorded in MIGRATION-LEDGER.md as `shell/legacy-nav-inventory`. They are a
 * restoration, not an invention — nothing is here that a visitor could not
 * already reach from that site's header.
 *
 * Two entries from that inventory are deliberately absent:
 *   - the cross-origin "Collect" / "Maar World" / "Tree" links, which are now
 *     the area row rather than a link inside one area's sections;
 *   - Collect's "Buy Now", a Bandcamp storefront. MW-1 and MW-6 both forbid
 *     reintroducing commerce and COMMERCE.destinationUrl is null.
 *
 * It is DECLARED, not derived from the content. There used to be an `inNav`
 * boolean on the page schema described as "the eventual source for this list";
 * it was false on all 95 records and read by nothing, and it is gone. A nav
 * derived from content still needs a label and an order per entry, which is
 * exactly the data below — so deriving it would spread one reviewable list
 * across 95 files and gain nothing. See .agents/decisions/0001-one-pages-collection.md.
 */
export const SECTIONS: Record<AreaName, { href: string; label: string; icon?: NavigationIconName }[]> = {
  maar: [
    { href: '/orbiters', label: 'Orbiters', icon: 'satellite_alt' },
    { href: '/lab', label: 'Lab', icon: 'science' },
    { href: '/landings', label: 'Landings', icon: 'travel_explore' },
    { href: '/bookings', label: 'Bookings', icon: 'speaker_group' },
    { href: '/about', label: 'About', icon: 'info' },
  ],
  /**
   * Cards is first because it is what Collect is for.
   *
   * It is the one addition to the measured legacy inventory rather than a
   * restoration from it: legacy Collect's header carried Docs, a cross-origin
   * "Maar World" link and a Bandcamp "Buy Now", so the deck itself — the whole
   * subject of the area — was reachable only from the body of the home page.
   * The storefront stays gone (MW-1/MW-6, COMMERCE.destinationUrl is null); the
   * cards it used to sell are now a header entry.
   */
  collect: [
    { href: '/collect/cards', label: 'Cards', icon: 'hearing' },
    { href: '/collect/documentation', label: 'Docs', icon: 'description' },
  ],
  tree: [],
};

/**
 * Home's two intentional next steps. The labels and destinations are data, but
 * their visual treatment comes from `ui/action` so this pair can be reused or
 * reconfigured without a page-family CSS exception.
 */
export const HOME_ACTIONS = [
  { href: '/collect/cards', label: 'collect cards', variant: 'primary' },
  { href: '/lab', label: 'Enter the lab', variant: 'secondary' },
] as const;

/**
 * The Collect landing's closing section, and the one place to edit it.
 *
 * These two blocks used to be `.hero--dark` plates in the migrated body: a
 * paragraph, a `<br><br>`, and a legacy `a.button` inside it. That is the shape
 * of a card written before there was a card, so they are declared as data here
 * and drawn by `patterns/card` in `families/Collect.astro` — the same route the
 * home page's feature and entries already took.
 *
 * TWO BLOCKS, NOT THREE. A third plate read "25 physical cards available.
 * Purchase in our bandcamp store." and is deliberately gone: it was a sentence
 * announcing the card beneath it, which the card already says, and a second
 * pointer at the same storefront the card links to. The envelope survives
 * because it is the offer; the announcement of the offer was not.
 *
 * `13-signal-aviary` is the owner's own choice for the method card. The envelope
 * keeps the product photograph, because a card offering a physical object
 * should show the object rather than an illustration of one.
 *
 * `meta` is the word that used to sit on a button beneath each block. A card is
 * one link target, so the action belongs on the card's meta line rather than on
 * a second control beside it — the same thing the home page's entries do with
 * "visit" and "read".
 */
export const COLLECT_LANDING = {
  method: {
    title: 'Start where you are',
    excerpt:
      'This method is designed to be accessible and fun for everyone, from experienced musicians to complete beginners.',
    href: '/collect/docs/tutorials.html',
    meta: 'watch tutorials',
    cover: '/img/collages/13-signal-aviary.webp',
  },
  offer: {
    title: 'Get 11 cards envelope 33\u20ac',
    excerpt: 'Eleven Sky Sounds cards, posted to you.',
    href: 'https://maar-world.bandcamp.com/merch',
    meta: 'collect',
    cover: '/img/landing/2024_ss-7.jpeg',
  },
} as const;

/**
 * THE LAB'S OPENING, AND THE ENTRY IT LEADS WITH.
 *
 * Both live here rather than in a page body, for the same reason: `/lab` is a
 * GENERATED record — scripts/migrate-pages.mjs wipes and rewrites it — so copy
 * edited there is lost on the next run, while `/es/lab` is an authored file, so
 * the two halves would drift apart the moment either was touched. One place,
 * both languages, side by side where a difference between them is visible.
 *
 * The wording is the design's, which the owner judged better than the migrated
 * theme's ("step into a time lab. a public bitacora to share new and old
 * creations…"). Casing is normal here and lowercased by CSS: the spec is
 * explicit that "lowercase is presentational only — never set in the text
 * content, so screen readers keep the real casing".
 *
 * The heading is HTML because it carries a type mark — the OVERPRINT, §02's
 * "a second impression 3px off-register", which is what the design draws on
 * "seed". The duplicate is aria-hidden, so the word is announced once.
 */
export const LAB_INTRO: Record<
  string,
  {
    headingHtml: string;
    lede: string;
    /**
     * Everything else the family prints in words. It is here and not in the
     * component because a Spanish page whose chrome says "entries / oldest /
     * updated / min read / pinned" is a page half-translated, and the place to
     * notice that is the place the two languages sit side by side.
     *
     * `months` is the abbreviated form the Lab's dates are set in, twelve long,
     * January first.
     */
    strings: {
      entries: string;
      years: string;
      oldest: string;
      updated: string;
      readTime: string;
      pinned: string;
      months: string[];
    };
  }
> = {
  en: {
    headingHtml:
      'A <span class="mark mark--overprint">seed<span class="mark__echo" aria-hidden="true">seed</span></span>, then a tree',
    lede:
      'A public bitácora of new and old creations. Keep track of how ideas change over time and relate — like watching a plant grow from a tiny seed into a tree.',
    strings: {
      entries: 'entries',
      years: 'years',
      oldest: 'oldest',
      updated: 'updated',
      readTime: 'min read',
      pinned: 'pinned',
      months: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    },
  },
  es: {
    headingHtml:
      'Una <span class="mark mark--overprint">semilla<span class="mark__echo" aria-hidden="true">semilla</span></span>, y después un árbol',
    lede:
      'Una bitácora pública de creaciones nuevas y viejas. Seguí el rastro de cómo las ideas cambian y se relacionan con el tiempo — como mirar crecer una planta desde una semilla diminuta hasta volverse un árbol.',
    strings: {
      entries: 'entradas',
      years: 'años',
      oldest: 'la más antigua',
      updated: 'actualizada',
      readTime: 'min de lectura',
      pinned: 'fijada',
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    },
  },
};

/**
 * WHICH ENTRY THE LAB LEADS WITH — the design's "pinned", made real.
 *
 * It used to be the most recent entry, and the owner's objection is the right
 * one: the newest piece is not always the one worth opening on, and helix —
 * technical requirements is installation paperwork rather than a way in.
 *
 * The value is a `translationKey`, NOT a URL, and that is the load-bearing
 * part: one key pins the piece in BOTH languages at once, so `/lab` leads with
 * the English half and `/es/lab` with the Spanish half, and nobody maintains
 * two lists that can disagree. The keys are on the records themselves.
 *
 * Set it to null to lead with the most recent entry again. A key naming no
 * entry falls back to that too, rather than leaving the page with no lead — a
 * pin is an editorial preference, not a dependency.
 */
export const LAB_PINNED: string | null = '2026-01-20-music-abstraction-return-playing';

/**
 * Local artwork for editorial cards that do not yet carry their own cover.
 *
 * Article imagery is chosen by destination, not by its position in a grid, so
 * reordering the homepage cannot silently give an article a different image.
 * The function is intentionally reusable by future article-card lists.
 */
type ArticleCover = string | { src: string; fit: 'contain' };

const ARTICLE_COVER_FALLBACKS: Record<string, ArticleCover> = {
  // Was 01-cosmic-botanist, retired 2026-07-30. The forest receiver is the
  // nearest thing in the new set to what that picture was doing here.
  'https://plantasia.space': '/img/collages/11-forest-receiver.webp',
  // The homepage's third card, swapped from Orbiters Orchestra on 2026-07-30.
  'https://entangled.space/': '/img/collages/14-recursive-listening.webp',
  '/lab/en/orbits-and-bodies.html': '/img/collages/12-canopy-cartography.webp',

  /**
   * ── the Lab index, page family 02 ──────────────────────────────────────
   *
   * EACH ENTRY'S OWN PICTURE, LIFTED OUT OF ITS OWN BODY. No collage.
   *
   * The owner's rule, 2026-07-31: the Lab shows what the article shows, and the
   * collages are kept for section headers and the home page. An article with no
   * picture gets no picture — `patterns/card` draws an empty cover as the hatch
   * plate, which is what the spec draws an empty cover as, and that is honest
   * about a missing image in a way a borrowed illustration is not.
   *
   * These are the FIRST first-party image in each record's body, read out of
   * `src/content/migrated/lab/**`. They live here rather than on the records
   * because the records are generated and would lose the field on the next
   * migration run; writing `cover:` from scripts/migrate-pages.mjs is the
   * durable home for this and is a follow-up, not this unit.
   *
   * FIVE PIECES — TEN RECORDS — CARRY NO IMAGE AT ALL and are deliberately
   * absent from this map, so they render the plate until the owner supplies
   * artwork: helix-technical-requirements / helix-eac-montevideo-2025,
   * ip-1, ip-2 and ip-3 in both tongues, and orbits-and-bodies in both.
   *
   * `orbital-workshop-1.jpg` is the picture in FOUR records, because two
   * different essays illustrate themselves with the same workshop photograph.
   * That is what the bodies say; a second photograph for one of the two pairs
   * is the owner's call, not a thing to invent here.
   *
   * The two Orchestra posters differ by language on purpose — the article
   * carries the English sheet and the Spanish sheet respectively, so the pair
   * is the one place the two tongues genuinely show different pictures.
   */
  '/lab/en/dadada': '/img/lab/nornas.jpg',
  '/lab/es/dadada': '/img/lab/nornas.jpg',

  /* The workshop poster — a designed sheet with type on it, and a transparent
     PNG. Fitted whole on a dark field, never cropped. The two languages carry
     the English and the Spanish sheet, so this pair is the one place the two
     tongues genuinely show different pictures. */
  '/lab/en/ip-orchestra-design': { src: '/img/lab/Interplanetary-Orchestra.ENG.png', fit: 'contain' },
  '/lab/es/ip-orchestra-design': { src: '/img/lab/Interplanetary-Orchestra.ESP.png', fit: 'contain' },

  '/lab/en/ip-orchestra': '/img/interplanetary-players/07_ip-card.jpg',
  '/lab/es/ip-orchestra': '/img/interplanetary-players/07_ip-card.jpg',

  /* The owner's artwork, supplied 2026-07-31. Helix takes one of the two EAC
     installation photographs; the other is inside the article. */
  '/lab/en/helix-technical-requirements': '/img/lab/Eac_maar_0593.jpg',
  '/lab/es/helix-eac-montevideo-2025': '/img/lab/Eac_maar_0593.jpg',
  '/lab/en/orbits-and-bodies': '/img/lab/orbit-bodies-1.jpeg',
  '/lab/es/orbits-and-bodies': '/img/lab/orbit-bodies-1.jpeg',

  /* One picture across all three Interplanetary Ancestors, which is the
     owner's own assignment: they are three parts of one piece. */
  '/lab/en/ip-1': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',
  '/lab/es/ip-1': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',
  '/lab/en/ip-2': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',
  '/lab/es/ip-2': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',
  '/lab/en/ip-3': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',
  '/lab/es/ip-3': '/img/lab/csm_PP0228103_01_24225d6301.jpeg',

  /* Still one photograph shared by two different essays, because that is what
     both bodies carry. The owner has not replaced it. */
  '/lab/en/music-return-to-playing': '/img/lab/orbital-workshop-1.jpg',
  '/lab/es/musica-retorno-al-juego': '/img/lab/orbital-workshop-1.jpg',
  '/lab/en/shared-culture': '/img/lab/orbital-workshop-1.jpg',
  '/lab/es/cultura-compartida': '/img/lab/orbital-workshop-1.jpg',
};

const coverEntry = (href: string): ArticleCover | undefined => ARTICLE_COVER_FALLBACKS[href];

export const articleCoverFor = (href: string) => {
  const e = coverEntry(href);
  return typeof e === 'string' ? e : e?.src;
};

/**
 * HOW THAT PICTURE MEETS ITS FRAME.
 *
 * `cover` is the default and is right for a photograph: the frame is a crop out
 * of a larger scene, and losing the edges of a scene loses nothing.
 *
 * `contain` is for a picture that is a WHOLE OBJECT — the Orbital Creation
 * Workshop poster, a designed sheet with type on it. Cropping a poster cuts
 * words off, so it is fitted and shown whole. Those two files also carry an
 * alpha channel, which is why `card--cover-contain` paints a dark field first:
 * without one the hatch plate shows through the poster's own transparent
 * background and the sheet reads as damaged.
 *
 * The owner asked for exactly this on 2026-07-31 — "Orbital Creation Workshop,
 * add black background".
 */
export const articleCoverFitFor = (href: string): 'cover' | 'contain' => {
  const e = coverEntry(href);
  return typeof e === 'string' ? 'cover' : (e?.fit ?? 'cover');
};

/**
 * One collage per section, chosen here and never at random.
 *
 * This replaced a four-image pool that every header shuffled on each visit. Six
 * surfaces drew from the same four pictures, so the home page and five sections
 * showed the same artwork as each other and different artwork to the same
 * visitor twice running — the section stopped being recognisable, which is the
 * one job a section header has. Keying the picture to the section fixes both:
 * `/lab` is always the cabinet of signals, and a returning visitor sees what
 * they saw before.
 *
 * It is also why `CollageField` ships no JavaScript any more. A random choice
 * had to be made in the browser; a fixed one is known at build time, so the
 * `src` is in the emitted HTML and the picture starts loading with the page.
 *
 * The key is the record's `outputPath`, with `''` standing for the home page.
 * To move a picture, swap the value — nothing else reads these paths.
 */
export const SECTION_COLLAGE: Record<string, string> = {
  '': '/img/collages/03-ritual-interface.webp',
  orbiters: '/img/collages/25-botanical-turntable.webp',
  lab: '/img/collages/27-earth-receiver.webp',
  /* The Spanish Lab is the same section, so it is the same picture: a reader
     switching language should land somewhere they recognise. */
  'es/lab': '/img/collages/27-earth-receiver.webp',
  landings: '/img/collages/06-sun-machine.webp',
  bookings: '/img/collages/10-orbital-rehearsal.webp',
  about: '/img/collages/05-spectral-cosmogram.webp',
  calendar: '/img/collages/07-river-parliament.webp',
  'collect/index': '/img/collages/24-archive-explosion.webp',
};

/**
 * The Tree hub's links, and the one place to edit them.
 *
 * Tree is a link-in-bio page: it is given out directly and is the address in a
 * social profile, so its whole job is a short list of destinations that changes
 * often. It used to be four `<a>` tags nested inside four `div.button-container`
 * wrappers and spaced with `<br>` tags, which is not a thing anyone can safely
 * edit. Adding a link is now one line here.
 *
 * `icon` is a Material Symbol, bundled from node_modules and inlined as SVG —
 * never the icon font, which is a third-party request on page load, and never a
 * ligature, which is the trap MIGRATION-LEDGER records under
 * `shell/legacy-nav-inventory` (every legacy nav label was prefixed by a leaked
 * ligature name). A name added here must also be imported in TreeHub.astro; the
 * import has to be static for Vite to inline it.
 */
export const TREE_LINKS = [
  {
    href: 'https://artizen.fund/index/p/entangled-space--open-protocol-for-regenerative-economies?season=6',
    label: 'Artizen Entangled Space',
    icon: 'volunteer_activism',
  },
  { href: 'https://entangled.space/', label: 'Entangled Space', icon: 'hub' },
  { href: 'https://plantasia.space/', label: 'Plantasia Space', icon: 'potted_plant' },
  {
    href: 'https://maar-world.bandcamp.com/merch',
    label: 'Get Your Cards',
    /**
     * `labelEs` is optional, and three of the four links do not have one on
     * purpose: Artizen Entangled Space, Entangled Space and Plantasia Space are
     * the names of things, and a name is the same in every language. Only the
     * one link whose label is a sentence needs saying twice.
     *
     * A missing `labelEs` falls back to `label`, so adding a link stays one
     * line and a translation is never silently required.
     */
    labelEs: 'Conseguí tus cartas',
    icon: 'album',
  },
] as const;

/** The Tree hub's own strings, per language. The links are TREE_LINKS above. */
export const TREE_HUB_STRINGS = {
  en: { navLabel: 'Maar World links' },
  es: { navLabel: 'enlaces de Maar World' },
} as const;

export type TreeIconName = (typeof TREE_LINKS)[number]['icon'];

/** The picture for a section, or null where that section has no header. */
export const collageFor = (outputPath: string): string | null =>
  SECTION_COLLAGE[outputPath] ?? null;

/**
 * Same-registrable-domain hosts. These are same-site even inside an iframe and
 * are never a third-party request, so they need no click-to-load facade.
 * Everything else that would fetch on page load does.
 */
export const FIRST_PARTY_HOSTS = ['maar.world', 'play.maar.world'] as const;
