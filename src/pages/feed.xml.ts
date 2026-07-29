/**
 * /feed.xml — the RSS feed production has always served.
 *
 * Its twin at /feed serves the identical document; see src/pages/feed.ts.
 * Both existed in production, so both exist here: a subscriber's saved URL is
 * whichever one their reader picked up years ago, and there is no way to know
 * which.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../config/site';
import { renderFeed } from '../lib/feed.mjs';

export const GET: APIRoute = async () => {
  const pages = await getCollection('pages');
  // The Lab is what production's feed carried: dated articles, not the whole
  // site. A feed of /about and /bookings would be noise in a reader.
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
