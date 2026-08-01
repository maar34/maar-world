# Local development

Maar World develops on **https://local.maar.world:4321**, in **worktree slots**, on a
**trunk-based** flow where `main` is the trunk. This document is the setup and the daily
loop. (MW-15)

Everything here mirrors the shared Plantasia worktree workflow, with one difference that
explains most of the commands below: Maar World is its own **root**. The shared toolkit
lives in `ps-all` and defaults to that root, so every script needs to be pointed here. The
`mw` wrapper does that for you — use it and you can forget this paragraph.

---

## One-time setup

### 1. Host entry

`local.maar.world` must resolve to the loopback address. Without it the dev server cannot
bind the hostname and silently falls back to IPv6 localhost, which is why the site appears
to work in a browser tab you opened earlier and refuses every fresh request.

```sh
echo "127.0.0.1 local.maar.world" | sudo tee -a /etc/hosts
```

### 2. TLS certificate

The dev origin is HTTPS. Certificates are issued by the local `mkcert` CA that already
signs `local.plantasia.space`, so no new root certificate has to be trusted.

```sh
cd ~/Documents/Github/maar-world/maar-world
mkdir -p .certs && cd .certs
mkcert -cert-file local.maar.world.pem -key-file local.maar.world-key.pem local.maar.world
```

`.certs/` is gitignored. It lives in the **primary checkout** and is symlinked into each
worktree slot automatically, so this is done once, not once per slot.

**Certificates are the switch.** With them, `npm run dev` serves HTTPS on
`local.maar.world`. Without them it still boots, on plain-HTTP `localhost:4321`, so a fresh
clone is explorable out of the box — but auth- or origin-sensitive behaviour will not match
production. See the comment at the top of `astro.config.mjs`.

---

## The daily loop

### Claim a slot — before you touch code

```sh
~/Documents/Github/maar-world/.ps-preview/mw wt-claim maar-world
```

It prints a path. `cd` into it and work **only** there. Then label it, so the branch and
the monitor both say what the work is:

```sh
.ps-preview/mw wt-label maar-world 1 "MW-## short title"
```

Never work in the primary checkout (`maar-world/maar-world`) — it stays parked on `main`.
Never hard-code a slot number; slots are recycled, so always re-claim.

### Serve your slot

```sh
.ps-preview/mw boot maar-world wt-1     # or: trunk, to serve the primary again
```

**Never start `astro dev` by hand.** A hand-started server is invisible to the monitor, and
a hand-made pm2 entry bakes the slot path into the process arguments — so a later
`pm2 restart` faithfully returns to that *slot*. A restart is not a restore. `boot.sh`
deletes and recreates the entry, so it always lands where you asked.

Check it: `pm2 describe maar-world | grep 'exec cwd'`, then load
https://local.maar.world:4321.

### Keep your slot's status honest

`.ps-slot.json` in your slot carries `status`: `working` / `needs-input` / `idle`. The
monitor is how a human sees who is doing what, so it is worth keeping accurate.

### Finish

Commit on your `wt/N` branch with the issue key in the message, run the checks, then merge
to `main`. **Get an explicit go-ahead before merging to trunk** — a passing review is not
permission. Then release the slot:

```sh
.ps-preview/mw wt-release maar-world 1
```

---

## Trunk

`main` is the trunk. There is no separate production and development environment yet, so
`main` is both what deploys and what slots are cut from. When a `dev` branch is introduced,
the toolkit detects it automatically (`dev` exists ⟺ trunk is `dev`) — no configuration
changes.

Direct commits on `main` are **blocked** by a pre-commit hook, because `maar-world` is
listed in `.ps-preview/enforce.list`. If a commit is refused, that is the hook: do the work
in a slot and merge. The deliberate override is `git commit --no-verify`, for genuine trunk
infrastructure only — never for feature work.

---

## The monitor

A dedicated worktree-monitor instance watches this root:

| | |
|---|---|
| Widget | http://localhost:4179/widget |
| Config | `~/Documents/Github/maar-world/.ps-preview/monitor.config.json` |
| pm2 | `worktree-monitor-maar` |

It is a **separate instance** from the `ps-all` monitor on port 4178, not a second root
inside it. The monitor supports one `root` and one `host` per process, and this root serves
a different hostname, so a second instance is the design rather than a workaround. The
monitor's own code is untouched and shared.

It is a read-only view: it reserves nothing and locks nothing.

The three legacy checkouts alongside this repo — `collect.maar.world`, `maar.world-site`,
`tree.maar.world` — are the sites being consolidated here. They are excluded from the
monitor and left on a plain commit-to-`main` flow.

---

## Troubleshooting

**"Port 4321 is already in use", pm2 restarting in a loop.** An orphaned dev server holds
the port. pm2 supervises a `bash` wrapper, so a node grandchild can outlive a restart:

```sh
pkill -f "node_modules/.bin/astro"
.ps-preview/mw boot maar-world wt-1
```

The loop is deliberate. `server.strictPort` is set, so a taken port is a loud crash rather
than a silent slide onto 4322 — where the server is perfectly healthy on a port nothing is
pointed at, which presents as "the site is down".

**The site loads on `localhost` but not `local.maar.world`.** The host entry is missing —
step 1 above. The server binds IPv6 localhost when it cannot resolve the name.

**A dependency asset 403s or fails to resolve in a slot.** Slots symlink `node_modules` to
the primary, so imports resolve outside the worktree root and Vite's filesystem guard denies
them. `server.fs.allow` in `astro.config.mjs` already covers the shared parent; if a new
path is involved, extend it there.

**Health check across everything:**

```sh
.ps-preview/mw wt-doctor
```
