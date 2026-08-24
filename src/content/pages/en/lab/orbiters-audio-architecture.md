---
outputPath: "lab/en/orbiters-audio-architecture"
title: "Orbiters audio architecture"
area: "maar"
kind: "lab"
tags: ["Orbiters", "audio", "DSP", "FAUST", "Web Audio"]
source: "authored"
lang: "en"
origin: "authored"
description: "Where the DSP runs, and what a voice costs."
date: "2026-08-24"
---

# Orbiters audio architecture

Where the DSP runs, and what a voice costs. Rewritten 2026-08-24 to the dimension-chain model.

<aside class="audio-architecture-note">

**For external reviewers.** Orbiters is a browser music instrument (Web Audio, multiplayer rooms, an embeddable player). Today each voice is a chain of per-module **Tone.js nodes** — one Web Audio node per effect, several of them per-sample JavaScript worklets — and on older hardware (2016 MacBook Pro) 23% of audio callbacks run over budget, with ~48% of audio-thread time spent in JS.

We are migrating to the model this page describes: modules authored once as **FAUST** `.dsp` sources, composed per voice into **one compiled WASM unit** for playback, while edit mode keeps a swappable per-module graph built from the same sources. Alongside the engine change, the authoring model changes too (§6): serial chains per “dimension”, decoupled macros, stage-based routing.

Feedback is most useful on the *flagged warning notes* — the unit-boundary questions in §2, and the two-runtime parity risks in §3.

</aside>

<aside class="audio-architecture-note audio-architecture-note--warning">

**Model change, 2026-08-24 — affects all planning.** Module chaining moved from the macro axis to the **dimension**. A dimension no longer holds three one-module slots owned by X/Y/Z. It holds **one serial chain of up to three modules**, and the macros are decoupled from it. Serial/parallel routing now applies **between dimensions**, not between modules. Earlier versions of this page (and any planning text describing 3×3 axis slots or per-module wiring) are superseded.

</aside>

<div class="audio-architecture-flow">

<section class="audio-architecture-flow__model">

## 6. The model

### A dimension is a chain

One serial chain, one to three modules, in a fixed type order — the signal must be created before it can be processed:

1. **MIDI effect** — optional. Operates on notes, so it sits before anything that produces sound.
2. **Instrument** — exactly one, in a *head* chain: one whose stage receives no signal. A chain that already receives signal (a downstream stage, or any Moon chain — its input is the send) is **effects-only and may not hold an instrument**.
3. **Audio effects** — optional, up to the chain limit. Downstream of the instrument only; their order among themselves is free and musically meaningful (filter → delay ≠ delay → filter).

<figure class="audio-architecture-diagram">
<svg viewBox="0 0 880 150" role="img" aria-label="One dimension: an optional MIDI effect feeds the required instrument, which feeds audio effects in series. Macros X Y Z map onto parameters anywhere in the chain.">
  <defs>
    <marker id="c1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="currentColor"/></marker>
    <marker id="c1a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="var(--accent)"/></marker>
  </defs>
  <g stroke="currentColor" stroke-width="1.5" fill="none"><rect x="30" y="34" width="150" height="40" rx="4" stroke-dasharray="5 3"/><rect class="diagram-focus" x="230" y="34" width="170" height="40" rx="4" stroke-width="2"/><rect x="450" y="34" width="140" height="40" rx="4"/><rect x="640" y="34" width="140" height="40" rx="4"/></g>
  <g fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#c1)"><line x1="180" y1="54" x2="226" y2="54"/><line x1="400" y1="54" x2="446" y2="54"/><line x1="590" y1="54" x2="636" y2="54"/><line x1="780" y1="54" x2="830" y2="54"/></g>
  <g font-size="12" fill="currentColor" text-anchor="middle"><text x="105" y="52">MIDI effect</text><text x="105" y="67" font-size="10" opacity=".7">optional · notes</text><text x="315" y="52" font-weight="600">INSTRUMENT</text><text x="315" y="67" font-size="10" opacity=".7">required · exactly one</text><text x="520" y="52">audio effect</text><text x="710" y="52">audio effect</text><text x="615" y="21" font-size="10.5" opacity=".7">order free among effects</text></g>
  <g fill="var(--accent)" font-size="11.5" text-anchor="middle"><text x="120" y="128" font-weight="600">X · Y · Z macros</text></g>
  <g fill="none" stroke="var(--accent)" stroke-width="1.3" marker-end="url(#c1a)"><path d="M170 122 L315 122 L315 80"/><path d="M170 122 L520 122 L520 80"/><path d="M170 122 L710 122 L710 80"/></g>
  <text x="500" y="143" font-size="10.5" fill="var(--accent)" text-anchor="middle">each macro → any parameters, anywhere in this dimension’s chain</text>
