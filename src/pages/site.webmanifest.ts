/**
 * /site.webmanifest — what an installed home-screen shortcut looks like.
 *
 * Production served this on all three origins as unconfigured boilerplate: an
 * EMPTY `name` and `short_name`, and `#ffffff` for both theme and background.
 * A shortcut saved from it shows a blank label and flashes white on launch,
 * against a site whose surface is near-black.
 *
 * Restored with the site's actual name and its actual surface. `theme_color` is
 * the dark surface because that is the colour of the shell the app opens into;
 * `background_color` is the same, so the splash does not flash a colour the
 * site never uses.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';

/** From src/styles/tokens.css — --sf-base. */
const SURFACE = '#100f14';

export const GET: APIRoute = () =>
  new Response(
    `${JSON.stringify(
      {
        name: SITE.title,
        short_name: SITE.title,
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        theme_color: SURFACE,
        background_color: SURFACE,
        display: 'standalone',
        start_url: '/',
      },
      null,
      2,
    )}\n`,
    { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } },
  );
