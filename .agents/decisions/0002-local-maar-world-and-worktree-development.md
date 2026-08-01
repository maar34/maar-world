# 0002 — `local.maar.world` and worktree-based development

**Status:** accepted
**Date:** 2026-08-01
**Issue:** MW-15

## Context

Development ran as a single `astro dev` on `localhost:4321`, started by hand from
the one checkout, on `main`. Every other Plantasia repo had already moved to a
different arrangement: a named local HTTPS origin, work in fixed worktree
**slots**, and a monitor showing which slot holds which ticket. Maar World was
the odd one out, so it was invisible to that monitor and nothing stopped work
accumulating on the trunk.

Two facts about the existing machinery shaped what could be done.

**The toolkit is root-relative but not root-locked.** The `wt-*` scripts live in
`ps-all/.ps-preview` and default to `PSROOT=~/Documents/Github/ps-all`, but every
one of them honours `PSROOT` as an environment override, and `boot.sh` honours
`PS_MONITOR_CONFIG`. So a second root needs no forked scripts — only its own
config and its own environment.

**The monitor is one root and one host per process.** `server.js` reads a single
`cfg.root` and a single `cfg.host`. Maar World is a different root *and* a
different hostname, so no amount of configuration lets the existing
`ps-all` instance on `:4178` cover it.

## Decision

**Dev serves `https://local.maar.world:4321`**, via mkcert certificates in
`.certs/` (gitignored, symlinked into slots) and a `127.0.0.1` host entry.
Certificate presence is the switch: without certs the server still boots on
plain-HTTP localhost, so a fresh clone is explorable.

**Development happens in worktree slots.** `maar-world.worktrees/wt-N`, branches
`wt/N-<slug>`, cut from trunk and merged back. The primary checkout stays parked.

**`main` is the trunk**, and `maar-world` is added to `enforce.list`, so direct
commits on `main` are blocked. There is no separate production and development
environment yet; when a `dev` branch appears the toolkit detects it with no
configuration change.

**A second monitor instance** runs against this root on `:4179`, configured by
`~/Documents/Github/maar-world/.ps-preview/monitor.config.json`. The shared
toolkit is **symlinked**, not copied, so there is one source of truth for the
code and one config per root.

A small `mw` wrapper sets `PSROOT` and `PS_MONITOR_CONFIG` and dispatches to
those symlinks.

## Consequences

**Why a second instance rather than teaching the monitor two roots.** The monitor
is published as a generic, workflow-agnostic tool whose stated rule is that
project-specific hosts and paths belong in the user's config, not in shipped
files. Multi-root with per-repo hosts would add config surface to a tool every
other repo depends on, to serve one consumer. A second process reuses the exact
seams the tool already exposes and leaves its code untouched. The cost is a
second widget URL to remember.

**Why the wrapper execs the sibling symlink, not the `ps-all` script.**
`wt-new.sh` and friends resolve their slot cap with
`. "$(dirname "$0")/_max-slots.sh"`, which reads the `monitor.config.json` next
to `$0`. Exec'ing the `ps-all` copy directly would silently apply *ps-all's*
slot cap. Exec'ing the symlink in this root keeps `$0` here. This was verified
rather than assumed: a cap set only in this root's config resolved through the
symlink and not through `ps-all`.

**The host lives in Astro's top-level `server`, not in `vite.server`.** Astro
derives the dev server's host and port from its own `server` config and hands
them to Vite, so a host set only under `vite.server` is overridden and the server
binds plain localhost — `[::1]` here. That failure is quiet in the worst way: the
port and the certificate are both correct, so `https://localhost:4321` answers
200 while the actual dev URL cannot connect. Settings Astro does not model
(`https`, `strictPort`, `allowedHosts`, `fs.allow`, `hmr`) stay under
`vite.server`, where they are read.

**`server.strictPort` is set.** Vite's default is to slide to the next free port,
which puts a healthy server on `:4322` while the monitor advertises one fixed URL
— presenting as "the site is down". A taken port now crashes loudly instead. The
usual cause is an orphaned dev server: pm2 supervises a `bash` wrapper, so a node
grandchild can outlive a restart. `docs/LOCAL-DEVELOPMENT.md` carries the fix.

**`server.fs.allow` had to widen.** Slots symlink `node_modules` to the primary,
so dependency imports resolve outside the worktree root and Vite's filesystem
guard denies them. The shared parent of both checkouts is now allowed.

The three legacy checkouts being consolidated here — `collect.maar.world`,
`maar.world-site`, `tree.maar.world` — are excluded from the monitor and left on
a plain commit-to-`main` flow. They are archives, not active development.