</svg>
<figcaption>The chain is owned by the dimension. Macros are decoupled: X, Y and Z each carry an ordered mapping list <code>{module, parameter, min, equilibrium, max, curveLow, curveHigh}</code> reaching any parameter in the chain. One macro may drive many parameters; <strong>a parameter is driven by at most one macro</strong>.</figcaption>
</figure>

<aside class="audio-architecture-note">

**Legality is enforced at the edit surface, not after the fact.** A second instrument in one chain is invalid; a MIDI effect cannot sit after the instrument; an audio effect cannot sit before it; a chain with no instrument is silent — the instrument is what makes a dimension playable. Insertion points, drag-reorder and the module picker filter to what is legal at that position.

</aside>

### Routing is between dimensions

Dimensions wire freely as an **ordered list of stages**: each stage holds one or more dimensions in parallel — they see the same input and sum — and stages run in series. Common shapes: `I → II → III`, `I → II + III`, `I + II → III`, `I + II + III`. Edit verbs: move earlier / later, parallel with previous, split to its own stage. Inside a dimension the chain is always serial — no wiring choice there.

**In the World, dimension 1 carries the generator and is always first** — anything upstream of it would receive silence. The Moon’s stages take the send as their input.

<figure class="audio-architecture-diagram">
<svg viewBox="0 0 880 220" role="img" aria-label="Serial: dimension one feeds dimension two feeds dimension three. Parallel: all three dimensions run side by side and merge.">
  <defs><marker id="c2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="currentColor"/></marker><marker id="c2a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="var(--accent)"/></marker></defs>
  <text x="212" y="28" font-size="12.5" fill="currentColor" text-anchor="middle" font-weight="600">SERIAL</text><g stroke="currentColor" stroke-width="1.4" fill="none"><rect x="40" y="86" width="96" height="32" rx="3"/><rect x="164" y="86" width="96" height="32" rx="3"/><rect x="288" y="86" width="96" height="32" rx="3"/></g><g fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#c2)"><line x1="136" y1="102" x2="160" y2="102"/><line x1="260" y1="102" x2="284" y2="102"/><line x1="384" y1="102" x2="414" y2="102"/></g><g font-size="11.5" fill="currentColor" text-anchor="middle"><text x="88" y="106">dim 1</text><text x="212" y="106">dim 2</text><text x="336" y="106">dim 3</text></g><text x="212" y="160" font-size="11" fill="currentColor" text-anchor="middle" opacity=".75">each processes the previous one’s output</text>
  <line x1="440" y1="40" x2="440" y2="190" stroke="currentColor" stroke-width="1" opacity=".3"/>
  <text x="668" y="28" font-size="12.5" fill="var(--accent)" text-anchor="middle" font-weight="600">PARALLEL</text><g stroke="var(--accent)" stroke-width="1.4" fill="none"><rect x="612" y="52" width="96" height="28" rx="3"/><rect x="612" y="88" width="96" height="28" rx="3"/><rect x="612" y="124" width="96" height="28" rx="3"/></g><g fill="none" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#c2a)"><path d="M540 102 L576 102 L576 66 L608 66"/><path d="M540 102 L608 102"/><path d="M540 102 L576 102 L576 138 L608 138"/><path d="M708 66 L748 66 L748 102"/><path d="M708 138 L748 138 L748 102"/></g><line x1="708" y1="102" x2="744" y2="102" stroke="var(--accent)" stroke-width="1.5"/><g fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#c2)"><line x1="748" y1="102" x2="800" y2="102"/></g><g font-size="11.5" fill="currentColor" text-anchor="middle"><text x="660" y="70">dim 1</text><text x="660" y="106">dim 2</text><text x="660" y="142">dim 3</text></g><text x="668" y="176" font-size="11" fill="currentColor" text-anchor="middle" opacity=".75">side by side from the same input, merged</text>
