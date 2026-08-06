# 0005 — Public card pages sell the suit; NFC card pages still sell nothing

**Status:** accepted
**Date:** 2026-08-06
**Issue:** MW — cards page copy + suite CTA

## Context

There are two kinds of card page in this repo, and they are easy to confuse
because both are "a card page":

| | route | URL | who reaches it |
|---|---|---|---|
| **NFC card page** | `src/pages/[cardCode].astro` | `/AXP3732` | someone holding the physical card, tapping it |
| **public catalogue page** | `src/pages/[...page].astro`, `kind: 'collect-card'` | `/collect/cards/001_-maar-sky-sounds.1-card I` | someone browsing the site |

The 35 NFC URLs are printed on objects already in people's hands. MW-1 and MW-6
rule that this rebuild introduces no storefront on them: `COMMERCE.destinationUrl`
is `null`, and those pages render no destination link at all.

That rule was being read as covering both. The consequence was that the public
catalogue — 34 pages a visitor reaches by browsing, the whole point of which is
to show what the set is — had **no way to buy anything**, and instead carried
this line, authored as the last line of all 68 records (`en` and `es`):

```html
<p class="card-unlock">Coleccioná esta carta para desbloquear el acceso al<br /> orbitador y descargar los archivos de audio en alta calidad.</p>
```

Two things are wrong with it.

1. **It is untrue.** Collecting the card does not unlock the Orbiter. The
   Orbiter is open to everyone and is embedded on that very page, playing, for
   free — the owner's decision of 2026-07-31 put it there. A visitor who reads
   the line and then watches the player run learns that the page is not to be
   trusted. What the purchase actually gets you is the physical card and the
   high-quality audio files.
2. **It offers the wrong unit.** It says "collect this card". Nothing sells a
   single card. The set is sold as three suits of eleven — SkySounds.1 (yellow),
   SkySounds.2 (blue), SkySounds.3 (red) — each on its own Bandcamp page.

Because the sentence was copied into 68 files, it was untrue in 68 places at
once — the same failure mode `COMMERCE`'s own comment records ("183 links died
at once because every card carried its own copy").

## Decision

**The public catalogue page carries an offer. The NFC card page does not.**

1. `COMMERCE.destinationUrl` stays `null`, and `[cardCode].astro` is not
   touched. A physical card in someone's hand still advertises nothing. This is
   the part of MW-1/MW-6 that was never in question.
2. `[...page].astro`'s `collect-card` branch gains one offer block: a corrected
   note plus one `ui/Action`, `variant="collect"`, `emphasis="stamp"`,
   `icon="category"` — the same control the Collect landing already uses for the
   same job.
3. The destination is **per suit, not per card**: `SUIT_STORE_URLS` in
   `src/config/site.ts`. Three addresses cover 33 cards, and the content schemas
   still reject commerce fields on records, so `site.ts` remains the only door a
   storefront URL can come through.
4. The copy moves out of the records into `CARD_OFFER` in `src/config/site.ts`.
   Bodies are now empty; the route writes the line. This is the move MW-19 made
   on the Collect landing, for the reason this issue demonstrates.
5. `.prose .card-unlock` is deleted from `legacy.css` along with the markup it
   styled — the file's own rule is that a selector matching nothing is worse
   than no selector.

### The WildCard renders no offer

`034 SkySounds WildCard` has no suit number, so `suitStoreUrl` returns null and
the block does not render. Falling back to the shop's front door was considered
and rejected: a button reading "collect the … suit" on a card that belongs to no
suit either has to lie about which suit, or sends the visitor somewhere that
does not sell the thing they are looking at. Nothing is the honest answer until
the WildCard is sold as something.

The same null covers `Stoney_Way`, which is a separate release rather than a
fourth suit.

### The third suit is spelled two ways, and the button must not be

Ten records say `SkySounds.3`; `NTH7336` says `SkySounds 3` with a space. Those
records are content, and `suitPigment` already reads around the difference
rather than editing it — the label line at the top of the page prints whichever
the record says.

A button is not content. Eleven cards offering the same purchase must name it
identically, or the eleventh reads as a different product. So `suitNumber` is
split out as the one place that normalises, `suitPigment`-style matching on the
trailing digit, and `suitDisplayName` returns the canonical `SkySounds.N` for
the label. One regex, two questions — colour and shop — which is what stops the
third spelling getting a badge but no link.

## Consequences

- The one stamp these pages have is spent. `scripts/verify-actions.mjs` budgets
  one stamp and one break per view; card pages had zero controls and now have
  one. Anything added to a card page later is quiet, or this stops being the
  stamp.
- 33 of 34 public card pages gain one outbound Bandcamp link. It fires no
  request on load, so the on-load third-party count is unchanged and the
  no-analytics/no-consent posture is untouched.
- `verify:cards` is unaffected: it reads `<CODE>.html` only.
- `verify:content` floors (`minTextLength`, `images`, `embeds`) still pass —
  the note replaces a shorter line and the CTA adds text, so page text grows.
- `legacy.css` now has no card-tail rules. That is the second of the two routes
  its header describes: the migration's class names are leaving the bodies
  rather than being restyled.

## What would reverse this

An Artizen project page existing. `COMMERCE`'s comment says the destination
becomes one line in one place when that URL arrives; at that point the question
is whether the catalogue points at Artizen or stays on per-suit Bandcamp pages,
and whether the NFC pages finally get a destination too. That is a separate
decision — this one deliberately does not pre-empt it.
