# MW-17 — the 404 as a page family

**Status:** done on `wt/2-mw-17-custom-404-page`, awaiting review and ship. `npm run verify`
= 100 passed, 0 failed, 0 skipped.

## What it is

`src/content/pages/en/404.md` now declares `family: "notfound"` and
`src/components/families/NotFound.astro` draws it: the `t-meta` label line, the h1 in the display
face with its two marks, the `description` as a lede, two actions, then the body as `.prose`.
Before this the record rendered through the route's default branch as an article column.

- **Marks.** The struck word stays — it is the one struck word on the site and mark.css argues
  why it belongs on this heading. The second mark is the overprint echo on `deck`. Both are named
  on the record as words (`notfound.mark`, `notfound.echo`) and wrapped by the family; a
  multi-word echo wraps as its own line, so it is one word. Below 600px the echo stands down.
- **Actions.** `NOTFOUND_ACTIONS` in `config/site.ts`, beside `HOME_ACTIONS`: home takes the
  stamp, "Write to us" → `/bookings` is quiet. No break spent.
- **Schema.** `family` enum gains `notfound`; a `notfound` object field; the same superRefine
  rule as `collect` (family without its field is a build error).

## The dev server, and why `src/pages/404.astro` exists

`npm run dev` serves a custom not-found page only from a route literally named `/404`; a
catch-all is not that name, so dev showed Astro's own "404: Not Found" (logo and all) for
every unknown URL and for `/404` itself, while the built `404.html` was already the record.
`src/pages/404.astro` renders the same record through `[...page].astro` as a component, and
the catch-all leaves `404` out of its static paths so one file has one writer. Checked on dev:
`/does-not-exist`, `/404` and `/ABC1234` all render the page with status 404.

## Open

- `routes/policy.json` still lists `/404` as `drop` / unresolved with the question "decide whether
  the new site ships a 404 page". It does; changing the policy is a relock and a human step.
- No Spanish 404. The host serves one error page; the header offers the language.