</svg>
<figcaption>Serial and parallel are the two poles; the stage list expresses everything between (<code>I + II → III</code> etc.). The wiring lives in the stored description and is <code>structural</code> — changing it recompiles the voice. Today’s code hardwires serial (<code>AudioEngineAdapter.js:3827-3858</code>, <code>:4318</code>); that becomes the default, not a fact of the engine.</figcaption>
</figure>

<aside class="audio-architecture-note audio-architecture-note--warning">

**Settled 2026-08-24: an instrument cannot sit in a chain that already receives signal.** Head chains (World’s first stage) hold the instrument; every downstream chain, every Moon chain, and Mix’s possible master chain are effects-only. The edit surface enforces it like the other legality rules.

</aside>

### Mix — a third entity (to design)

Alongside World and Moon: 1–3 dimensions (author picks), X/Y/Z macros, **no instrument**. Its mappings target the high level — world level, moon level, the world↔moon mix (a level pair, not a new node), pan — plus **body macros**, so one Mix macro moves both bodies at once (Mix → macros → parameters keeps “one parameter, one macro” intact). Sends are not a Mix target. Own accent and glyph; the Instrument tab shows only the mapping list.

<aside class="audio-architecture-note audio-architecture-note--warning">

**Open:** does Mix also carry a **master effects chain** (compression, distortion on the summed output)? That is an effects-only chain sitting at the master — where it lands relative to the OUT fader, gain rail and limiter joins the §2 boundary questions. And the enumerated Mix-target list still needs writing.

</aside>

### One panel per Orbiter

The panel — theme preset, colours, radius, font, ring — moves from the dimension to the **Orbiter**: stored once, applied to every view, edited above the body and dimension selectors. The per-dimension `design` block (`orbiterFallback.js:49-72`) goes away with the format change; migration keeps dimension 1’s panel and drops the rest.

### Stored description

```
orbiter
├── panel                        theme, colours, radius, font, ring — one for everything
├── mix                          third entity — no instrument; macros → mixer + body macros
│   └── dimensions[1..3]         (open: a master effects chain?)
└── bodies                       planet (world), moon
    ├── routing                  dims serial | parallel (+ send pre/post-fader)
    └── dimensions[1..3]
        ├── enabled
        ├── chain                [midiFx?] → instrument → audioFx*   (≤3 modules)
        │   └── modules[]        module id, preset, parameter values
        └── macros
            ├── x → mappings[]   { module, parameter, min, equil, max, curveLow, curveHigh }
            ├── y → mappings[]
            └── z → mappings[]
```

The description is versioned from the first record written. Modules ship **parameter tables only**; no per-module macros, no factory presets.

</section>

<section class="audio-architecture-flow__core">

## 1. What a voice costs today

