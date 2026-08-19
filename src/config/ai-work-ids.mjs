/**
 * The ids of every work described on /ai-transparency. One list, imported by
 * `config/ai-disclosure.ts`, which holds what each one actually says.
 *
 * ── This file no longer has to be `.mjs`, and is anyway ────────────────────
 *
 * It was split out because `content/schemas.mjs` validated a record's `aiWork`
 * field against these ids and is loaded by BARE NODE from
 * `scripts/check-schemas.mjs` — and bare node cannot import TypeScript. A
 * record now carries a plain `ai: true` instead, so nothing outside the config
 * reads this list and the constraint is gone.
 *
 * It stays because deleting a file is a confirm-first operation and nobody has
 * confirmed it. Keeping it as the single source is strictly better than the
 * alternative available without that confirmation, which was to inline the ids
 * in the `.ts` and leave this module on disk importing nothing and imported by
 * nothing. If it is folded into `ai-disclosure.ts` later, the whole of this
 * note goes with it.
 *
 * `AI_WORKS` in `ai-disclosure.ts` is typed `Record<AiWorkId, AiWork>`, so a
 * name added here with no entry there is a type error rather than an empty row.
 */
/**
 * The JSDoc annotation is load-bearing, not documentation. Without it TypeScript
 * widens this to `string[]`, `AiWorkId` collapses to `string`, and a name here
 * with no entry in `AI_WORKS` stops being a type error. `as const` would say the
 * same in one word and is TypeScript syntax, which this file cannot use.
 *
 * @type {readonly ['sky-sounds', 'covers', 'dadada', 'rthw00', 'maar-world-imaginary']}
 */
export const AI_WORK_IDS = ['sky-sounds', 'covers', 'dadada', 'rthw00', 'maar-world-imaginary'];
