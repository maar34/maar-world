# Operating rules for agent sessions

Binding for any agent working the MW-1 programme. These rules exist because the work is
planned as long unattended runs against a finite context budget: conversation memory does
not survive a window boundary, repository state does.

## Session start

1. Read `MIGRATION-LEDGER.md`. This is the first action of every session, without exception.
2. Read `HANDOFF.md` for what was in flight when the last session stopped.
3. Read the active Linear issue in full — the descriptions contain the traps and the
   explicit "do not" lists. Follow them literally.
4. Re-read the Claude Design project before implementing any component. It is actively
   edited and **will** have changed. Never trust design values extracted in an earlier
   session, and never cache them into this repo.

## Order of work

Work in dependency order:

```
MW-3 → MW-4 → MW-5 → MW-6 → MW-7 / MW-8 / MW-9 → MW-11
```

Do not start a downstream issue while an upstream one has open items.

**Hard stop after MW-11.** MW-10 and MW-12 touch DNS, the live sites and physical cards.
They are human-gated. Reaching MW-11 with checks passing is a complete, successful run.

## Per unit of work

1. Do the unit.
2. Run the narrowest relevant check — `npm run verify:cards`, not the whole suite.
3. Append exactly one line to `MIGRATION-LEDGER.md` (use `npm run ledger -- append …`).
4. Commit, with the issue key in the message.

**Never declare work done from your own judgement. Run the command; its exit code decides.**
A check that reports SKIP has not passed — it has not run. Green with skips is not
completeness, and `npm run verify` prints those skips separately for exactly that reason.

## Invariants

These are not preferences. Work that can only pass by breaking one of these does not pass.

- **The 35 NFC card codes.** 34 from `_skysounds` plus `/STW3344` from `_stoney_way`. Each
  resolves as both `/CODE` and `/CODE.html` — 70 URLs. Never redirected. Spelling and casing
  byte-for-byte stable. If something can only pass by changing one of these URLs, stop and
  report.
- **Never modify the frozen route manifest.** It is a contract, not a working file. Later
  work conforms to it; it never conforms to later work.
- **Preserve URLs exactly.** No `.html` stripping, no slug normalising, no tidying — even
  where existing URLs are ugly or inconsistent. That is deliberate.
- **Content files are `.md` by default.** Use `.mdx` only where a component is genuinely
  needed: the content is full of raw HTML that MDX would break.
- **Self-host every font.** No `fonts.googleapis.com`, no unpkg, no cdnjs.
- **No analytics, no cookie banner.** Their absence is the design, and it depends on no
  third-party request firing on page load. Third-party embeds get click-to-load facades.
  `play.maar.world` embeds are fine as plain iframes — same registrable domain, same-site.
- **No Tailwind, no shadcn/ui, no CSS-in-JS, no React app shell, no CMS, no backend.**
  React only inside the one approved island (the Helix diagram).
- **Never touch DNS, the live sites, or any legacy repository.** Read them, never write.
  The legacy checkouts in `../maar.world-site`, `../collect.maar.world` and
  `../tree.maar.world` are read-only source material.

## Ambiguity

On ambiguity that changes what a visitor sees: append a `BLOCKED` line with the reason and
move to the next independent unit. Do not guess. Do not stall.

Where the design spec is explicitly marked in progress or unresolved, implement only what is
settled and log the rest as `BLOCKED`. Do not invent the missing half.

On three consecutive failures of the same kind: stop, append `BLOCKED`, summarise.

## Hard stop conditions

Stop and write a handoff rather than continuing when:

- `verify:cards` fails and the cause is not obvious within two attempts
- the route manifest would need to change to make something pass
- a change would touch DNS, the live sites, or any legacy repository
- remaining context is low enough that stopping cleanly beats starting a new unit

## Stopping cleanly

1. Finish or explicitly abandon the current unit — never leave it half-applied.
2. Append the ledger line (`DONE` or `BLOCKED` with a reason).
3. Regenerate `HANDOFF.md`.
4. Commit.

The test of a clean stop: the same starting prompt, in a fresh context, with nothing but
this repo and the Linear issues, is enough to resume without redoing finished work or
silently skipping unfinished work.
