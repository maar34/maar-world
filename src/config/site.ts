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
export const AREAS = {
  maar: { pathPrefix: '', pigment: 'var(--c-maar)', label: 'maar' },
  collect: { pathPrefix: '/collect', pigment: 'var(--c-collect)', label: 'collect' },
  tree: { pathPrefix: '/tree', pigment: 'var(--c-tree)', label: 'tree' },
} as const;

export type AreaName = keyof typeof AREAS;

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
 * across 95 files and gain nothing. See docs/adr/0001-one-pages-collection.md.
 */
export const SECTIONS: Record<AreaName, { href: string; label: string }[]> = {
  maar: [
    { href: '/orbiters', label: 'Orbiters' },
    { href: '/lab', label: 'Lab' },
    { href: '/landings', label: 'Landings' },
    { href: '/bookings', label: 'Bookings' },
    { href: '/about', label: 'About' },
  ],
  collect: [{ href: '/collect/documentation', label: 'Docs' }],
  tree: [],
};

/**
 * Same-registrable-domain hosts. These are same-site even inside an iframe and
 * are never a third-party request, so they need no click-to-load facade.
 * Everything else that would fetch on page load does.
 */
export const FIRST_PARTY_HOSTS = ['maar.world', 'play.maar.world'] as const;
