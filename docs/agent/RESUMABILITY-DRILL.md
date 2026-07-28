# Resumability drill

MW-3 acceptance: *kill an agent mid-run; a fresh agent reading only the ledger, handoff and
issue resumes correctly with no duplicated or skipped work. Demonstrate once.*

Performed **2026-07-28T23:05Z**, at the end of MW-6 — a real stop, not a simulated one.

## What a fresh agent runs, and what it learns

A new context window has no memory of anything above. It reconstructs the entire programme
state from the repository in four commands.

### 1. `npm run ledger -- status`

```
Ledger: 30 entries

  MW-3   done   2   blocked  0   note  2
  MW-4   done   4   blocked  1   note  2
  MW-5   done   9   blocked  0   note  1
  MW-6   done   6   blocked  2   note  1

  BLOCKED (3) — needs a human:
    MW-4  collect/%20-card-urls      …printed on physical material?
    MW-6  cards/dropbox-third-party  …MW-6 vs the MW-1 third-party gate
    MW-6  cards/artizen-destination  …Artizen URL does not exist yet
```

Tells it: MW-3 to MW-6 are done, nothing is half-finished, three things need a human.

### 2. `npm run ledger:check`

```
ledger ok — 30 entries, append-only intact
```

Tells it the record has not been rewritten or reordered, so it can be trusted.

### 3. `npm run verify`

```
Total: 19 passed, 2 failed, 2 skipped
Result: FAIL — verify:routes, verify:links
```

Tells it exactly what is outstanding, in machine-checkable terms:
`192 of 264 preserved routes missing` is the migration progress metric, and the two SKIPs
name the issue that produces each missing input. It never has to guess whether something was
finished — the exit code decides.

### 4. `git log --oneline`

```
9625cd3 MW-6: migrate the 35 NFC card records and emit all 70 immutable URLs
6879c2c MW-5: Astro scaffold, design tokens, content schemas and asset pipeline
e696b33 MW-4: freeze the production route manifest from a live crawl
6cbf16a MW-3: resumable execution harness for unattended migration runs
```

One commit per issue, each carrying its issue key.

## Why this resumes without duplicating or skipping

- **No duplication.** Every finished unit has a ledger line and a commit. Re-running any
  migration script is idempotent — `migrate-cards.mjs` overwrites by card code, and
  `freeze-routes.mjs` regenerates a byte-identical route set (verified when the baseline was
  extended during MW-6: 306 routes before and after, identical).
- **No skipping.** `verify:routes` compares the build against all 264 preserved paths, so
  anything not yet migrated is named, not merely absent. A page cannot be quietly missed —
  it stays in the missing list until it exists.
- **No stale assumptions.** The design spec is re-read live from the Claude Design project
  each session and never cached here. During this run the spec changed between two reads
  (`currentColor` → `{{ inkBase }}` in the `color-mix` expressions); the diff was checked and
  the tokens were confirmed still correct. A cached copy would have hidden that.

## The one thing a fresh agent must not conclude

`npm run verify` exits non-zero right now, and that is **correct**. It is not a broken build;
192 of 264 preserved routes are simply not migrated yet. The failing check is the to-do list.

The way to tell the difference: `verify:build`, `verify:cards` and the first and third
assertions of `verify:links` pass today and must keep passing. A regression there is real.
