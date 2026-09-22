# Task Plan

## Objective

Add the supplied 16 September 2026 concert to the Landings chronology.

## Linear issue

None supplied.

## Relevant skills

`.agents/skills/maar-content-authoring/SKILL.md`

## Slot

`maar-world.worktrees/wt-1` — `add September 2026 landing`

## Affected files

- `src/content/pages/en/landings.mdx`
- `src/content/pages/es/landings.mdx`

## Assumptions

- “Concert 1” is part of the event label.
- The supplied English event title is a proper title and remains unchanged on the Spanish page.
- No venue or article link should be invented because neither was supplied.

## Invariants in play

- Existing URLs and the frozen route contract remain unchanged.
- The English and Spanish Landings chronologies stay structurally aligned.
- No application JavaScript is added.

## Risks

- The supplied event has no venue, unlike many older entries; it should remain omitted rather than guessed.

## Step-by-step plan

1. Add the event at the top of the reverse-chronological English list.
2. Mirror the entry in the Spanish chronology.
3. Build the site and verify translations and content.

## Verification

`npm run build`, `npm run verify:translations`, and `npm run verify:content` exit 0.

## Ledger line

No Linear issue was supplied, so no issue-keyed ledger line is available.

## Skill update needed?

- [x] No
