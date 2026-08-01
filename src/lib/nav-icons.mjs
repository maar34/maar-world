/**
 * The site's Material Symbols, compiled in from the local package.
 *
 * This was the import block at the top of `ui/NavigationIcon.astro`, and it
 * moved here when a second consumer appeared. The header injects the SVG source
 * into the document and lets it inherit `currentColor`; a page heading cannot do
 * that, because its `<h1>` is authored in the record's own body and the layout
 * has no element inside it to render into. It takes the same symbol as a mask
 * image instead — see `--page-icon` in `styles/prose.css`.
 *
 * Two consumers, one list. The alternative was a second import block naming the
 * same files, which is the arrangement where the header gains an icon and the
 * heading quietly does not.
 */
import category from '@material-symbols/svg-400/outlined/category.svg?raw';
import satelliteAlt from '@material-symbols/svg-400/outlined/satellite_alt.svg?raw';
import science from '@material-symbols/svg-400/outlined/science.svg?raw';
import travelExplore from '@material-symbols/svg-400/outlined/travel_explore.svg?raw';
import speakerGroup from '@material-symbols/svg-400/outlined/speaker_group.svg?raw';
import info from '@material-symbols/svg-400/outlined/info.svg?raw';
import language from '@material-symbols/svg-400/outlined/language.svg?raw';
import keyboardArrowDown from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?raw';
import menu from '@material-symbols/svg-400/outlined/menu.svg?raw';
import close from '@material-symbols/svg-400/outlined/close.svg?raw';
import hearing from '@material-symbols/svg-400/outlined/hearing.svg?raw';
/* `description` is the ligature the legacy Collect header leaked beside its own
   Docs label — the same symbol, now compiled in rather than font-loaded. */
import description from '@material-symbols/svg-400/outlined/description.svg?raw';

export const NAV_ICON_SVG = {
  category,
  satellite_alt: satelliteAlt,
  science,
  travel_explore: travelExplore,
  speaker_group: speakerGroup,
  info,
  language,
  keyboard_arrow_down: keyboardArrowDown,
  menu,
  close,
  hearing,
  description,
};

/**
 * The same symbol as a `mask-image` value, for the one case that cannot inject
 * markup into the element it decorates.
 *
 * A mask and not a `background-image`: the fill in the official source would
 * then be the colour, and a heading that changes colour — on paper, in print,
 * under a future surface — would keep a black icon beside it. Masked, the icon
 * IS the heading's own `currentColor` and cannot drift from it.
 *
 * `encodeURIComponent` rather than base64, so the value stays legible in
 * devtools, and `#` in particular must be escaped or the data URI truncates at
 * the first colour literal.
 */
export function navIconMask(name) {
  const svg = NAV_ICON_SVG[name];
  if (!svg) return undefined;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
