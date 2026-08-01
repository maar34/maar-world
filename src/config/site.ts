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
 * A Sky Sounds suit's own pigment, for the badge on a card index.
 *
 * Keyed on the record's `suit_title` after normalising, and normalising is not
 * tidying: the 35 records spell the third suit two ways — 10 say `SkySounds.3`
 * and `NTH7336` says `SkySounds 3` with a space. Both are the same suit and
 * must draw the same colour, and the records are content that is printed on the
 * page, so this reads around the difference rather than editing it. Matching on
 * the trailing digit does that, and survives the next record that arrives
 * spelled a third way.
 *
 * `SkySounds` with no number is the WildCard — deliberately last in the chain,
 * because it is the only suit whose name is a prefix of every other one.
 *
 * Anything that is not a Sky Sounds suit returns null and keeps the area
 * pigment: `Stoney_Way` is a separate release, not a fifth suit, and a colour
 * that said otherwise would be a lie about the set it belongs to.
 */
export function suitPigment(suitTitle: string | undefined): string | undefined {
  if (!suitTitle) return undefined;
  if (!/^skysounds/i.test(suitTitle.trim())) return undefined;
  const n = suitTitle.match(/(\d)\s*$/)?.[1];
  if (n === '1') return 'var(--c-suit-1)';
  if (n === '2') return 'var(--c-suit-2)';
  if (n === '3') return 'var(--c-suit-3)';
  return n ? undefined : 'var(--c-suit-wild)';
}

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
export const SECTIONS: Record<
  AreaName,
  { href: string; label: string; labelEs?: string; icon?: NavigationIconName; iconOnly?: boolean }[]
> = {
  maar: [
    { href: '/orbiters', label: 'Orbiters', labelEs: 'Orbitadores', icon: 'satellite_alt' },
    { href: '/lab', label: 'Lab', labelEs: 'Lab', icon: 'science' },
    { href: '/landings', label: 'Landings', labelEs: 'Aterrizajes', icon: 'travel_explore' },
    { href: '/bookings', label: 'Bookings', labelEs: 'Contrataciones', icon: 'speaker_group' },
      /**
   * THE INFO BUTTON. Drawn as its icon alone, in both languages — the owner,
   * 2026-08-01: "just leave the info button. Simple."
   *
   * `label` and `labelEs` survive as the ACCESSIBLE name, because a link with
   * no text is a link a screen reader cannot announce and `verify:a11y` fails
   * it. "info" rather than "about" or "nosotrxs": it names the button a reader
   * sees rather than a word neither language asked for.
   */
  { href: '/about', label: 'info', labelEs: 'info', icon: 'info', iconOnly: true },
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
    { href: '/collect/cards', label: 'Cards', labelEs: 'Cartas', icon: 'hearing' },
    { href: '/collect/documentation', label: 'Docs', labelEs: 'Documentación', icon: 'description' },
  ],
  tree: [],
};

/**
 * The symbol a page's own heading wears — the one its header entry already has.
 *
 * A visitor arriving on `/lab` saw the flask in the navigation and a bare word
 * as the title. The page and its nav entry are the same destination, so they
 * carry the same symbol; this reads the answer out of `SECTIONS` and `AREAS`
 * rather than restating it, which is what stops the two drifting.
 *
 * Keyed on `outputPath` with any language segment taken off the front, because
 * a translation does NOT share its original's path: English `/lab` is
 * `outputPath: "lab"` and its Spanish half is `"es/lab"`. Matching the raw value
 * silently gave every Spanish page no icon while every English one had one —
 * the failure looks like nothing at all, which is why the prefix is stripped
 * here, once, rather than at each call site.
 *
 * Returning a name here is not the same as drawing one. A page with no title
 * has nothing to put it in front of, and the layout decides that: this answers
 * "which symbol belongs to this destination", not "does this page show one".
 */
