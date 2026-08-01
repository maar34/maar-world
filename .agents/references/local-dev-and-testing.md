---
last-verified: 2026-08-01
verified-against: MW-15 (local.maar.world + worktree workflow)
status: active
---

# Local dev & testing — Maar World

## Source of truth

- **Shared workflow policy:** the `ps-local-workflow` skill — slot discipline, trunk rules,
  consent before pushing to trunk.
- **This repo's setup and daily loop:** `docs/LOCAL-DEVELOPMENT.md` (kept in `docs/` rather
  than here because it is for humans setting up a machine, not only for agents).
- This file carries only what an agent needs to know before touching anything.

> **Branch convention note.** The old `<username>-local` integration branch (`bruna-local`) is
> **retired**, along with `preview.sh` / `cleanup.sh`. Work happens in numbered worktree slots
> on `wt/N-<slug>` branches. If you find a doc or template still describing `<username>-local`,
> it is stale — this line is the correction.

## Before you touch code

```sh
~/Documents/Github/maar-world/.ps-preview/mw wt-claim maar-world     # prints the slot path
~/Documents/Github/maar-world/.ps-preview/mw wt-label maar-world <N> "MW-## short title"
```

`cd` into the printed path and work only there. The primary checkout stays parked on `main`,
and a direct commit on `main` is refused by a pre-commit hook — that is the hook, not a broken
repo. Cut from trunk, merge back to trunk, never branch off another slot.

Keep `.ps-slot.json` honest (`working` / `needs-input` / `idle`); the monitor is how a human
sees who is doing what.

## Serving

```sh
~/Documents/Github/maar-world/.ps-preview/mw boot maar-world wt-1    # or: trunk
```

Never start `astro dev` by hand. Dev serves **https://local.maar.world:4321** — HTTPS, on the
real hostname, which needs mkcert certs in `.certs/` and a `127.0.0.1 local.maar.world` host
entry. Without certs it falls back to plain-HTTP localhost, which is a working fallback and
not the supported origin.

The monitor widget is `http://localhost:4178/widget` — one instance covering both this
workspace and `ps-all`.

## Testing

`npm run verify` is the source of truth. It composes every `verify:*` check plus
`ledger:check`. Per unit of work, run the **narrowest** relevant one:

| Check | Covers |
|---|---|
| `verify:cards` | The 35 NFC card codes, both URL forms |
| `verify:contract` | The frozen route + policy contract hashes |
| `verify:routes` | The route manifest against the build |
| `verify:content` | Content records and their expectations |
| `verify:links` | Internal links |
| `verify:a11y` | Accessibility across every built page |
| `verify:translations` | The `pages/<lang>/<outputPath>` filing rule, and the `/es/` prefix rule |
| `verify:schemas`, `verify:build`, `verify:selftest` | Schemas, build, the checks' own tests |

A `SKIP` has not passed — it has not run. `verify` prints skips separately for that reason.
`verify:cards` currently skips pending MW-10's host canary; that is expected, not a failure.

Fixtures use the `MW_VERIFY_ROOT` hook and never touch the real repo.

## Finishing

Append the ledger line, regenerate `HANDOFF.md`, commit with the issue key, get an explicit
go-ahead before merging to trunk, then release the slot:

```sh
~/Documents/Github/maar-world/.ps-preview/mw wt-release maar-world <N>
```
