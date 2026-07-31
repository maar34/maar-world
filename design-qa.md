# Paper phrase QA

## Comparison target

- Source visual truth: `../planning/design-references/current-site/Maar World 4a.dc.html`, captured at `/private/tmp/maar-design-audit/reference-home.png`.
- Implementation: `/private/tmp/maar-paper-phrase-qa/current-home-desktop.png`.
- Focused side-by-side evidence: `/private/tmp/maar-paper-phrase-qa/comparison-desktop.png`.
- Desktop state: home route, dark surface, default motion state. The browser was set to a 1440 × 1000 CSS viewport; its Chrome capture output is 912 × 2443 pixels, so the focused regions were normalized to 720 pixels wide before composition.
- Mobile state: 375 × 812 CSS viewport, captured at `/private/tmp/maar-paper-phrase-qa/current-home-mobile.png` (230 × 2648 pixels through the browser capture scale).

The reference is directional rather than a one-to-one layout for this page slice. Comparison is therefore scoped to the reference's editorial cut-word character and the two requested moving text fields, not to its retired hero layout or imagery.

## Fidelity surfaces

- Fonts and typography: pass. The phrase uses the existing body/meta rhythm, with Archivo paper fragments and Bodoni italic words drawn from the established type system.
- Spacing and layout rhythm: pass. Both rails stay inside their page-width viewport; the home grid and feature card layout remain untouched.
- Colors and tokens: pass. Paper, area pigment, ink, spacing, speed, and tilt values are centrally tokenized. No new colour values were introduced.
- Image quality and asset fidelity: not applicable. This is editable text treatment, not an image-derived asset; existing supplied imagery remains unchanged.
- Copy and content: pass. Each phrase remains complete once in the accessibility tree. The visible duplicate exists only for the seamless loop and is `aria-hidden`.

## Findings

- No actionable P0/P1/P2 findings in the implemented `PaperPhrase` scope.
- [P3] The animation can show a phrase entering partway through a sentence at a viewport edge. This is intentional for the requested moving-concepts treatment; the full accessible sentence remains available and reduced-motion users receive a static wrapped view.

## Interaction and technical checks

- The rail animates without application JavaScript.
- `prefers-reduced-motion` disables animation and renders one wrapped phrase lane.
- Browser console: 0 errors on the home route.
- `npm run build`: passed, 134 pages.
- `npm run verify:schemas`: passed, 13/13.
- `npm run verify:a11y`: passed, 24/24.

## Implementation checklist

- [x] Add deterministic phrase-word variant selection.
- [x] Add reusable `PaperPhrase` Astro pattern and global stylesheet.
- [x] Move paper/motion values into shared tokens.
- [x] Replace both static home text fields with the reusable pattern.
- [x] Verify desktop and mobile captures.

final result: passed
