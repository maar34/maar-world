# Agent Entry Point — Maar World

Binding for any agent session here. These rules exist because the work runs as long
unattended stretches against a finite context budget: conversation memory does not survive a
window boundary, repository state does.

## Read order

1. `/AGENTS.md` — repo-wide invariants (read the invariants in full, not in part)
2. This file — workflow and skill index
3. `MIGRATION-LEDGER.md` — **query it, never read it front to back** (see below)
4. `HANDOFF.md` — what was in flight when the last session stopped
5. The active Linear issue, in full — descriptions carry the traps and the explicit "do not" lists
6. The narrowest relevant skill from the index below

For anything visual, re-read the design source before implementing. It is actively edited and
**will** have changed; never trust values extracted in an earlier session, and never cache them
into this repo.

## Task workflow

1. Claim a worktree slot — `.ps-preview/mw wt-claim maar-world`. `main` is the trunk and direct
   commits on it are blocked. See `references/local-dev-and-testing.md`.
2. Identify the narrowest skill covering the task.
3. Copy `templates/task.md` and fill it in.
4. Do one unit of work.
5. Run the **narrowest relevant check** — `npm run verify:cards`, not the whole suite.
6. Append exactly one line to the ledger: `npm run ledger -- append <MW-n> <DONE|BLOCKED|NOTE> <unit> <detail>`.
   **Capped at 500 characters, enforced.** Say what changed, the number that moved, and which
   file to open. Reasoning goes in a comment beside the code, or a decision record if it is a decision.
7. Commit with the issue key in the message.
8. Update the affected skill or reference in the same commit if the change made it stale.

## The ledger

`MIGRATION-LEDGER.md` is append-only, 268+ entries, and every session pays for its length
forever. One session's entries averaged 3,222 characters and turned "read the recent ledger"
into an 11,500-token instruction on its own. Hence the hard 500-character cap, and hence:

```sh
npm run ledger -- find <term>     # query it
npm run ledger:check              # format + append-only history, part of verify
```

Because it is append-only it still lists blockers that later work closed. `ledger status`
overstates open work — reconcile against reality rather than copying it forward.

## Skill index

| Domain | File |
|---|---|
| Orientation, folder map, common mistakes | `references/overview.md` |
| Local dev, worktrees, trunk | `references/local-dev-and-testing.md` |
| Safe vs. confirm-first commands | `references/safe-operations.md` |
| How a killed session resumes | `references/resumability.md` |
| Writing or fixing a page | `skills/maar-content-authoring/SKILL.md` |
| The visual language and its marks | `skills/maar-visual-language/SKILL.md` |
| Which design reference wins | `skills/maar-design-authority/SKILL.md` |

Decision records: `decisions/`.

## Safe commands (no confirmation)

Read or search any file · `npm run dev` · `npm run build` · `npm run verify` and any
`verify:*` · `npm run ledger -- find` · `npm run ledger:check` · `npm run i18n:map` ·
`git status` / `diff` / `log`.

## Requires human confirmation

- `npm run contract:relock` (any form) — changes a frozen contract
- `npm run freeze:routes` — regenerates the route manifest
- Anything touching DNS, the live sites, or a legacy checkout
- Deleting or renaming a route, or any change to a card URL
- Adding a fourth application-JavaScript exception
- Dependency upgrades, `.env` changes, destructive file operations

## Ambiguity

On ambiguity that changes what a visitor sees: append `BLOCKED` with the reason and move to
the next independent unit. Do not guess. Do not stall. Where the design spec is marked in
progress, implement only what is settled and log the rest — do not invent the missing half.

On three consecutive failures of the same kind: stop, append `BLOCKED`, summarise.

## Hard stop conditions

Stop and write a handoff rather than continuing when `verify:cards` fails and the cause is not
obvious within two attempts; when the route manifest would have to change for something to
pass; when a change would touch DNS, the live sites or a legacy repository; or when remaining
context is low enough that stopping cleanly beats starting a new unit.

**Stopping cleanly:** finish or explicitly abandon the current unit (never half-applied),
append the ledger line, regenerate `HANDOFF.md`, commit. The test: the same starting prompt in
a fresh context, with nothing but this repo and the Linear issues, resumes without redoing
finished work or silently skipping unfinished work.

## Freshness

Code is the source of truth. When a skill disagrees with the code, update the skill.
Update skills in the same commit as the change that made them stale. Over ~80 lines, split.
`active` = verified · `partial` = partly checked · `needs-review` = likely stale.
