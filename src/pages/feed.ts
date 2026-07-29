/**
 * /feed — the same document as /feed.xml.
 *
 * Production serves BOTH, both as application/xml, and they are not a redirect
 * pair: `routes/manifest.production.json` records two 200s on every origin. A
 * reader subscribed to either must keep working across the cutover.
 *
 * NOTE FOR THE HOST: this file has no extension, so the Content-Type header
 * depends on host configuration in exactly the way the extensionless `/CODE`
 * card URLs depend on the `.html` fallback. The body is correct XML either way;
 * if a host serves it as text/plain, most readers still parse it, but the host
 * should be configured to send application/xml. Recorded in MIGRATION-LEDGER.md
 * as MW-4 routes/syndication.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../config/site';
import { renderFeed } from '../lib/feed.mjs';

export const GET: APIRoute = async () => {
  const pages = await getCollection('pages');
  const items = pages.filter((p) => p.data.kind === 'lab' && p.data.date);

  return new Response(
    renderFeed({
      origin: SITE.origin,
      title: SITE.title,
      description: 'Regenerative music, artistic research and the Maar World lab.',
      items,
    }),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
