# Rollback notes — maar.world consolidation, 2026-08-01

No DNS record was changed at any point. Everything below is GitHub Pages
settings plus repo archive state, so every step reverses without a rebuild.

## Pages config as found (before any change)

| Repo | cname | build_type | source | cert |
|---|---|---|---|---|
| maar34/maar.world-site | maar.world | legacy | main:/ | approved, maar.world + www.maar.world, exp 2026-09-27 |
| maar34/collect.maar.world | collect.maar.world | legacy | main:/ | approved, exp 2026-10-01 |
| maar34/tree.maar.world | tree.maar.world | legacy | main:/ | approved, exp 2026-09-28 |

## To roll back maar.world

1. Remove the custom domain from `maar34/maar-world` (Settings → Pages).
2. Set `maar.world` as the custom domain on `maar34/maar.world-site`.

That repo was never modified — still deployed, still serving at
`maar34.github.io/maar.world-site`.

## To roll back collect. / tree.

1. Unarchive `maar34/collect.maar.world` (or `tree.maar.world`).
2. Remove the custom domain from the `-redirect` repo.
3. Set the domain back on the unarchived original.

The originals each took exactly ONE commit, "Delete CNAME" — for a
branch-source Pages site the custom domain *is* a `CNAME` file in the repo,
so releasing the domain committed its removal (collect `86d998e5`, tree
`202dc435`, both 2026-08-01). Nothing else changed; the website content and
its whole history are untouched, and re-adding the domain recreates the file.

Archiving itself is reversible and changes no commit. All branches
preserved: collect has `Collect-3.0`, tree has `rabbit-branch`,
maar.world-site has `April-Updates`, `dev`, `gh-pages`, `lab&chat`,
`mw-3.0.0`.

Local full clones also exist at ~/Documents/Github/maar-world/.

## Commit counts at freeze

- collect.maar.world — 185 commits
- tree.maar.world — 835 commits
- maar.world-site — 895 commits

All three verified clean: nothing unpushed, nothing uncommitted.
