---
last-verified: 2026-08-01
verified-against: initial bootstrap (MW-15 follow-up)
status: active
---

# Overview — Maar World

One static Astro 5 site. No backend, no CMS, no database. `output: 'static'`,
`build.format: 'file'`, `trailingSlash: 'never'` — those three settings are what make the card
URLs work, and they are not negotiable (`/AGENTS.md`).

## Folder map

| Path | What lives there |
|---|---|
| `src/content/` | The page records. One flat `pages` collection keyed by `outputPath` — see `decisions/0001` |
| `src/pages/` | Astro routes, including `[...page].astro` which renders every record |
| `routes/` | **Frozen contracts.** `manifest.production.json`, `policy.json`, `contract.lock.json`, `nfc-cards.json` |
| `scripts/` | The verify suite, the ledger tool, the content pipeline |
| `verify/` | Fixtures and canaries for the checks |
| `media/` | Tracked source images, assembled into `.public/` at dev/build time |
| `.public/` | Generated. Never edit; `assemble-public.mjs` writes it |
| `docs/` | Human-facing docs (`LOCAL-DEVELOPMENT.md`) |
| `.agents/` | This system |

## Entry points by task

- **Adding or fixing a page** → `skills/maar-content-authoring/SKILL.md`, then `src/content/`
- **Anything visual** → `skills/maar-design-authority/SKILL.md` to learn which reference wins,
  then `skills/maar-visual-language/SKILL.md`
- **A check is failing** → run the narrowest `verify:*`, read the script in `scripts/`
- **Resuming a dead session** → `references/resumability.md`

## Key invariants

The full list is in `/AGENTS.md` and must be read there. The three that catch people:

1. **The card URLs are physical.** 35 codes, both `/CODE` and `/CODE.html`, never redirected.
2. **The route manifest is a contract.** Regenerating it to make a check pass is the bypass
   that already happened once — `verify:contract` exists because of it.
3. **Application JavaScript has exactly three sanctioned uses.** A fourth is a decision.

## Common mistakes

- **Reading the ledger front to back.** It is append-only and enormous. Query it:
  `npm run ledger -- find <term>`.
- **Trusting `ledger status`.** Append-only means closed blockers still appear. It overstates
  open work.
- **Treating a green suite as done.** A `SKIP` has not passed, it has not run. `npm run verify`
  prints skips separately for exactly that reason.
- **Editing `.public/`.** It is generated on every dev and build.
- **Working in the primary checkout.** `main` is the trunk and commits on it are blocked;
  claim a slot.
- **Caching design values into the repo.** The design source is actively edited and will have
  changed since the last session read it.

## Documentation gaps

- No skill yet for the **verify suite** itself — how the checks compose, how to add one, what
  `MW_VERIFY_ROOT` fixtures do. It is the most-touched area in `scripts/` and the most likely
  next skill.
- No skill for the **content pipeline** (`assemble-public.mjs`, media → `.public/`).
- `skills/maar-visual-language/SKILL.md` is ~224 lines, well over the ~80-line guidance. It is
  a measured spec rather than a procedure, so it was moved intact rather than paraphrased —
  splitting it into "rules" and "measurements" is a real follow-up, but doing it carelessly
  would lose the measurements it exists to record.
