# Decision Records

Records a decision future agents and developers need preserved. Created only when the bar
below is met — a log of every choice ever made is a log nobody reads.

These moved here from `docs/adr/` when the `.agents/` system was adopted (see `0003`). Numbers
were **kept**, not reassigned: `0001` and `0002` are referenced from code comments, the ledger
and `docs/LOCAL-DEVELOPMENT.md`, and renumbering would silently break every one of them.

## Format

```markdown
# NNNN — Short title

**Status:** proposed | accepted | superseded by NNNN
**Date:** YYYY-MM-DD
**Issue:** MW-##

## Context
What was true that forced a choice. The alternatives that were real.

## Decision
What was chosen.

## Consequences
What this now costs or constrains — including the parts that are worse.

## Related files
```

## The bar

All three, not one:

- A non-obvious choice between **real** alternatives was made
- It **constrains future work** meaningfully
- **Reverting would be expensive**

A decision that only affects one file is a code comment. A decision that only affects one
session is a ledger line.

## Platform-wide decisions

If a decision also has significance beyond this repo — infrastructure, cross-app contracts,
anything the other Plantasia repos would need to follow — write the corresponding note via the
`ps-docs-authoring` skill as well. This folder is Maar World's record, not the platform's.

## Index

| # | Title | Status |
|---|---|---|
| 0001 | One `pages` collection, and navigation as declared config | accepted |
| 0002 | `local.maar.world` and worktree-based development | accepted |
| 0003 | Adopt the `.agents/` skills system | accepted |