<figure class="audio-architecture-diagram">
<svg viewBox="0 0 880 130" role="img" aria-label="Current graph: a player feeds nine chained effect nodes across three dimension stages, then the gain rail and limiter.">
  <defs><marker id="c3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="currentColor"/></marker></defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#c3)"><line x1="108" y1="60" x2="150" y2="60"/><line x1="252" y1="60" x2="288" y2="60"/><line x1="390" y1="60" x2="426" y2="60"/><line x1="528" y1="60" x2="564" y2="60"/><line x1="666" y1="60" x2="702" y2="60"/></g><g stroke="currentColor" stroke-width="1.5" fill="none"><rect x="16" y="40" width="92" height="40" rx="4"/><rect class="diagram-stage" x="150" y="40" width="102" height="40" rx="4"/><rect class="diagram-stage" x="288" y="40" width="102" height="40" rx="4"/><rect class="diagram-stage" x="426" y="40" width="102" height="40" rx="4"/><rect x="564" y="40" width="102" height="40" rx="4"/><rect x="702" y="40" width="150" height="40" rx="4"/></g><g font-size="12" fill="currentColor" text-anchor="middle"><text x="62" y="64">player</text><text x="201" y="64">EW::I racks</text><text x="339" y="64">EW::II racks</text><text x="477" y="64">EW::III racks</text><text x="615" y="64">gain rail</text><text x="777" y="64">limiter → out</text></g><text x="440" y="112" font-size="11" fill="currentColor" text-anchor="middle" opacity=".7">every rack builds 3 nodes even with no effect loaded — ~44 graph nodes before any module DSP</text>
</svg>
<figcaption>One Web Audio node per module, plus plumbing: ~27 nodes from the nine racks alone (<code>rack.js:619-629</code>), 9 per-dimension (<code>AudioEngineAdapter.js:3809-3821</code>), ~8 outer. Per-sample JS worklets: bitcrusher and <strong>both</strong> reverbs (both are JCReverb). “N nodes per voice” is the wrong unit — count <strong>DSP units</strong> and <strong>graph nodes</strong> separately.</figcaption>
</figure>

## 2. Target — one compiled unit per voice

All chains, both bodies, one FAUST program per voice, compiled on save. The gain rail stays outside it.

<figure class="audio-architecture-diagram">
<svg viewBox="0 0 900 300" role="img" aria-label="Target: normalization and input trim feed one compiled FAUST unit holding the planet’s dimension chains and the moon’s, joined by send and return; the output fader, master trim and limiter follow.">
  <defs><marker id="c4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="currentColor"/></marker><marker id="c4a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="var(--accent)"/></marker></defs>
  <rect x="196" y="24" width="520" height="240" rx="8" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="210" y="46" font-size="12" fill="var(--accent)" font-weight="600">ONE compiled FAUST unit</text>
  <g stroke="currentColor" stroke-width="1.5" fill="none"><rect x="16" y="118" width="60" height="40" rx="4"/><rect x="92" y="118" width="60" height="40" rx="4"/><rect class="diagram-stage" x="216" y="62" width="480" height="70" rx="5"/><rect class="diagram-stage" x="216" y="176" width="480" height="70" rx="5"/><rect x="736" y="118" width="60" height="40" rx="4"/><rect x="812" y="118" width="76" height="40" rx="4"/></g><g fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#c4)"><line x1="76" y1="138" x2="88" y2="138"/><line x1="152" y1="138" x2="212" y2="138"/><line x1="700" y1="97" x2="736" y2="97" opacity="0"/><line x1="696" y1="138" x2="732" y2="138"/><line x1="796" y1="138" x2="808" y2="138"/></g><g font-size="11.5" fill="currentColor" text-anchor="middle"><text x="46" y="142">norm</text><text x="122" y="142" font-weight="600">IN</text><text x="456" y="84" font-weight="600">PLANET — dimension chains</text><text x="456" y="110" font-size="10.5" opacity=".75">[midi?] → instrument → fx* · dims serial or parallel</text><text x="456" y="198" font-weight="600">MOON — parallel bus, same shape</text><text x="456" y="224" font-size="10.5" opacity=".75">send → chains → return</text><text x="766" y="142" font-weight="600">OUT</text><text x="850" y="136">master</text><text x="850" y="150" font-size="9.5" opacity=".7">−0.5 dB → limiter</text></g><g fill="none" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#c4a)"><path d="M300 132 L300 154 L300 172"/><path d="M620 176 L620 154 L620 132"/></g><g font-size="10.5" fill="var(--accent)" text-anchor="middle"><text x="264" y="158">send = travel to the Moon</text><text x="652" y="158">return</text></g><text x="450" y="288" font-size="11.5" fill="currentColor" text-anchor="middle" font-weight="600">≤3 modules per dimension · 6 macros (3 planet + 3 moon) · gain rail unchanged</text>
