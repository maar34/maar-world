# 0003 — Adopt the `.agents/` skills system

**Status:** accepted
**Date:** 2026-08-01
**Issue:** MW-15 (follow-up)

## Context

Agent documentation here grew by accretion. By the time it was tidied there were three
conventions in one repo: `docs/agent/` (five files, this repo's own invention), `docs/adr/`
(decision records), and two root-level files (`HANDOFF.md`, `MIGRATION-LEDGER.md`). Every
other Plantasia repo uses `.agents/`, so a shared skill or a returning agent looking for
`.agents/AGENTS.md` found nothing and had to rediscover the layout.

Worse, the folder mixed durable rules with dead session state. `CONTENT-PIPELINE-NOTES.md`
was titled "Handoff — content-rendering defects (MW-7 / MW-11)", carried an absolute
`/Users/…` path and a `BLOCKED — needs an owner` section, and sat beside `AUTHORING.md` as if
both were current guidance. An agent cannot tell those apart by looking.

## Decision

Adopt the standard `.agents/` layout: root `AGENTS.md` for invariants, `.agents/AGENTS.md` as
the entry point, `skills/<name>/SKILL.md`, `references/`, `templates/`, `decisions/`. `CLAUDE.md`
wires the two AGENTS files in.

Sorted the existing documentation by what each file actually *is*:

- **Durable, triggerable** → `skills/` — authoring, visual language, design authority
- **Durable, not triggerable** → `references/` — overview, safe operations, local dev, resumability
- **Decisions** → `decisions/`, moved from `docs/adr/` with **numbers preserved**
- **Dead session state** → deleted (`CONTENT-PIPELINE-NOTES.md`, `design-qa.md`)
- **Live session state** → kept where it is (`HANDOFF.md`, `MIGRATION-LEDGER.md`)

## Consequences

**`docs/agent/` is gone.** Anything that pointed at it is now wrong; `README.md` was updated.

**Decision numbers did not change.** `0001` and `0002` are cited from an `astro.config.mjs`
comment, ledger entries and `docs/LOCAL-DEVELOPMENT.md`. Renumbering to satisfy a template
would have broken every citation to make a directory listing tidier.

**`HANDOFF.md` and `MIGRATION-LEDGER.md` stay at the root.** They are not documentation, they
are running state, and MW-3's resumability acceptance is defined in terms of them. The
resumability drill moved to `references/` because it *describes* that mechanism; the mechanism
itself did not move.

**The deleted files' open question survives.** `CONTENT-PIPELINE-NOTES.md` held one unresolved
owner question, and it was already carried as `MW-7 BLOCKED pages/ip-orchestra-bruna-image` in
the append-only ledger. Deleting the prose lost nothing the ledger does not hold.

**One skill is knowingly over the size guidance.** `maar-visual-language` is ~224 lines against
a ~80-line target. It is a measured spec rather than a procedure, and it was moved intact
rather than paraphrased — a careless split would lose the measurements it exists to record.
`references/overview.md` records it as a real follow-up.

**The shared template's branch convention was not copied.** `ps-agent-skills` still describes a
`<username>-local` integration branch; that workflow is retired in favour of worktree slots
(`0002`). `references/local-dev-and-testing.md` states the correction explicitly so the next
agent does not follow the stale half.

## Related files

- `/AGENTS.md`, `/CLAUDE.md`, `.agents/AGENTS.md`
- `.agents/references/overview.md`
- `decisions/0002-local-maar-world-and-worktree-development.md`
