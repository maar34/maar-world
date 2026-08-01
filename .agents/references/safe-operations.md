---
last-verified: 2026-08-01
verified-against: initial bootstrap (MW-15 follow-up)
status: active
---

# Safe Operations — Maar World

## Safe without confirmation

- Read or search any file
- `npm run dev` — serves `https://local.maar.world:4321` from the booted slot
- `npm run build` — writes `dist/`, touches nothing tracked
- `npm run verify` and any single `verify:*`
- `npm run ledger -- find <term>`, `npm run ledger:check`
- `npm run i18n:map` (`-- --todo` for gaps)
- `git status`, `git diff`, `git log`
- Appending a ledger line (`ledger -- append`) — append-only by design
- Claiming, labelling and releasing worktree slots

## Requires human confirmation

- **`npm run contract:relock`**, in any form. It changes a frozen contract. If a re-lock is
  what makes a check pass, that is not a fix — append `BLOCKED`.
- **`npm run freeze:routes`** — regenerates the route manifest.
- **Any change to a card URL**, or deleting/renaming any route.
- **Adding a fourth application-JavaScript exception.** Three exist, each an owner decision.
- Anything touching **DNS, the live sites, or a legacy checkout** (`../maar.world-site`,
  `../collect.maar.world`, `../tree.maar.world` are read-only source material).
- Dependency upgrades or removals, `.env` changes, destructive file operations.
- `git push`, and merging to `main`.

## Domain guardrails

**Do not "fix" a check by changing what it asserts.** The frozen manifest, the policy set and
the contract lock exist because that shortcut was taken once and passed. Fix the code, or
report the blocker.

**Do not edit `.public/`.** Generated on every dev and build from `media/`.

**Do not hand-edit `MIGRATION-LEDGER.md`.** It is append-only and its history is verified by
`ledger:check` across the file's whole git history. Use `ledger -- append`.

**Do not start a dev server by hand.** Use `.ps-preview/mw boot maar-world <wt-N|trunk>`; a
hand-made pm2 entry bakes a slot path into the process, so a later restart returns there.

## When unsure

Append a `BLOCKED` line with the reason and move to the next independent unit. Do not guess,
and do not stall. Three consecutive failures of the same kind: stop, append `BLOCKED`,
summarise.
