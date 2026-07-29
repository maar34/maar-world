/**
 * /sitemap.xml — the path Search Console is registered against.
 *
 * `@astrojs/sitemap` emits `/sitemap-index.xml` and `/sitemap-0.xml`, so the
 * build had a sitemap that nothing was looking for while the URL every search
 * engine already knows returned nothing. Production serves `/sitemap.xml` on
 * all three origins.
 *
 * This is a sitemap INDEX, not a second copy of the URL list. Duplicating the
 * list would mean two files to keep in step and a chance for them to disagree;
 * an index is four lines and points at the file the integration already
 * generates and already keeps correct.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';

export const GET: APIRoute = () =>
  new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <sitemap>',
      `    <loc>${SITE.origin}/sitemap-0.xml</loc>`,
      '  </sitemap>',
      '</sitemapindex>',
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
