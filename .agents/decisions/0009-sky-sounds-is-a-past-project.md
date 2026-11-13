# 0009 — Sky Sounds is a past project; the site sells nothing

**Status:** accepted
**Date:** 2026-11-13
**Supersedes:** 0005

## Decision

The owner stopped selling the Sky Sounds cards. The store was not working, and
the site is now informative: a record of a past project.

- Card catalogue pages (`/collect/cards/…`) carry no offer. `CARD_OFFER`,
  `SUIT_STORE_URLS`, `suitStoreUrl`, `suitDisplayName` and `.card-offer` are gone.
- The Collect landing's stamp and closing card point at the card archive
  (`/collect/cards`, `/es/collect/cards`), not Bandcamp. `COLLECT_STORE_URL` is gone.
  The pitch says the project is past and the cards are no longer sold.
- The home feature card points at `/collect`, not Bandcamp.
- `TREE_LINKS` loses "Get Your Cards".
- Privacy and Terms pages say sales have ended; Terms stay for past orders.
- `https://maar-world.bandcamp.com/merch` is an owner exclusion in
  `scripts/author-content-expectations.mjs` (`/`, `/collect`, `/tree`) and a reviewed
  removal in `routes/external-link-removals.json`.

NFC card pages (`[cardCode].astro`) were already offer-free and are untouched.

## What would reverse this

Selling again. Restore from git history of this commit rather than re-deriving.
