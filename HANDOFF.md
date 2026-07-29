# Handoff

**State:** tree clean at `0dbabcb`. `npm run verify` = **71 passed, 2 failed, 1 skipped**.

Both failures are known, deliberate and human-gated. Neither is a regression:

- **`verify:links`** — 73 on-load refs to `www.dropbox.com` (MW-6 card art). **Must never go up.**
- **`verify:content`** — 49 problems / 48 pages. All check-side. **Do not edit content to fix them.**
  Why: `npm run ledger -- find residue-is-check-side`

Everything else is green: selftest 94/94 · schemas 12/12 · build 6/6 · contract 3/3 ·
routes 8/8 · cards 20/20 (+1 skip, needs MW-10) · a11y 24/24.

---

## Next action

1. **Dropbox card art** — the only red check that isn't check-side. Needs a human.
2. **4 route groups**, 215 live URLs — theme assets, orphan files, deploy artifacts,
   `%20` card URLs. Need the owner's knowledge. `ledger -- find routes/`
3. **5 remaining type marks** — stamp, hatch plate, tilted actions, struck word,
   opposed chips. Agent-doable. See `docs/agent/VISUAL-LANGUAGE.md`.
4. **7 of 10 page families** unbuilt. Every route renders family 03.

**Do not start MW-10/MW-12.** They touch DNS, live sites and physical cards.

## How to find things

**Do not read the ledger.** It is 164 entries and grows. Query it:

```
npm run ledger -- find <term>      why is this like this
npm run ledger -- status           what is blocked
```

Reasoning lives in comments beside the code, not in the ledger. If a file looks
odd, open it — the explanation is there.

| Question | File |
|---|---|
| How do I publish a page? | `docs/AUTHORING.md` |
| What is a type mark? | `docs/agent/VISUAL-LANGUAGE.md` |
| Which design reference wins? | `docs/agent/DESIGN-REFERENCES.md` |
| What are the rules? | `docs/agent/OPERATING-RULES.md` |
| Why two collections? | `docs/adr/0001-one-pages-collection.md` |

## Repo shape

```
src/content/migrated/**   95 records. GENERATED — wiped by rmSync every run.
                          Fix scripts/migrate-pages.mjs, never the .md.
src/content/authored/**   yours. No script writes here. Page records only —
                          the collection globs it, so a stray README.md fails.
src/content/cards/        35 NFC card records
src/lib/                  mark.mjs · translations.mjs · feed.mjs — pure, tested
scripts/lib/html-text.mjs plainText() defines textSha256 in the frozen manifest
routes/                   CONTRACTS. Never edit. Regenerating IS editing.
media/                    tracked assets → .public/ at build (gitignored)
```

`outputPath` is the load-bearing field: it is the URL. The filename is
navigational only.

## Invariants — work that can only pass by breaking one of these does not pass

- **35 NFC codes, 70 URLs**, never redirected, byte-for-byte stable.
- **Never edit `routes/manifest.production.json` or `routes/policy.json`.**
  Re-locking is a deliberate human command in its own commit.
- **Preserve URLs exactly.** No `.html` stripping, no slug normalising.
- **Self-host every font. No analytics, no cookie banner. No third-party request
  on page load.**
- **No Tailwind, no CSS-in-JS, no CMS, no backend.** React only in the Helix island.
- **Legacy checkouts one directory up are READ-ONLY.** Never touch DNS or the live sites.
- Per unit: do the work, run the narrowest check, append **one** ledger line, commit.
  Stage your own paths — never `git add -A` at the repo root.
- **Never declare work done from judgement. Run the command; its exit code decides.**

## Traps

- **After any change under `src/content/`**, the next build emits
  `[glob-loader] Duplicate id` and `verify:build` fails on warnings > 0. Stale cache:
  `find .astro -mindepth 1 -delete`, then rebuild.
- **Ledger prose is evaluated by the shell.** No backticks, `$`, or unescaped quotes
  in `ledger -- append`. Entries are capped at 500 chars — that is deliberate.
- **An Astro expression between `</head>` and `<body>`** makes Astro drop `<body>`
  entirely, and every check reading body text sees an empty document.
- **Card pages forward to Orbiter after 300 ms.** Use `/STW3344` or `/DWE1406` —
  neither forwards.
- **`npm run dev`:** home is `/index`, not `/` (also `/collect/index`, `/tree/index`).
  Dev-only; the build serves `/` correctly. Kill stale `astro preview` first — it
  serves a stale `dist` and does not hot-reload.
- **Quote the date.** `date: 2026-08-01` unquoted is a YAML date object; the schema
  wants a string.
- **Design references live one directory UP**, in `../planning/design-references/`.
- **The design spec is actively edited.** Re-read it live via DesignSync
  (project `9c177a8a-4d82-4322-963b-4ee7018f3982`). Never cache its values here.

## Blocked — needs a human

`ledger -- status` lists 24, but the ledger is append-only so it still shows five
that later work closed: `helix-diagram.html`, `shell/designsync-unavailable`,
`design/page-bodies-unstyled`, `pages/missing-alt`, and `shell/lang-two-pages-unset`
(half — `/esp-feedback` is fixed).

Genuinely open: Dropbox card art · 34+9 lost cover thumbnails · Artizen URL ·
4 route groups · `/resume` noindex · embeds click out not in · 5 assets over 2 MB ·
Tree hub image · ip-orchestra avatar · 2 interpolated display line heights ·
the mark tilt set.

**MW-11's own human gates:** 35 card pages reviewed + 3 physical cards scanned ·
4 real form submissions · ~175 embeds confirmed loading · a11y judgement calls ·
Lighthouse (no baseline was captured).

## Housekeeping

A stray `package.json`, `package-lock.json` and `node_modules/` sit in the **parent**
directory from a shell cwd reset during an `npm install`. The repo was never affected;
deleting there is blocked for an agent.
