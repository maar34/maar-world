# Maar World — Agent Rules

One static Astro site consolidating `maar.world`, `collect.maar.world` and `tree.maar.world`
onto one canonical domain. Single app, no backend, no CMS.

Agent workflow, skill index and commands: **`.agents/AGENTS.md`**.

## Invariants

Not preferences. Work that can only pass by breaking one of these does not pass — stop and
report instead.

- **The 35 NFC card codes.** 34 from `_skysounds` plus `/STW3344` from `_stoney_way`. Each
  resolves as both `/CODE` and `/CODE.html` — 70 URLs. Never redirected, spelling and casing
  byte-for-byte stable. They are printed on physical cards already in people's hands.
- **Never modify the frozen route manifest.** `routes/manifest.production.json` and
  `routes/policy.json` are contracts, not working files. Later work conforms to them.

  What matters is not *how* the file changed but *whether the contract changed* — regenerating
  is a change. Deleting 235 of 306 routes and re-running `freeze:routes` once flipped
  `verify:routes` from FAIL to PASS, because a smaller contract is trivially satisfied.
  `routes/contract.lock.json` holds a SHA-256 of the canonical route and policy sets;
  `verify:contract` fails the moment either moves. Re-locking is deliberate and separate:

  ```
  npm run contract:relock                        # prints the diff
  npm run contract:relock -- --accept-removals   # required when routes leave the contract
  ```

  If a re-lock is what makes a check pass, that is not a fix — stop and report.
- **Preserve URLs exactly.** No `.html` stripping, no slug normalising, no tidying, even where
  a URL is ugly or inconsistent. That is deliberate.
- **Content is `.md` by default.** `.mdx` only where a component is genuinely needed.
- **Self-host every font.** No `fonts.googleapis.com`, no unpkg, no cdnjs.
- **No analytics, no cookie banner.** Their absence is the design, and it depends on no
  third-party request firing on load. Third-party embeds get click-to-load facades; consent is
  **never persisted** (no cookie, no storage). `play.maar.world` embeds may be plain iframes —
  same registrable domain.
- **No Tailwind, no shadcn/ui, no CSS-in-JS, no React app shell, no CMS, no backend.**
- **Application JavaScript is allowed on exactly three things**: the Helix island (React), the
  `ui/carousel` (Embla, plain JS), and `ui/embed-consent`. Each was a separate owner decision.
  **A fourth exception is a decision to be taken, not a precedent to follow.**
- **Never touch DNS, the live sites, or any legacy repository.** `../maar.world-site`,
  `../collect.maar.world` and `../tree.maar.world` are read-only source material.

## Where work happens

`main` is the trunk, and direct commits on it are blocked. Claim a worktree slot first:

```sh
~/Documents/Github/maar-world/.ps-preview/mw wt-claim maar-world
```

Dev runs on `https://local.maar.world:4321`. Setup and daily loop: `docs/LOCAL-DEVELOPMENT.md`.

## Never declare work done from your own judgement

Run the command; its exit code decides. `npm run verify` is the source of truth because it is
the strongest command here, not because it is the one named in a document. A check reporting
SKIP has not passed — it has not run.
