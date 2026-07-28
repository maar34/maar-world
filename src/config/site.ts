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
 * The live storefront. Gumroad (`maarworld.gumroad.com`) and the never-existing
 * `physical.maar.world` / `digital.maar.world` are deprecated — see
 * ARCHITECTURE-REVIEW-ADDENDUM §5. Bandcamp is where buyers actually go.
 *
 * To move to Artizen later: change `storeUrl` and nothing else.
 */
export const COMMERCE = {
  storeUrl: 'https://maar-world.bandcamp.com/merch',
  storeName: 'bandcamp',
} as const;

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
