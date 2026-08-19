# 0008 — One AI notice, uniform, at the foot of the page

**Status:** proposed — the compliance text is a draft awaiting the owner
**Date:** 2026-08-14
**Issue:** MW — EU AI Act Article 50

## Context

Article 50 of Regulation (EU) 2024/1689 has applied since **2 August 2026**. The
Digital Omnibus deferred the Annex III high-risk timetable to 2 December 2027
and **left Article 50 where it was**, so this is in force now, not pending.

Maar World is a **deployer**, never a provider: static site, no model, no
inference at request time. That narrows seven paragraphs to one. 50(1) has
nothing to attach to. 50(2)'s marking duty is the model provider's. 50(3) needs
emotion recognition or biometric categorisation, and neither is deployed. What
binds is **50(4)**: where a published work was generated or altered with AI,
disclose it. **50(5)** says how — clear, distinguishable, accessible, and no
later than first exposure.

## What was built first, and why it was wrong

The first implementation tried to be precise. It carried a per-work sentence
naming the tools, rendered it directly under the card artwork, gated it on the
suit, and **left `STW3344` out** on the grounds that its credits named no AI.

The owner corrected it on 2026-08-14, on two counts:

1. **The facts.** AI was used more widely than the credits tables record —
   including on cover artwork and on the card the implementation had excepted.
   The tables are not an inventory of AI use; they are credits.
2. **The shape.** Precision here commits the site to a card-by-card audit that
   is not going to happen, and that goes stale the moment a work is revised.
   "I won't go one by one saying that."

Plus a design instruction: **smaller, at the bottom, softer.** The regulation
was experienced as heavy-handed for a body of fictional artwork, and the page
should not feel that way.

## Decision

**One sentence, identical everywhere, as fine print at the foot of the page.**

- The notice is `Parts of this work were made with AI.` plus a link to
  `/ai-transparency`. It names no tool, so no page carries a fact that can rot.
- **Uniform across every card**, `STW3344` included. No exceptions to maintain,
  and no page making a claim its neighbour contradicts.
- Rendered by `shell-dark/Shell.astro` at the end of `<main>`, above the footer,
  from a boolean `ai` prop. The shell owns placement so a route cannot vary it;
  routes decide only *whether*. Off by default — most pages carry no AI-made
  work and a notice there would be false.
- The detail — tools, releases, the full statement — lives once on
  `/ai-transparency` and `/es/ai-transparency`.
- A record opts in with **`ai: true`**, a bare boolean. It was briefly an enum of
  work ids; since the notice names no work, the enum was a flag wearing a
  costume and implied a page could say something specific about its own work.

### The covers, and the check that came out of them

The owner then added (2026-08-14) that **every collage under `/img/collages/` is
AI-assisted** — mixed, not generated: elements made by hand first, then combined
with AI. That is `compositeWithTrainedAlgorithmicMedia` in the exact sense the
IPTC term is defined for, so the marker was already right and only the scope
moved. Sixteen more pages came into range, plus `lab/dadada` by name.

The first attempt asked `collageFor(outputPath)` and **missed four pages**: the
home page paints four collages and the Tree hub one, and neither goes through
that helper — `SECTION_COLLAGE` keys the home page as `''` while its record's
`outputPath` is `index`. Every check in the suite was green while four pages
made an undisclosed use of AI artwork.

So `verify:a11y` now asserts it **against the built HTML**: *every page showing
an AI collage discloses it*. That is the only version that can catch the
route's expression being wrong, rather than restating it. It was confirmed to
fail — dropping `tree` from `COLLAGE_FAMILIES` names `/tree/` and `/es/tree/`
— before being left green.

**This is not a weaker disclosure; for this site it is a truer one.** 50(4)'s
second subparagraph limits the obligation on an "evidently artistic, creative,
satirical, fictional or analogous work" to disclosing the **existence** of
generated content "in an appropriate manner that does not hamper the display or
enjoyment of the work". Existence is exactly what one uniform sentence states.

**Bottom placement is still compliant.** 50(5)'s "at the latest at the time of
the first interaction or exposure" is about *which encounter*, not about height
on the page. The notice is on the same page as the work, present on first
exposure, in the reader's language, in the document.

## The floor this cannot go below

Soft has a hard limit here, and it is not a matter of taste:

- **`--ink-meta` is the softest ink text may use.** `verify:a11y` documents
  `--ink-faint` as "never text" — it clears 3:1, the bar for decorative
  graphics, not the 4.5:1 a caption owes. Going fainter fails the suite and
  fails the readers 50(5) names.
- **`--t-meta-size` (12px) is already the smallest type in the system**, and
  `tokens.css` is the only place a raw value may exist.

So the softening is done by **brevity and placement** — one short sentence
instead of a paragraph, no bold label, at the foot instead of under the artwork.
Both cost a reader nothing.

## Consequences

