# Task Plan

## Objective

Publish the Orbiters audio-architecture planning document as a Maar World Lab post, without internal Linear references.

## Linear issue

None supplied. Internal ticket references in the source document are deliberately omitted from the public post.

## Relevant skills

`.agents/skills/maar-content-authoring/SKILL.md`

## Slot

`maar-world.worktrees/wt-2` — `MW audio architecture post`

## Affected files

- `src/content/pages/en/lab/orbiters-audio-architecture.md`

## Assumptions

- This is an English Lab post at `lab/en/orbiters-audio-architecture`.
- All `ORB-…` references are internal ticket identifiers and must not publish.
- It remains available at its direct URL until a Spanish counterpart can join the bilingual Lab index.

## Invariants in play

- New authored content self-authorises its route; frozen route files remain untouched.
- Content stays Markdown by default; no application JavaScript is added.

## Risks

- The source contains inline SVG diagrams; they must retain their accessible descriptions.

## Step-by-step plan

1. Add the public Lab page from the supplied document.
2. Remove Linear links and internal ticket references while retaining the technical text.
3. Build and run the relevant verification checks.

## Verification

`npm run verify:build`, `npm run verify:routes`, and `npm run verify:links` exit 0.

## Ledger line

No Linear issue was supplied, so no issue-keyed ledger line is available.

## Skill update needed?

- [x] No
