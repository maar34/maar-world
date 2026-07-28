# Handoff

Regenerated at every stop. A fresh agent should need nothing but this file,
`MIGRATION-LEDGER.md`, `docs/agent/OPERATING-RULES.md` and the Linear issue.

**Last updated:** 2026-07-28T22:20Z
**Last issue worked:** MW-3
**Next action:** start MW-4 — crawl the three production sites and freeze `routes/manifest.json`.

---

## Where the programme is

| Issue | Title | State |
|---|---|---|
| MW-3 | Resumable execution harness | **complete** — harness built, selftest green |
| MW-4 | Freeze the production route manifest | not started ← **next** |
| MW-5 | Repository, Astro scaffold, content schemas | not started |
| MW-6 | 35 NFC card records, 70 immutable URLs | not started |
| MW-7 | Maar pages, genesis codes, Lab articles | not started |
| MW-8 | Collect → `/collect/*`, Tree → `/tree` | not started |
| MW-9 | Embed facades, self-hosted fonts, Helix island | not started |
| MW-11 | Full verification + a11y/responsive sign-off | not started |
| MW-10, MW-12 | Cutover, stabilise | **human-gated — do not start** |

## In flight

Nothing. MW-3 finished cleanly.

## Blocked

Nothing yet. Blocked items are recorded in `MIGRATION-LEDGER.md` with `BLOCKED` and a reason,
and summarised by `npm run ledger -- status`.

## Decisions taken during MW-3 that a human should confirm

- **Repository name `maar-world`**, created at
  `/Users/Qubit/Documents/Github/maar-world/maar-world/`. Taken from the architecture review
  itself (§6 `maar-world/ # new repo`, §7 `github.com/maar34/maar-world`) rather than
  invented, because the brief left the destination repo name blank and stalling an unattended
  run was the worse option. Renaming is a `git mv` plus one line in `package.json`.
- **No git remote created and nothing pushed.** Creating a GitHub repository is outward-facing
  and human-gated. All work so far is local commits on `main`.

## State of the verify harness

`npm run verify` currently exits **0 with 5 skips** — correct for this point in the
programme, because every check's input is produced by work that has not happened yet:

| Check | Waiting on |
|---|---|
| `verify:build` | `astro.config.mjs` (MW-5) |
| `verify:routes` | `routes/manifest.json` (MW-4) |
| `verify:cards` | `routes/nfc-cards.json` (MW-4) |
| `verify:content` | `verify/content-expectations.json` (MW-7 / MW-8) |
| `verify:links` | `dist/` (MW-5) |

`npm run verify:selftest` exits 0 with 10/10 cases and is the evidence that the suite really
fails on broken builds — it constructs fixtures with known defects (missing card page,
re-cased filename, dropped `STW3344`, stripped `noindex`, redirected card URL, unclassified
route, third-party iframe) and asserts each one is caught.

## Artifact contracts the next sessions must produce

`routes/manifest.json` (MW-4):

```json
{
  "frozenAt": "ISO-8601",
  "source": "production crawl",
  "routes": [
    { "url": "/EBT5599", "origin": "maar.world", "status": 200,
      "policy": "preserve", "target": null, "title": "…", "notes": "nfc-card" }
  ]
}
```

`policy` is one of `preserve` | `redirect` | `drop`, and is **required on every route**.
`redirect` requires a non-empty `target`.

`routes/nfc-cards.json` (MW-4):

```json
{ "cards": [ { "code": "EBT5599", "source": "skysounds" },
             { "code": "STW3344", "source": "stoney_way" } ] }
```

Exactly 35 entries: 34 `skysounds` + 1 `stoney_way`.

`verify/external-links-baseline.json` (MW-4): `{ "urls": [...], "allowedNew": [...] }`.

`verify/content-expectations.json` (MW-7/8): `{ "pages": [ { "url", "headings", "contains",
"minTextLength", "images", "embeds", "links" } ] }`.

`verify/host-canary.json` (MW-10, human-gated): `{ "host": "...", "verifiedAt": "...",
"extensionlessFallback": true }`.

## Reminders that are easy to get wrong

- The design system project is **actively edited**. Re-read it live before implementing any
  component; never cache its values here.
- Legacy checkouts one directory up are **read-only**. Read them, never write.
- `verify:cards` guards a case-insensitive-filesystem trap: on macOS `existsSync` confirms
  `/ebt5599.html` for a file named `EBT5599.html`. Card filenames are therefore compared
  against an exact directory listing.
