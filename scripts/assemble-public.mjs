#!/usr/bin/env node
/**
 * Compose media/shared + media/<area> into the public directory.
 *
 * 50.7 MB of assets are byte-identical across the three legacy repositories.
 * Astro's `publicDir` is a single directory, so shared assets are stored once in
 * media/shared/ and layered with the per-area directories here, immediately
 * before each build.
 *
 * Layering order — later wins:
 *   media/shared/  →  media/maar/  →  media/collect/  →  media/tree/
 *
 * Paths are copied verbatim. `/img/**` must survive byte-identically because
 * those paths appear in the frozen route manifest, and URL preservation beats
 * optimisation. Nothing here renames, rewrites or compresses anything.
 *
 * A collision between two areas is an error, not a silent overwrite: if two
 * areas both provide the same path with different bytes, one of them is about to
 * lose and nobody would notice.
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, readFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './lib/artifacts.mjs';

const MEDIA = join(ROOT, 'media');
const OUT = join(ROOT, '.public');
const LAYERS = ['shared', 'maar', 'collect', 'tree'];

const walk = (dir, base = dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, base, acc);
    else acc.push(relative(base, abs).split(sep).join('/'));
  }
  return acc;
};

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** path -> { layer, abs, hash } */
const placed = new Map();
const collisions = [];
let copied = 0;

for (const layer of LAYERS) {
  const layerDir = join(MEDIA, layer);
  for (const rel of walk(layerDir)) {
    const abs = join(layerDir, rel);
    const prior = placed.get(rel);

    if (prior) {
      const a = sha(prior.abs);
      const b = sha(abs);
      if (a !== b) {
        collisions.push(`${rel}: ${prior.layer} and ${layer} differ`);
        continue;
      }
      // Byte-identical duplicate: exactly what media/shared/ exists to prevent,
      // but harmless. Keep the first and note it.
      continue;
    }

    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(abs, dest);
    placed.set(rel, { layer, abs });
    copied += 1;
  }
}

if (collisions.length) {
  console.error(`\nassemble-public: ${collisions.length} conflicting asset path(s) — refusing to pick a winner silently:`);
  for (const c of collisions.slice(0, 20)) console.error(`  ${c}`);
  process.exit(1);
}

console.log(`assemble-public: ${copied} files -> .public/`);
