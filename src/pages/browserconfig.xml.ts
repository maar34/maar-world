/**
 * /browserconfig.xml — the Windows tile.
 *
 * Production's carried `TileColor: #da532c`, a burnt orange that appears
 * nowhere in this design and was never chosen: it is the default the favicon
 * generator emits. It is now the dark surface, like every other chrome colour.
 */
import type { APIRoute } from 'astro';

/** From src/styles/tokens.css — --sf-base. */
const SURFACE = '#100f14';

export const GET: APIRoute = () =>
  new Response(
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<browserconfig>',
      '  <msapplication>',
      '    <tile>',
      '      <square150x150logo src="/mstile-150x150.png"/>',
      `      <TileColor>${SURFACE}</TileColor>`,
      '    </tile>',
      '  </msapplication>',
      '</browserconfig>',
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