- 128 pages carry the notice: 35 NFC codes, 68 public card pages across both
  languages, 18 pages painting a collage, and the rest by `ai: true`.
- **`/STW3344` stays.** The owner noted Stoney Way was a private test, never
  really released, and offered to remove the page. It cannot go: `AGENTS.md`
  makes the 35 NFC codes an invariant because they are printed on physical
  cards already in people's hands, and removing one is a route-contract change
  and a dead URL. It carries the same uniform notice as everything else, which
  is also the least work.
- `<dl>`, `<dt>` and `<dd>` entered `prose.css` with the inventory list on the
  transparency page. `verify:build` demanded the rhythm decision.
- **The compliance text is a draft.** `attested` is true only for the Sky Sounds
  and covers entries, from the owner's own account. The Spanish half still needs
  a native legal read — the terms are the Regulation's own (`responsable del
  despliegue`, `ultrafalsificación`, `categorización biométrica`) and were
  checked against the 2025 corrigendum, but a draft should not be the thing that
  asserts that.
- **The negative claims in §4 of the statement are the strongest sentences on
  the page and the most fragile.** "No chatbot", "no analytics", "no AI decides
  anything about you" are true of the site as built. A future feature that adds
  any of them makes the page *wrong*, not merely incomplete. Nothing automated
  can catch it; it belongs in review of any change introducing a model, a script
  or a third-party call.
- The machine-readable marker is page-level microdata, not a content credential.
  It does not travel with a copied file. Embedding XMP or C2PA in the assets is
  the next step and the page says so rather than implying otherwise.
- The tool on the Sky Sounds cover artwork is **ChatGPT** (owner, 2026-08-14).
  Recorded without a version number: "ChatGPT-3" is accurate to the one use the
  credits table records and wrong for the covers, and pinning versions is the
  enumeration this design dropped.
- **`/ai-transparency` carries no effective date**, unlike the privacy policy.
  Owner's instruction: a date implies a version history someone maintains, and
  this page states how the work is made rather than terms that took effect. The
  statement was also cut from ~750 words to ~290 — Article 50 requires the
  disclosure to be clear, not exhaustive, and a long page about a small fact
  reads as a bigger admission than the fact is.

## External review (Codex, 2026-08-19)

Run before anything was committed. What it changed:

**Fixed.**

- **`/collect/cards` and `/es/collect/cards` carried no notice** while laying out
  all 34 card covers. They are `kind: 'page'` that *index* cards, so `isCard`
  never matched. Confirmed independently against the built HTML before fixing:
  105 pages paint `/img/cards/`, exactly 2 lacked the notice. `CARD_INDEXES` now
  covers them.
- **The built assertion only looked at `/img/collages/`**, which is why it did
  not catch the above. It now scans an `AI_ARTWORK` list of directories —
  `/img/collages/` and `/img/cards/` — and is renamed *every page showing AI
  artwork discloses it*. **This check has now missed a real gap once**, which is
  the argument for keeping it directory-based rather than page-based.
- **Spanish terminology was out of date.** The original Spanish text of the
  Regulation said «ultrasuplantación»; the 2025 corrigendum (BOE
  DOUE-L-2025-81474) replaced it with **«ultrafalsificación»** throughout,
  including Article 3(60) and Article 50(4). Verified against the corrigendum
  itself, not taken on the reviewer's word. Corrected, with the citation kept in
  the record's own note.
- **`lab/dadada` was flagged `ai: true` with nothing behind it.** A flag with no
  auditable basis is the exact failure this design exists to prevent, so it now
  has an inventory entry — `attested: false`, worded as the least specific true
  thing, because the owner said AI is involved and not what it did.

**Rejected, with reasons.**

- *"Titles use all-caps MAAR WORLD, against the casing rule."* False positive:
  50 existing records carry the same `- MAAR WORLD` suffix. The rule prohibits
  setting **copy** in all caps; this is the wordmark in `<title>`, and changing
  one record would make it the odd one out.
- *"Trailing whitespace in the privacy edits."* `privacy.mdx` already contains
  41 such lines — they are Markdown hard line breaks and the file's own style.
- *"The Spanish record authors component structure (`<Mark>`, `<AiWorkList>`)."*
  `es/privacy.mdx` already uses `<Mark>`, and calling a shared renderer is the
  prescribed fix rather than a violation of it — the rule bans copying HTML
  structure into a translation, which is why `AiWorkList` exists.

**Open, and the owner's call.**

- **Article 50(5) and foot placement.** The reviewer reads "at the latest at the
  time of the first interaction or exposure" as requiring the notice where the
  work is first *seen*, not after scrolling past it; this record reads it as
  naming the *encounter* rather than a position on the page. Both readings are
  defensible and the placement was the owner's explicit instruction. Documented
  here rather than silently resolved either way.
- **The check lives in `verify:a11y`** and is a compliance assertion, not an
  accessibility one. Moving it to `verify:content` or its own
  `verify:ai-disclosure` would put it where someone would look for it.
