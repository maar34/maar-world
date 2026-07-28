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
 * Same-registrable-domain hosts. These are same-site even inside an iframe and
 * are never a third-party request, so they need no click-to-load facade.
 * Everything else that would fetch on page load does.
 */
export const FIRST_PARTY_HOSTS = ['maar.world', 'play.maar.world'] as const;