export function pageIcon(outputPath: string | undefined): NavigationIconName | undefined {
  if (!outputPath) return undefined;
  const href = `/${outputPath}`.replace(/^\/(?:en|es)\//, '/');
  for (const entries of Object.values(SECTIONS)) {
    const hit = entries.find((e) => e.href === href);
    if (hit?.icon) return hit.icon;
  }
  /* An area's index — `collect/index` is the page `/collect` points at. */
  const area = Object.values(AREAS).find((a) => a.pathPrefix && `${a.pathPrefix}/index` === href);
  return area?.icon;
}

/**
 * Home's two intentional next steps. The labels and destinations are data, but
 * their visual treatment comes from `ui/action` so this pair can be reused or
 * reconfigured without a page-family CSS exception.
 *
 * The icons are not decoration and they are not chosen per button: they are the
 * same symbols the header uses for the same two destinations. An action reading
 * "collect cards" takes `category` because that is what collect is in `AREAS`,
 * and "Enter the lab" takes `science` because that is what `/lab` is in
 * `SECTIONS`. Changing one of those entries and not the other is the drift this
 * is written to make visible — a home action and its nav entry pointing at one
 * place should never wear two different symbols.
 *
 * ── THE HOME PAGE'S MOVEMENT BUDGET IS SPENT HERE ───────────────────────────
 *
 * "Buttons v4 · the break" allows a view ONE stamp and ONE break, and this pair
 * is where the home page spends both. That is not a coincidence of there being
 * two buttons — it is why the budget is declared as data rather than decided in
 * the template. A page family that read `emphasis` from a prop could be handed
 * two stamps by two different call sites and nobody would notice until the page
 * was looked at; here the whole budget is four lines you can read at once.
 *
 * `collect cards` takes the stamp because it is the answer to what the home
 * page is for. v4's test for the break is *"the element you'd point at if you
 * were describing the screen out loud"* — after the primary, that is the lab,
 * so the lab link takes the pivot. It also passes the gesture's own test:
 * pivot is *"best on anything with a direction"*, and "enter" is a direction.
 *
 * BOTH KEYS ARE PRESENT ON BOTH ENTRIES, one of them holding `undefined`. With
 * `as const` this array is a union of two object types, and a key that exists
 * on only one member cannot be read off the union in `families/Home.astro`
 * without narrowing at the call site. Spelling the absent case out is also the
 * honest form: `gesture: undefined` says this action was considered for the
 * break and did not get it, where an omitted key says nothing at all.
 */
export const HOME_ACTIONS = [
  {
    href: '/collect/cards',
    label: 'collect cards',
    labelEs: 'coleccionar cartas',
    variant: 'primary',
    icon: 'category',
    emphasis: 'stamp',
    gesture: undefined,
  },
  {
    href: '/lab',
    label: 'Enter the lab',
    labelEs: 'entrá al lab',
    variant: 'secondary',
    icon: 'science',
    emphasis: 'quiet',
    gesture: 'pivot',
  },
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
 *
 * ── IT USED TO BE ONE OBJECT WITH ENGLISH IN IT ──
 *
 * `/es/collect` rendered two English cards and an English contact form under
 * Spanish body copy — published, built, and green, because no check reads chrome
 * for language. That is the same class of fault as the navigation leak
 * `verify:translations` now asserts against, and it survived for the same
 * reason: it is only wrong if you know which language you meant to be reading.
 *
 * So this is keyed by `lang`, exactly like `LAB_INTRO` below, and for the reason
 * stated there in full: everything the family prints in words sits in one place
 * with both languages adjacent, where a difference between them is visible.
 *
 * ── THE PICTURES ARE OUTSIDE THE PER-LANGUAGE OBJECT ──
 *
 * A photograph is the same photograph in Spanish. Only words are keyed by
 * language; every image on this page is named once and read by both halves.
 */
export const COLLECT_COVERS = {
  method: '/img/collages/13-signal-aviary.webp',
  offer: '/img/landing/2024_ss-7.jpeg',
} as const;

/**
 * The five photographs of the journey carousel, in order.
 *
 * Here rather than on the two records for the whole of MW-19's reason, applied
 * one level down: five paths spelled twice is the same defect as a page spelled
 * twice, and it drifts the same way. The CAPTIONS are words and live on the
 * records — see the `collect` field in src/content/schemas.mjs.
 *
 * `families/Collect.astro` zips the two and FAILS THE BUILD if the counts
 * disagree, so a sixth photograph added without a sixth caption stops the build
 * naming the file, rather than publishing a slide with no words under it.
 */
export const COLLECT_JOURNEY_IMAGES = [
  '/img/landing/2024_ss-12.jpeg',
  '/img/landing/2024_ss-10.jpeg',
  '/img/landing/2024_ss-8.jpeg',
  '/img/landing/2024_ss-11.jpeg',
  '/img/landing/2024_ss-2.jpeg',
] as const;

/**
 * The decorative band between the pitch and the journey.
 *
 * It carries no words in either language. In the migrated body it was a
 * background image on a `.hero--dark` whose only content was an `<h2>` holding
 * four `<br>` tags — a spacer wearing a heading's clothes, and a heading with no
 * text in the page outline. The heading is gone and the height is CSS in
 * `families/Collect.astro`; the picture survives, because it is the only part of
 * that block that was ever content.
 */
export const COLLECT_BAND_IMAGE = '/img/pages/433-suits.gif';

/**
 * The one spelling of the Sky Sounds storefront on this site.
 *
 * NOT a new hardcoded commerce URL and NOT a reversal of `COMMERCE` above. This
 * exact address is already required to be on `/collect`: it is asserted in
 * `verify/content-expectations.json` as a link production served, so removing it
 * fails `verify:content`. What changes is that it is now spelled ONCE instead of
 * three times — the offer card carried one copy and each of the two page bodies
 * carried another, which is precisely the shape `COMMERCE`'s comment describes
 * ("183 commerce links died at once … every card record hardcoded its own").
 *
 * `COMMERCE.destinationUrl` stays null and stays the rule for CARD pages: they
 * render no destination until the Artizen URL exists. This is the landing's
 * existing, asserted link, held in one place until that decision reaches it.
 */
export const COLLECT_STORE_URL = 'https://maar-world.bandcamp.com/merch';

/**
 * The video the landing opens with.
 *
 * One address, because it is one video: the Spanish page does not have its own
 * cut. It never reaches YouTube on load — `media/EmbedFacade` renders it as a
 * click-to-load facade and this is the href a reader travels to only after
 * choosing, which is the invariant in AGENTS.md ("no third-party request fires
 * on load") and the reason the facade exists at all.
 */
export const COLLECT_VIDEO_URL = 'https://youtu.be/AhYAywwaVHM';

export const COLLECT_LANDING: Record<
  string,
  {
    /** The closing pair's accessible name. */
    pairLabel: string;
    method: { title: string; excerpt: string; href: string; meta: string };
    /** The offer's destination is COLLECT_STORE_URL — one address, not a field. */
    offer: { title: string; excerpt: string; meta: string };
    /**
     * WHAT THE VIDEO FACADE SAYS IS NO LONGER HERE.
     *
     * It was `video: { label, note }`, with a note saying the pair would want
     * "one shared table keyed by provider and language" once the rest of MW-19
     * landed. It did: `src/config/embeds.ts`, keyed exactly that way, read by
     * `families/Collect.astro` and by every converted article. The strings were
     * chrome — the identical pair appears on eight pages — so keeping a copy
     * here would have left the site with two spellings of one sentence, which
     * is the defect the issue exists to remove.
     *
     * `href` was never here either, for the reason `offer.href` is not: one
     * video, both languages, so it is `COLLECT_VIDEO_URL` above.
     */
    /**
     * The contact form. `action` is deliberately absent: the Formspree endpoint
     * is one address in `families/Collect.astro`, not a per-language field.
     */
    form: {
      heading: string;
      lede: string;
      name: string;
      email: string;
      message: string;
      submit: string;
    };
  }
> = {
  en: {
    pairLabel: 'Start collecting',
    method: {
      title: 'Start where you are',
      excerpt:
        'This method is designed to be accessible and fun for everyone, from experienced musicians to complete beginners.',
      href: '/collect/docs/tutorials.html',
      meta: 'watch tutorials',
    },
    offer: {
      title: 'Get 11 cards envelope 33€',
      excerpt: 'Eleven Sky Sounds cards, posted to you.',
      meta: 'collect',
    },
    form: {
      heading: 'Contact us',
      lede: 'Curious about something? Let us know by filling out the form.',
      name: 'Your name:',
      email: 'Your email:',
      message: 'Your message:',
      submit: 'Send',
    },
  },
  es: {
    pairLabel: 'Empezá a coleccionar',
    method: {
      title: 'Empezá desde donde estés',
      excerpt:
        'El método está pensado para que sea accesible y divertido para cualquiera, desde músicas y músicos con experiencia hasta quienes arrancan de cero.',
      /* The Spanish half of the tutorials page. A card that leads out of the
         page body obeys the rule verify:translations asserts for the header
         navigation: a Spanish page does not drop the reader back into English. */
      href: '/es/collect/docs/tutorials',
      meta: 'ver tutoriales',
    },
    offer: {
      title: 'Sobre de 11 cartas 33€',
      excerpt: 'Once cartas Sky Sounds, enviadas a tu casa.',
      meta: 'coleccionar',
    },
    form: {
      heading: 'Escribinos',
      lede: '¿Tenés alguna duda? Contanos completando el formulario.',
      name: 'Tu nombre:',
      email: 'Tu email:',
      message: 'Tu mensaje:',
      submit: 'Enviar',
    },
  },
};

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
   * the `lab/` subtree under both languages. They live here because the records were
   * generated when this was written and would have lost a `cover:` field on the
   * next migration run. That reason is gone — scripts/migrate-pages.mjs was
   * deleted and nothing rewrites a record now — so moving these onto the
   * records is a live follow-up rather than a blocked one.
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

/**
 * A PICTURE HAS NO LANGUAGE, so a Spanish href finds the English half's cover.
 *
 * THE SECOND HALF OF THE BUG THE OWNER SAW. The map is keyed by href, and the
 * home page's middle card links to `/lab/en/orbits-and-bodies.html` in English
 * and `/lab/es/orbits-and-bodies.html` in Spanish. Only the English key was
 * ever added, a miss returns undefined, and `patterns/Card` degrades to a hatch
 * plate rather than failing — so the Spanish home page rendered THREE cards
 * where one had no picture, beside an English home page where all three did.
 * Their words: *"in the main page there is still an image that is not loading
 * in Spanish"*. It was not failing to load; it was never asked for.
 *
 * `collageFor` had the identical defect for section headers and takes the
 * identical rule. Two lookups keyed on an English-only path, both silently
 * returning nothing, both invisible to every check — one concept spelled twice,
 * which is the shape MW-19 is about.
 *
 * Matched on the language-stripped form of BOTH sides, not just the query: the
 * keys carry `/lab/en/` too, so `/lab/es/orbits-and-bodies.html` and
 * `/lab/en/orbits-and-bodies.html` meet at `/lab/orbits-and-bodies.html`.
 *
 * EXPLICIT PAIRS ARE STILL NEEDED WHERE THE SLUG ITSELF IS TRANSLATED —
 * `/lab/es/musica-retorno-al-juego` does not strip to
 * `/lab/music-return-to-playing`, and no rule can know that it should. Those
 * lines stay. This removes the ones that were only ever spelling out "the same
 * article in the other language".
 */
const stripLanguageSegment = (path: string): string =>
  path.startsWith('http')
    ? path
    : path
        .split('/')
        .filter((segment) => segment !== 'en' && segment !== 'es')
        .join('/');

const COVERS_BY_LANGUAGE_FREE_PATH: Record<string, ArticleCover> = Object.fromEntries(
  Object.entries(ARTICLE_COVER_FALLBACKS).map(([href, cover]) => [stripLanguageSegment(href), cover]),
);

const coverEntry = (href: string): ArticleCover | undefined =>
  ARTICLE_COVER_FALLBACKS[href] ?? COVERS_BY_LANGUAGE_FREE_PATH[stripLanguageSegment(href)];

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
  landings: '/img/collages/06-sun-machine.webp',
  bookings: '/img/collages/10-orbital-rehearsal.webp',
  about: '/img/collages/05-spectral-cosmogram.webp',
  calendar: '/img/collages/07-river-parliament.webp',
  'collect/index': '/img/collages/24-archive-explosion.webp',
};

/**
 * THE DOCUMENTATION GRID'S MARKS — one symbol per article, MW-16.
 *
 * The Docs index used each record's `cover`, and those ten covers were dark
 * photographs of unrelated subjects. At card size they were ten near-identical
 * black rectangles: the grid carried a picture for every entry and told the
 * reader nothing, which is what the issue means by "no longer rely on the
 * current images". A symbol is the opposite trade — it holds almost no
 * information, but the information it holds survives being small.
 *
 * Keyed by `outputPath`, the same key `SECTION_COLLAGE` uses, so the two maps
 * that decide "what picture does this route show" are addressed the same way.
 *
 * A name added here must also be imported in `ui/DocGlyph.astro` — the import
 * has to be static for Vite to inline it, the same constraint TREE_LINKS
 * records below. `docGlyphFor` falls back to `description`, the generic
 * document symbol, so a new doc page renders a sensible mark on the day it is
 * added rather than an empty plate.
 */
export const DOC_GLYPHS = {
  album: 'album',
  school: 'school',
  style: 'style',
  eco: 'eco',
  nfc: 'nfc',
  menu_book: 'menu_book',
  code: 'code',
  info: 'info',
  gavel: 'gavel',
  lock: 'lock',
  description: 'description',
} as const;

export type DocGlyphName = keyof typeof DOC_GLYPHS;

/**
 * Which symbol each documentation entry wears. The choice is about the
 * article's subject, not its position in the list.
 */
export const DOC_GLYPH_BY_PATH: Record<string, DocGlyphName> = {
  'collect/docs/releases/skysounds': 'album',
  'collect/docs/tutorials': 'school',
  'collect/docs/ent-cards': 'style',
  'collect/docs/ent-cards/sustainability': 'eco',
  'collect/docs/ent-cards/nfc': 'nfc',
  'collect/docs/orbiters/how-to-use': 'menu_book',
  'collect/docs/orbiters/development': 'code',
  'collect/docs/mw': 'info',
  'collect/docs/mw/terms': 'gavel',
  'collect/privacy': 'lock',
};

/**
 * The Spanish Docs index lists the Spanish records, whose `outputPath` is the
 * English one under `es/`. Same article, same subject, therefore same mark —
 * derived rather than listed twice, so the two indexes cannot drift apart.
 */
export function docGlyphFor(outputPath: string): DocGlyphName {
  const canonical = outputPath.replace(/^es\//, '');
  return DOC_GLYPH_BY_PATH[canonical] ?? 'description';
}

/**
 * The Docs card's call to action, IN THE INDEX'S OWN LANGUAGE.
 *
 * This is the one string MW-16 adds to the page body, and body text is not
 * chrome. BaseLayout's rule is that the shell stays English on every page and
 * says so with `chromeLang`, precisely so a screen reader is not handed English
 * words to pronounce as Spanish. A card's meta line is inside `<main>`, in a
 * document declared `lang="es"`, with no such escape hatch — an English "read
 * more" there is the exact defect that rule exists to prevent, one level down.
 *
 * The slot it replaced held `p.data.lang`, a language code, which was
 * language-neutral by accident. Translating is what keeps this a change of what
 * the card says rather than a change of what language it says it in.
 */
const DOC_READ_MORE: Record<string, string> = {
  en: 'read more',
  es: 'leer más',
};

export function docReadMoreFor(lang: string): string {
  return DOC_READ_MORE[lang] ?? DOC_READ_MORE.en;
}

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

/**
 * The label a reader sees, in their own language.
 *
 * ONE HELPER, BECAUSE THERE WERE FOUR PATTERNS AND THE HEADER HAD NONE. The
 * owner, 2026-08-01: *"all the shell is not translated, why didn't we use i18n
 * for this?"* — and they were right. This site had per-language strings in four
 * different shapes already (COLLECT_LANDING keyed by language, TREE_HUB_STRINGS
 * as an object of two, TREE_LINKS with an optional `labelEs` sibling,
 * EMBED_FACADE keyed by provider and language) and the navigation, the area row
 * and the home page's two buttons had none of them. So `/es` shipped a header
 * reading "orbiters · lab · landings · bookings · about" and buttons reading
 * "collect cards" and "enter the lab", under Spanish body copy.
 *
 * It is `labelEs` because that pattern already existed in TREE_LINKS and one
 * spelling used everywhere beats a fifth good idea. A missing `labelEs` falls
 * back to `label`, so a name that survives translation — "Lab" — simply carries the
 * same word in both, stated rather than defaulted.
 */
export const labelFor = (
  item: { label: string; labelEs?: string },
  lang: string | undefined,
): string => (lang === 'es' && item.labelEs ? item.labelEs : item.label);

/**
 * The picture for a section, or null where that section has no header.
 *
 * ── A SECTION IS A SECTION IN BOTH LANGUAGES ─────────────────────────────────
 *
 * The lookup falls back to the path with its language segment removed, so
 * `es/landings` finds `landings` and a reader switching language lands on the
 * page they were just looking at rather than on a different-looking one.
 *
 * THIS IS THE BUG THE OWNER SAW, and it is worth stating plainly because it
 * survived a green suite for days. `SECTION_COLLAGE` is keyed by `outputPath`,
 * a miss returned null silently, and FIVE Spanish pages — `/es/landings`,
 * `/es/bookings`, `/es/orbiters`, `/es/about`, `/es/calendar` — therefore
 * rendered NO visual header at all while every English half opened on a
 * photograph. Their owner's words, 2026-08-01: *"all the headers, they are
 * different… it is one website in two languages, how is it possible that they
 * look so different"*. They were right, and no check could see it: the header
 * is chrome, drawn outside the page body, so the structural-parity assertion
 * skipped it as per-language by design. A picture is not per-language.
 *
 * It was known and deferred. The note beside `es/collect/index` in the map said
 * a language-stripping rule "would fix this and the five other Spanish pages
 * without a list", and left it because those five would gain a header they did
 * not have. Four of the five have now been converted by MW-19 step 2, which is
 * the condition that note set. Deferring it was the wrong call regardless: the
 * five pages were not "unchanged", they were broken, and leaving them broken is
 * not the conservative option.
 *
 * ONE RULE RATHER THAN TWO MORE LINES. The map used to carry explicit
 * `es/lab` and `es/collect/index` entries, each with a comment saying the
 * Spanish half is the same section and deserves the same picture. That is this
 * rule, stated twice by hand for the two pages someone noticed — which is the
 * shape MW-19 exists to remove. Both lines are gone.
 */
const withoutLanguage = (outputPath: string): string =>
  outputPath
    .split('/')
    .filter((segment) => segment !== 'en' && segment !== 'es')
    .join('/');

export const collageFor = (outputPath: string): string | null =>
  SECTION_COLLAGE[outputPath] ?? SECTION_COLLAGE[withoutLanguage(outputPath)] ?? null;

/**
 * Same-registrable-domain hosts. These are same-site even inside an iframe and
 * are never a third-party request, so they need no click-to-load facade.
 * Everything else that would fetch on page load does.
 */
export const FIRST_PARTY_HOSTS = ['maar.world', 'play.maar.world'] as const;
