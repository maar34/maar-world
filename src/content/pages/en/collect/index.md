---
outputPath: "collect/index"
title: "Sky Sounds - COLLECT.MAAR.WORLD"
area: "collect"
kind: "index"
tags: []
source: "collect.maar.world/index.html"
lang: "en"
origin: "migrated"
family: "collect"
description: "Explore a new musical dimension with Sky Sounds, a collection of cards that open the doors to a sonic journey through the cosmos."
headingHtml: "<span class=\"mark mark--cut mark--tilt-4 mark--tear-2\">collect</span>"
collect:
  pitch:
    title: "Play music cards with exoplanets"
    mark: "exoplanets"
    body: "Sky Sounds introduces the first-ever card collection that when scanned allows you to listen to their music and transform them based on the movement of the exoplanets they belong."
    cta: "Collect"
  orbiters:
    label: "What is an Orbiter?"
  journey:
    title: "Start your journey"
    mark: "journey"
    carouselLabel: "5 photographs"
    slides:
      - step: "I"
        caption: "Choose a Sky Sound card that resonates with you and tempts you to explore its soundscapes."
      - step: "II"
        caption: "For physical editions, scan the card with your smartphone or NFC reader on your PC to access its contents. Discover hidden parameters in for digital cards."
      - step: "III"
        caption: "Play the music associated with the card to immerse yourself in its sound universe."
      - step: "IV"
        caption: "Add more cards to your composition. You can include as many cards as your device can handle, further enriching and personalizing your musical experience."
      - step: "V"
        caption: "Transform the music using the effects and loops provided by the card, creating your own version or musical piece."
---

<!--
  THIS BODY IS EMPTY, AND THAT IS THE FIX — MW-19.

  It used to hold ~45 elements of raw HTML: a twelve-column grid, five hero
  plates, a YouTube facade, two buttons and a five-slide carousel. Every one of
  them was ALSO written out in src/content/pages/es/collect/index.md, because
  translating this page meant copying the whole page and translating the words
  inside it. Two copies of one structure, kept in step by hand, and by the time
  anyone measured they were two elements out of step — the largest drift on the
  site, and visible: the Spanish page rendered differently from this one.

  The structure now lives once, in src/components/families/Collect.astro. What
  is left here is this page's words, in the `collect` field above, and the
  Spanish record holds the same fields with Spanish in them. A design change is
  one edit in the component. A translation is words.

  WHERE THE REST OF THE PAGE'S TEXT LIVES, so nothing is hunted for:

    the h1                 `headingHtml` above — it carries a type mark, so it
                           is HTML, exactly like family 01's
    the opening sentence   `description` above. It is not repeated here: the
                           family passes it to the collage, which renders it as
                           a moving field of cut words
    the closing two cards  COLLECT_LANDING in src/config/site.ts, keyed by
                           language — they are what the FAMILY says, not what
                           this page says
    the contact form       the same place, same reason
    every image            COLLECT_JOURNEY_IMAGES / COLLECT_BAND_IMAGE, once,
                           because a photograph is the same photograph in
                           Spanish
    the two URLs           COLLECT_STORE_URL and COLLECT_VIDEO_URL. A `cta` in
                           the field above is a LABEL; no content record on this
                           site carries a storefront address

  The slot is still rendered, so a paragraph added below this comment appears
  under the carousel and above the closing pair.
-->
