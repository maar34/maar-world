/**
 * Design-sync bundle entry.
 *
 * Maar World is an Astro site, not a component package: 38 of its 39 components
 * are `.astro` templates, which compile at build time and cannot render in the
 * browser as React. The one exception is the Helix island — the single approved
 * React component in the repo — so it is the only thing this bundle can carry.
 *
 * Everything else this design system offers Claude Design is CSS: the tokens,
 * the type scale and the component stylesheets, wired up in `styles-entry.css`.
 *
 * The stylesheet is imported here because `HelixIsland.astro` imports it beside
 * the component rather than inside the `.tsx` — see the note there. Outside
 * Astro there is no island to do that, so the entry does it.
 */
import '../src/components/react/HelixDiagram.css';

export { default as HelixDiagram } from '../src/components/react/HelixDiagram';
