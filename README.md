# maar-world

One static Astro site consolidating `maar.world`, `collect.maar.world` and `tree.maar.world`
into a single build on one canonical domain.

```
maar.world
  /                 maar
  /collect/*        merged from collect.maar.world
  /tree             merged from tree.maar.world

collect.maar.world/*  301 → maar.world/collect/*
tree.maar.world/*     301 → maar.world/tree
```

No analytics. No cookie banner. No backend. No CMS. Zero JavaScript on any page without an
island — and there is currently one island, the Helix diagram.

## The constraint that outranks everything

A set of short codes at the root resolve to their own pages. They are **preserved URLs**:
each must keep resolving in both its extensionless and `.html` form, never redirected,
byte-for-byte stable in spelling and casing.

They cannot be renamed, re-cased, redirected or retired. If a change can only pass by
altering one of them, the answer is no.

The frozen list lives in `routes/manifest.production.json` and is asserted on every build.
`build.format: 'file'` emits only the `.html` form; the extensionless form comes from the
host's `.html` fallback, which is host behaviour rather than a build artifact, so it must be
re-proved on any new host before cutover.

## Commands

| Command | What it checks |
|---|---|
| `npm run verify` | everything below; **its exit code is the source of truth** |
| `npm run verify:routes` | every route in the frozen manifest resolves in the build |
| `npm run verify:cards` | both URL forms resolve, correct content, `noindex` intact, casing stable |
| `npm run verify:content` | per-page content-presence assertions |
| `npm run verify:links` | internal links resolve; no third-party request on page load |
| `npm run verify:build` | clean production build, warnings below threshold |
| `npm run verify:selftest` | proves the harness fails on deliberately broken builds |
| `npm run ledger -- append …` | append one line to the migration ledger |
| `npm run ledger:check` | ledger format valid and still append-only |

A check reporting `SKIP` has **not** passed — its input does not exist yet. `npm run verify`
lists skips separately so a green run is never mistaken for a complete one.

## Deployment

GitHub Pages, built by GitHub Actions — `.github/workflows/deploy.yml`. It does not run on a
push. It runs when `verify` has concluded **successfully** on `main`, and rebuilds that exact
commit, so the contract decides what ships. `workflow_dispatch` is there for the first deploy
and for re-publishing after a Pages settings change.

Two settings live outside this repo and are set once, in **Settings → Pages**:

| Setting | Value | Why |
|---|---|---|
| Source | GitHub Actions | The default, *Deploy from a branch*, runs Jekyll over the repository root — it does not build Astro, and it strips `_assets` |
| Custom domain | the host the site answers on | With Actions as the source the domain is stored here, not in a `CNAME` file; a `CNAME` in the artifact would override it on every deploy |

**The site must be served from the root of a domain.** `site` is `https://maar.world` with no
`base`, and every internal link and asset path is root-absolute — which is what keeps the card
URLs byte-stable. On the default `maar34.github.io/maar-world/` path those paths all resolve
one level too high, so a custom domain is not cosmetic here, it is what makes the deploy work.

`maar.world` itself is still served by the legacy `maar.world-site` repository, and GitHub
allows one repository per domain. Moving it is the cutover — **MW-10/MW-12**, owner-only,
DNS-touching. Before it, this deploys to a staging subdomain; after it, the domain simply
moves to this repository's Pages settings and nothing in the build changes.

First deploy on any new host, prove the `.html` fallback the card URLs depend on. It is host
behaviour, so no build can assert it — which is why `verify:cards` reports one SKIP until a
canary exists:

```sh
curl -sSI https://<host>/EBT5599 | head -1      # 200, not 301, not 404
curl -sSI https://<host>/EBT5599.html | head -1 # 200
```

Both 200 and neither redirected, then record it in `verify/host-canary.json` —
`{ "extensionlessFallback": true, "host": "<host>", "verifiedAt": "<date>" }` — and that skip
turns into a pass. A `false` there fails the build, which is the point: 35 physical cards.

## Content

`src/content/pages/en/**` and `src/content/pages/es/**` hold every page, filed by language:
a page and its translation sit at the same path under the two language roots. Nothing
regenerates them — see `.agents/skills/maar-content-authoring/SKILL.md` before editing.

## Working on this repo

Read `AGENTS.md` for the invariants, then `.agents/AGENTS.md` for the workflow and the skill
index, then `HANDOFF.md` for what was in flight. Query `MIGRATION-LEDGER.md` with
`npm run ledger -- find <term>` rather than reading it.

Development happens in worktree slots on `https://local.maar.world:4321`, with `main` as the
trunk — see `docs/LOCAL-DEVELOPMENT.md`.

Decision records are in `.agents/decisions/`. The wider architecture review lives in the
parent directory as `ARCHITECTURE-REVIEW.md` and `ARCHITECTURE-REVIEW-ADDENDUM.md`; the
addendum supersedes the review where they conflict. The visual source of truth is the Claude
Design project, read live — never cached into this repo.
