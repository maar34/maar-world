#!/usr/bin/env node
/**
 * Does a scheduled run have anything to publish — or anything to withdraw?
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `publishAfter` defers a record until a date, but nothing on this site builds
 * itself: `deploy` fires when `verify` concludes on `main`, and `verify` fires
 * on a push. A dated page would therefore wait for whatever push happened to
 * come next, which is not a schedule — it is a coincidence. The cron in
 * verify.yml is what makes the date mean anything.
 *
 * A bare cron rebuilds and redeploys every day whether or not the site would
 * change, which is not harmful but fills the deployment history with identical
 * releases and makes a real one hard to find. This is the gate that keeps the
 * daily run cheap: it answers one question and usually answers "no".
 *
 * ── IT IS NOT A CHECK ────────────────────────────────────────────────────────
 *
 * Deliberately not an `npm run` script, and deliberately not composed into
 * `npm run verify`. `scripts/selftest.mjs` asserts that every `npm run` command
 * appearing in verify.yml is one `npm run verify` also runs, so that CI can
 * never be stronger than what an agent runs locally. That assertion is right,
 * and this is not an exception to it: a scheduling decision is not a claim
 * about whether the build is correct, and putting it inside `verify` would mean
 * a local `npm run verify` started making network requests to production. CI
 * invokes it as `node scripts/publish-due.mjs`.
 *
 * ── WHY IT ASKS PRODUCTION ───────────────────────────────────────────────────
 *
 * The comparison is against the LIVE SITE rather than against a stored "last
 * run" timestamp. A timestamp has to be written somewhere, kept in step with
 * reruns, reverts and manual dispatches, and is wrong in exactly the cases that
 * matter. Production already knows what it is serving; asking it costs one HEAD
 * request per dated record, and there are usually zero.
 *
 * SYMMETRIC, because the obvious version of this is half a guard. "Is anything
 * due that is not out yet" never notices a `publishAfter` moved FORWARD on a
 * page that is already live — an unpublish that would sit there published
 * forever, waiting for a push nobody has a reason to make.
 */

import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishingDrift } from '../src/lib/publishing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'src/content/pages');
const ORIGIN = 'https://maar.world';

/**
 * Frontmatter by regex and not by a YAML parser, for the reason
 * verify-translations.mjs gives for the same choice: this must keep working
 * when the repo is in a state Astro cannot build, which is exactly the state a
 * malformed record puts it in.
 */
const field = (text, key) => (new RegExp(`^${key}:\\s*"(.*)"\\s*$`, 'm').exec(text) || [])[1];

function records(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...records(abs));
      continue;
    }
    if (!name.endsWith('.md') && !name.endsWith('.mdx')) continue;
    const text = readFileSync(abs, 'utf8');
    const outputPath = field(text, 'outputPath');
    if (!outputPath) continue;
    out.push({ outputPath, publishAfter: field(text, 'publishAfter'), file: abs.slice(ROOT.length + 1) });
  }
  return out;
}

/**
 * Live means production answers for the URL. Both spellings are tried because
 * this site preserves `.html` on the routes that came with it, and a dated page
 * could one day be one of those.
 */
async function isLive(outputPath) {
  for (const url of [`${ORIGIN}/${outputPath}`, `${ORIGIN}/${outputPath}.html`]) {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) return true;
  }
  return false;
}

const all = records(PAGES);
const dated = all.filter((r) => r.publishAfter);

let proceed = false;
let reason = '';

if (dated.length === 0) {
  reason = 'no record carries publishAfter — nothing can be due';
} else {
  const liveByPath = new Map();
  let unreachable = null;
  for (const r of dated) {
    try {
      liveByPath.set(r.outputPath, await isLive(r.outputPath));
    } catch (err) {
      unreachable = err;
      break;
    }
  }

  if (unreachable) {
    /**
     * FAIL OPEN. If production cannot be reached the honest answer is "I do not
     * know", and the two ways to be wrong are not symmetric: building
     * unnecessarily costs a few minutes of CI, while skipping means a page
     * silently misses its date and nothing anywhere reports it. Build.
     */
    proceed = true;
    reason = `could not reach ${ORIGIN} (${unreachable.message}) — building rather than risk a missed date`;
  } else {
    const { shouldPublish, shouldHide } = publishingDrift(dated, (r) => liveByPath.get(r.outputPath) === true);
    proceed = shouldPublish.length > 0 || shouldHide.length > 0;
    const parts = [];
    if (shouldPublish.length) parts.push(`due to publish: ${shouldPublish.map((r) => `/${r.outputPath}`).join(', ')}`);
    if (shouldHide.length) parts.push(`live but should be held: ${shouldHide.map((r) => `/${r.outputPath}`).join(', ')}`);
    reason = parts.join(' · ') || `${dated.length} dated record(s), all in the state they should be`;
  }
}

console.log('\npublish-due\n');
console.log(`  ${all.length} record(s), ${dated.length} carrying publishAfter`);
console.log(`  ${reason}`);
console.log(`\n  proceed: ${proceed}\n`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `proceed=${proceed}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `reason=${reason}\n`);
  /**
   * How many records carry a date at all, which is a different question from
   * whether one is due today. The workflow uses it to decide whether the
   * scheduled path is load-bearing yet: with no dated record, a missing
   * publishing token is a dormant problem worth nobody's attention, and with
   * one it is a countdown to a silent miss.
   */
  appendFileSync(process.env.GITHUB_OUTPUT, `dated=${dated.length}\n`);
}
