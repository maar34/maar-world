# Migration ledger

Append-only record of completed units of work for the Maar World rebuild (Linear epic MW-1).

**This file is a record, not a working file.** Never rewrite it. Never reorder it. Never
delete a line. Only append. `npm run ledger:check` fails if the committed version stops
being a prefix of the working copy.

The first action of any agent session is to read this file. The last action before stopping
is to append to it.

## Line format

```
<stamp>            <issue>  <status>  <unit>                                     <detail>
2026-07-29T02:14Z  MW-7     DONE      lab/en/ip-1.html                           routes:ok content:ok links:ok
2026-07-29T02:16Z  MW-7     BLOCKED   lab/es/dadada.html                         reason: source references missing image
```

Machine-parseable as `^(stamp)\s+(MW-\d+)\s+(DONE|BLOCKED|NOTE)\s+(unit)\s+(detail)$`.

| Field | Rule |
|---|---|
| `stamp` | UTC, minute precision, `YYYY-MM-DDTHH:MMZ` |
| `issue` | Linear issue key, `MW-<n>` |
| `status` | `DONE`, `BLOCKED` or `NOTE` — nothing else |
| `unit` | one token, no spaces: a route, file path, or named checkpoint |
| `detail` | free text; **required** for `BLOCKED`, and must state the reason |

Padding is cosmetic. Parsing splits on whitespace runs, so alignment can drift without
breaking anything.

Append with the CLI rather than by hand — it stamps the time and rejects malformed entries:

```
npm run ledger -- append MW-7 DONE lab/en/ip-1.html "routes:ok content:ok links:ok"
npm run ledger -- append MW-7 BLOCKED lab/es/dadada.html "reason: source references missing image"
```

## Entries

2026-07-28T21:31Z  MW-3   NOTE     repo/init                                  destination repo created, git init on main, no remote (human-gated)
2026-07-28T21:32Z  MW-3   DONE     harness/verify-suite                       5 checks + selftest 10/10; exit code is source of truth
2026-07-28T21:32Z  MW-3   DONE     harness/docs                               OPERATING-RULES.md, HANDOFF.md, MIGRATION-LEDGER.md format documented
2026-07-28T21:32Z  MW-3   NOTE     repo/name                                  repo named maar-world per ARCHITECTURE-REVIEW 6/7; no git remote created (human-gated)