</svg>
<figcaption>The instrument is a chain module (the track player module <em>wraps</em> the existing player — decode, streaming and Signalsmith stretch stay their own nodes, not FAUST). The two user gain stages stay where they are: <code>IN</code> trim before the unit, <code>OUT</code> fader after it, both metered via <code>createLevelTap</code> (<code>AudioEngineAdapter.js:2286</code>) — fold them in and the tap points vanish.</figcaption>
</figure>

<aside class="audio-architecture-note audio-architecture-note--warning">

**Boundary questions still open:** a *post-fader* send taps after the OUT fader, which the unit never sees — mirrored fader parameter, or move the fader in; the *return point* — before OUT (fader kills the tail) or at the master (unit needs a second stereo output); and `deckChannel` + stage headroom (`AudioEngineAdapter.js:3807-3860`) — the per-dimension pan stage compiles in, or one unit is impossible. These need deciding before implementation.

</aside>

## 3. Two runtimes, one DSP source

| | Edit runtime | Play runtime |
| :-- | :-- | :-- |
| Shape | one node per module, hot-swappable | one compiled unit per voice, built on save |
| For | authoring — instant chain edits | listeners and rooms — one `process()` per voice |
| Source | the **same** per-module `.dsp`, compiled standalone (edit) or composed via `component()` (play). Smoothing lives in the `.dsp`, never in the host. | |

<aside class="audio-architecture-note audio-architecture-note--warning">

**The hazard: “it sounded different in edit mode.”** Sources are shared, but drift can still come from render-quantum boundaries, latency, denormals and bypassed branches. CI renders the same description through both runtimes and compares.

</aside>

## 4. What triggers a recompile

FAUST compiles every branch in the program: a module bypassed at *runtime* still costs full price; only a module absent at *compile* time is free. A playing voice is never switched — a recompile applies to the next voice.

| Change | Cost | Declared as |
| :-- | :-- | :-- |
| Any macro or parameter move, the send level | a parameter write | `reactivity: 'live'` |
| Filter `type` / `model` / `slope`, granular `anchored` | recompile | `reactivity: 'structural'` |
| Chain edits, dimension routing, macro re-mapping | recompile | the stored description |

## 5. What stays outside the unit

| Stays outside | Why |
| :-- | :-- |
| Decode, streaming, Signalsmith stretch | Not FAUST; already WASM where it matters. The instrument module wraps them. |
| The clock — `Tone.now()` via `toneClockBackend.js` | Already the audio hardware clock; rooms are live. Out of scope. |
| The sync layer | Sockets, async. FAUST has no I/O. |
| Cosmic LFO and every axis control value | Arbitrated in `PRIORITY_MAP`, room-replicated, drives the knob. Correct on rAF. |
| The shared master — `MultiOrbiterAudioHost` | One bus and limiter across N voices. |
| The gain rail — norm / IN / OUT | Metering taps and persisted MIDI-mapped ids. See §2. |

What *does* go inside, beyond the DSP: a module’s own internal modulators, driven by a **phase anchor + rate** handed in by the JS transport. The unit gets no clock.

<aside class="audio-architecture-note audio-architecture-note--warning">

**Unmeasured.** “Stacking inside one compiled unit is cheap” is an assumption. The comparison measures one unit against chained nodes at three simultaneous orbiters on the 2016 MacBook Pro — if one unit does not win clearly, the shape is wrong, and that is worth finding in week one.

</aside>

</section>

</div>
