/**
 * /robots.txt — live on all three production origins, absent from the build.
 *
 * It matters more than it looks. The card pages carry `noindex` in a meta tag,
 * which a crawler only sees AFTER fetching the page; robots.txt is what it
 * reads first. And the Sitemap line here is how a crawler finds the sitemap
 * without being told.
 *
 * Deliberately permissive: nothing on this site is disallowed. The 35 card
 * pages are noindex rather than disallowed on purpose — Disallow would stop a
 * crawler fetching them and therefore stop it ever SEEING the noindex, which is
 * the classic way a page stays in an index forever.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';

export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${SITE.origin}/sitemap.xml`,
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
