# Operating rules for agent sessions

Binding for any agent working the MW-1 programme. These rules exist because the work is
planned as long unattended runs against a finite context budget: conversation memory does
not survive a window boundary, repository state does.

## Where you work

Before anything else: **claim a worktree slot and work only there.** The primary checkout
stays parked on `main`, and direct commits on `main` are blocked by a pre-commit hook.

```sh
~/Documents/Github/maar-world/.ps-preview/mw wt-claim maar-world     # prints the slot path
```

`main` is the trunk — cut from it, merge back to it, never branch off another slot. Dev runs
on https://local.maar.world:4321, served from whichever slot is booted. Full setup, the
daily loop and the failure modes: **`docs/LOCAL-DEVELOPMENT.md`**. Read it once, then the
three commands there are all you need.

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
   **Capped at 500 characters, enforced.** Say what changed, the number that moved,
   and which file to open. The reasoning goes in a comment beside the code, or in
   `docs/adr/` if it is a decision. The ledger is append-only and every session
   pays for its length forever — one session's entries averaged 3,222 chars and
   made "read the recent ledger" an 11,500-token instruction on its own.
   **Never read the ledger front-to-back. Query it:** `npm run ledger -- find <term>`.
4. Commit, with the issue key in the message.

**Never declare work done from your own judgement. Run the command; its exit code decides.**
A check that reports SKIP has not passed — it has not run. Green with skips is not
completeness, and `npm run verify` prints those skips separately for exactly that reason.

`npm run verify` is the source of truth because it is the strongest command here, not because
it is the one named in this document. It composes, in order:

```
verify:selftest → verify:schemas → verify:build → verify:contract
               → verify:routes → verify:cards → verify:content → verify:links → ledger:check
```

It used to omit `verify:selftest`, `verify:schemas` and `ledger:check` while CI ran them, so a
local green could still be a red push. `scripts/selftest.mjs` now asserts that every command
in `.github/workflows/verify.yml` is one `npm run verify` also runs; if you add a step to CI,
add it to `CHECKS` in `scripts/verify.mjs` too, or that case fails.

**Every fix to the harness gets a selftest case.** A check that has never been seen to fail is
not evidence of anything. Fixtures use the `MW_VERIFY_ROOT` hook and never touch the real repo.

## Invariants

These are not preferences. Work that can only pass by breaking one of these does not pass.

- **The 35 NFC card codes.** 34 from `_skysounds` plus `/STW3344` from `_stoney_way`. Each
  resolves as both `/CODE` and `/CODE.html` — 70 URLs. Never redirected. Spelling and casing
  byte-for-byte stable. If something can only pass by changing one of these URLs, stop and
  report.
- **Never modify the frozen route manifest.** `routes/manifest.production.json` and
  `routes/policy.json` are contracts, not working files. Later work conforms to them; they
  never conform to later work.

  Both are regenerable from their committed scripts (`freeze-routes.mjs`,
  `author-policy.mjs`), and that used to be stated as "regenerating is fine, hand-editing to
  make a check pass is not". That was wrong, and it blessed a working bypass: deleting 235 of
  306 routes and re-running `npm run freeze:routes` flipped `verify:routes` from FAIL to PASS,
  because a smaller contract is trivially satisfied by the same build. **What matters is not
  how the file changed, but whether the contract changed.** Regenerating it is a change.

  So: `routes/contract.lock.json` holds a SHA-256 of the canonical route set and of the policy
  decision set. `npm run verify:contract` fails the moment either moves — by hand or by
  regeneration. Re-locking is a separate, deliberate command that prints exactly what changed
  and **refuses route removals unless they are stated explicitly**:

  ```
  npm run contract:relock                        # prints the diff
  npm run contract:relock -- --accept-removals   # required when routes leave the contract
  ```

  `npm run freeze:routes` never re-locks. If a re-lock is what makes a check pass, that is not
  a fix — append `BLOCKED` and report it. Re-locking is a human decision with a reason, and it
  belongs in its own commit.
- **Preserve URLs exactly.** No `.html` stripping, no slug normalising, no tidying — even
  where existing URLs are ugly or inconsistent. That is deliberate.
- **Content files are `.md` by default.** Use `.mdx` only where a component is genuinely
  needed: the content is full of raw HTML that MDX would break.
- **Self-host every font.** No `fonts.googleapis.com`, no unpkg, no cdnjs.
- **No analytics, no cookie banner.** Their absence is the design, and it depends on no
  third-party request firing on page load. Third-party embeds get click-to-load facades.
  `play.maar.world` embeds are fine as plain iframes — same registrable domain, same-site.
  A facade may now open an in-page player *on a press* (see `ui/embed-consent` below); it
  still may not request anything on load, and **consent is never persisted** — no cookie, no
  storage — because persisting it would be the storage policy nobody has approved.
- **No Tailwind, no shadcn/ui, no CSS-in-JS, no React app shell, no CMS, no backend.**
  React only inside the one approved island (the Helix diagram).
- **Application JavaScript is allowed on two things and no others**: the Helix island, and
  `ui/carousel`. The carousel exception is the owner's decision, taken after two no-script
  attempts failed for the same structural reason — §06 asks for prev/next "disabled, not
  hidden" at the ends, arrow keys, home and end, and "the counter in a polite live region",
  and CSS can build none of those. The engine is **Embla**, the plain-JavaScript core of the
  same library shadcn/ui's carousel wraps; React and Tailwind stay out. Vite bundles it from
  `node_modules`, so no third-party request fires on load, and `[...page].astro` includes it
  only on records whose body actually contains a carousel — 5 pages of 134. The no-script
  carousel is still what ships in the HTML; the script enhances it, and the page works
  without it.
- **The third exception is `ui/embed-consent`**, taken by the owner on 2026-07-30, clearing
  the MW-9 BLOCKED line `embeds/click-out-not-load`. It is the per-embed consent gate: a
  press builds a YouTube, Vimeo or SoundCloud player in the page, and nothing is requested
  before that press. It renders no markup and invents no URL — it reads the provider address
  off the anchor the migration already wrote — and `[...page].astro` includes it only on
  records whose body carries one of those three facades, 9 pages of 134. Without the script
  the click-out anchor is what ships, unchanged. **A fourth exception is a decision to be
  taken, not a precedent to follow.**
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
