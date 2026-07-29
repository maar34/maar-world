# The visual language, measured out of `Maar World 4a`

## Why this file exists

The owner's words: *"we kind of developed a language but it's super hard to transmit… the
design so far is not being able to export it correctly."*

That is exactly right, and it is a gap in the artifacts, not in the owner's explanation. The
design **system** (`Maar World Design System.dc.html`) specifies tokens, type, spacing, states,
page skeletons and a rules-of-use table that says *where* marks are allowed — h1 and card cover,
max 2, tilt permitted. It never specifies **what a mark is**. The only place the language exists
is the direction mockup, `planning/design-references/current-site/Maar World 4a.dc.html`, as
inline styles on individual spans.

So an agent that reads the spec and obeys it builds what this repo currently has: correct
typography, correct spacing, correct contrast, and none of the character. Everything below is
measured out of 4a so the next session does not have to re-derive it — and so the argument about
which parts to keep is had with numbers rather than adjectives.

**Nothing here is implemented yet.** `GlyphRun.astro` is the only mark in the build.

---

## The seven marks

Values are 4a's own. Angles are the striking part: there is no single tilt reused — there are
**fourteen distinct angles**, nearly all between 0.5° and 1.6°, with a few stamps out at 4°.
That scatter is the whole effect. One angle applied everywhere reads as a skewed page; many
small unequal angles read as things *placed by hand*.

### 1. Cut word — the signature

One word lifted out of a heading and pasted back in, torn from a different sheet.

```
display: inline-block;
background: #efe7da;              /* cream field — the ink colour, used as paper */
color: #141319;                   /* dark type on it, always */
font: 600 22px 'Archivo';
font-stretch: 120%;               /* 110–124% across instances — different presses */
padding: 2px 9px;
transform: rotate(1.6deg);        /* per instance: -1.6, 1.4, 1.6, -0.8 … */
clip-path: polygon(0 6%,4% 0,26% 5%,52% 0,78% 6%,100% 2%,98% 96%,72% 100%,44% 95%,18% 100%,2% 94%);
```

Four polygon variants exist, all 11 points, differing by a few percent. They are **torn paper
edges** — ragged top and bottom, straight-ish sides. Used on: `place`, `exoplanets`, `lab`.

### 2. Highlighter word

Softer than a cut word. A marker stroke that deliberately does **not** fill the line box:

```
background: linear-gradient(transparent 8%, #a9d5e8 8%, #a9d5e8 92%, transparent 92%);
color: #141319;
padding: 0 .12em;
display: inline-block;
transform: rotate(-.8deg);
```

Three instances, at 8%/92%, 9%/91% and 10%/90%. **This is a hard-stop gradient, not a wash.**
See the correction note at the bottom — a rule against "gradients" reads as a ban on this, and
banning it removes half the language.

### 3. Struck word

A hand-drawn cross-out: an absolutely-positioned bar over the word, `aria-hidden` so it is never
announced.

```
position: absolute; left: -4%; right: -4%; top: 52%;
height: 2px; background: #f0aecb; transform: rotate(-2.4deg);
```

The `-4%` overhang on both sides is what stops it looking like a `text-decoration`.

### 4. Stamp

Meta text in a heavy border, tilted hard. Reads as a rubber stamp or a hand-numbered edition.

```
font: 400 20px 'DM Mono'; color: #e7c98f;
border: 2px solid #e7c98f; padding: 2px 8px;
transform: rotate(-4deg); opacity: .85;
```

Used for `i / xii` and a timecode `08:41`. **-4° is the largest angle in the mockup** and it is
used only here — the stamp is the one thing allowed to be obviously crooked.

### 5. Opposed chips

Adjacent chips tilt in **opposite** directions, and one is filled while the other is outlined:

```
en → background: #a9d5e8; color: #1a1822; padding: 5px 8px; rotate(-1.5deg)
es → color: #a39ead; border: 1px solid rgba(255,255,255,.2); padding: 4px 8px; rotate(1deg)
```

### 6. Tilted actions

Buttons and CTAs carry the same small rotation as everything else — `-0.6°`, `-0.8°`, `+0.5°`.
A primary and a secondary sitting together lean *apart*, never the same way.

### 7. Hatch plate

A texture, not a wash — two flat colours in 8px diagonal bands with hard stops:

```
linear-gradient(135deg, #1b1a23 0 8px, #141319 8px 16px)   /* dark */
linear-gradient(135deg, #e6ddd0 0 8px, #d5cabb 8px 16px)   /* paper */
```

### Motion

`translateY(-3px)` and `-2px` on hover — a lift, not a scale. 4a's own reset already carries
`@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`.

---

## Where 4a and the spec genuinely disagree

Three of these matter and one is a documentation bug.

**1. The tilt set.** The spec: four values, `-2.5° / -1° / 1.5° / 3°`, *"chosen per instance and
then frozen"*. 4a: fourteen angles, mostly under 1.6°. Following the spec literally makes every
tilt roughly twice as steep as the mockup's and removes the scatter. **Recommendation:** the
spec's *discipline* (chosen once, frozen, never random at render time) is right and
`GlyphRun.astro` already demonstrates how — derive from a seed. The spec's *values* are not the
mockup's. This needs the owner to either widen the set or accept 4a's.

**2. Off-palette colour.** 4a's structural colours are near-misses of the spec's — `#141319`
against `#100f14`, `#1a1822`, `#8d8798`, `#d6d2cc`, `#a39ead`. Those should all collapse onto
spec tokens; the difference is invisible. But 4a also carries genuine neon — `#ff3ec8`,
`#35e8e0`, `#ffb340` — which the six-colour rule forbids outright. Drop those.

**3. `font-stretch` on Archivo, 110–124%.** Not in the spec's type scale at all. It is part of
why cut words read as clippings rather than as labels. Needs adding to the spec or accepting as
a mark-only property.

**4. DOCUMENTATION BUG — corrected in `DESIGN-REFERENCES.md`.** That file's table said 4a uses
`radial-gradient(…)` pigment washes with `filter: blur(17px)`, and told the next session the
spec forbids them. Both halves are true — those washes *are* in 4a and they *are* forbidden.
But the file did not distinguish them from 4a's **linear** gradients, which are hard-stop
highlighter strokes and hatch patterns with no diffusion anywhere. An agent reading "the spec
forbids gradients" deletes marks 2 and 7. The distinction is diffusion, not the keyword.

---

## What to build first

In this order, because each one is visible on more pages than the last:

1. **Cut word + highlighter, on `h1`.** The rules-of-use table already permits up to two marks
   at h1 and the responsive table caps it at one below 600px. Deterministic word choice from a
   seed, exactly as `GlyphRun.astro` does it — no content change, no reshuffle on re-render.
2. **Tilted actions**, on the button variants that already exist in `src/styles/button.css`.
3. **Stamp**, on the card pages' suit/number line — `i / xii` is literally what those pages
   carry.
4. **Hatch plate**, behind card covers.

Marks are forbidden at body, ui, label and caption level. A page with marks everywhere is the
same failure as a page with none.
