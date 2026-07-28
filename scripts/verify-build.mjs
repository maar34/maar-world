#!/usr/bin/env node
/**
 * verify:build — a clean production build, with warnings held below a threshold.
 *
 * Runs the real Astro build rather than trusting a previous dist/. If the app
 * does not exist yet (MW-5), this reports SKIP rather than inventing a pass.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runStandalone } from './lib/report.mjs';
import { ROOT } from './lib/artifacts.mjs';

const WARNING_THRESHOLD = 0;

const CONFIGS = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'];

export async function checkBuild(report) {
  const config = CONFIGS.find((f) => existsSync(resolve(ROOT, f)));
  if (!config) {
    return report.skip('production build is clean', 'astro.config.mjs', 'MW-5');
  }
  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    return report.skip('production build is clean', 'node_modules (run npm install)', 'MW-5');
  }

  const result = spawnSync('npx', ['astro', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status !== 0) {
    const tail = output.trim().split('\n').slice(-6).join(' / ');
    return report.fail('production build succeeds', `astro build exited ${result.status}: ${tail}`);
  }
  report.pass('production build succeeds');

  const warnings = output
    .split('\n')
    .filter((l) => /\[WARN\]|\bwarning\b/i.test(l))
    .filter((l) => !/0 warnings/i.test(l));

  if (warnings.length > WARNING_THRESHOLD) {
    report.fail(
      `build warnings at or below ${WARNING_THRESHOLD}`,
      `${warnings.length} warnings — first: ${warnings[0].trim().slice(0, 120)}`,
    );
  } else {
    report.pass(`build warnings at or below ${WARNING_THRESHOLD}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-build.mjs')) {
  runStandalone('verify:build', checkBuild);
}
