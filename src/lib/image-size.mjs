/**
 * The intrinsic pixel size of a first-party image, read from its own header at
 * build time.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `media/Picture` emitted a bare `<img src alt>`. A browser cannot know how tall
 * an image will be until it has fetched enough of it to find out, so it reserves
 * nothing: the page lays out, the picture arrives, and everything below it jumps
 * down. That is Cumulative Layout Shift, and on this site it lands on pages that
 * are mostly pictures.
 *
 * `width` and `height` attributes fix it, and they do it through `prose.css`
 * rather than in spite of it: `.prose img` sets `max-width: 100%; height: auto`,
 * and when both attributes are present every current engine derives
 * `aspect-ratio: width / height` from them. The image still scales fluidly — the
 * attributes are the RATIO, not a size — and the space is reserved before a byte
 * of it has been fetched.
 *
 * ── WHY IT IS MEASURED AND NOT TYPED ─────────────────────────────────────────
 *
 * The alternative was two more props on `Picture` and a number written by hand
 * at every call site. Three hundred and eighteen image paths live in
 * `src/config`, a hand-typed ratio is wrong the first time anyone re-exports a
 * picture, and a WRONG ratio is worse than none: it reserves the wrong space and
 * shifts the page twice. The file on disk is the only thing that actually knows,
 * so it is asked.
 *
 * ── WHY NOT `astro:assets` ───────────────────────────────────────────────────
 *
 * It would do all of this and more. It would also rewrite the URLs, and
 * AGENTS.md is unconditional: "`/img/**` must survive byte-identically because
 * those paths appear in the frozen route manifest, and URL preservation beats
 * optimisation." So the address is left exactly as written and only two
 * attributes are added.
 *
 * ── WHY NOT A DEPENDENCY ─────────────────────────────────────────────────────
 *
 * `image-size` is the obvious package and this file is the part of it this
 * repository uses. Four formats, each of which announces its dimensions in the
 * first few dozen bytes. The site ships png, jpg/jpeg, webp and one gif; svg is
 * deliberately unhandled below.
 */
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root — this file is `<root>/src/lib/`. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Where a root-relative `/img/...` actually is during a build.
 *
 * `.public` is what `scripts/assemble-public.mjs` composes out of `media/shared`
 * and the three per-area layers, and `package.json` runs it immediately before
 * `astro build` — so it exists, and it is the only place that holds every layer
 * at once. `public` is checked too, for a tree where the assembly has not run.
 */
const ROOTS = ['.public', 'public'].map((dir) => join(ROOT, dir));

/** How many bytes of a file the readers below ever need. */
const HEAD = 64;

/**
 * PNG: an 8-byte signature, then the IHDR chunk, whose first two big-endian
 * 32-bit fields are the dimensions. Fixed offsets, always.
 */
function png(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * GIF: `GIF87a`/`GIF89a`, then the logical screen width and height as
 * little-endian 16-bit values.
 */
function gif(buf) {
  if (buf.length < 10) return null;
  if (buf.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/**
 * WebP: a RIFF container whose fourth chunk word says which of three encodings
 * it holds, and all three put the size somewhere different.
 *
 *   VP8    lossy      a 3-byte start code, then 14-bit width and height
 *   VP8L   lossless   14-bit width and height packed across a 32-bit LE word
 *   VP8X   extended   24-bit width-1 and height-1, little-endian
 *
 * The banner on `/orbiters` is a plain lossy VP8, but `cwebp` picks the
 * container from its input, so a future alpha or animated export lands on one of
 * the other two and this must already know them.
 */
function webp(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    const at = (o) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
    return { width: at(24) + 1, height: at(27) + 1 };
  }
  return null;
}

/**
 * JPEG: a chain of markers of declared length, walked until one of the SOF
 * frame headers turns up. Unlike the other three this needs the whole file,
 * because the frame header sits after any thumbnail, colour profile or EXIF
 * block — which on a camera JPEG can be tens of kilobytes.
 *
 * `SOF0`..`SOF15` minus `DHT` (c4), `JPGA` (c8) and `DAC` (cc), which share the
 * range and are not frames. Height precedes width, which is the one place this
 * format disagrees with every other.
 */
function jpeg(buf) {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) {
      at += 1; // resynchronise across padding rather than give up
      continue;
    }
    const marker = buf[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(at + 7), height: buf.readUInt16BE(at + 5) };
    }
    /* Standalone markers carry no length word; everything else does. */
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      at += 2;
      continue;
    }
    at += 2 + buf.readUInt16BE(at + 2);
  }
  return null;
}

const READERS = { '.png': png, '.gif': gif, '.webp': webp, '.jpg': jpeg, '.jpeg': jpeg };

/** One build's answers, so a picture used on forty pages is read once. */
const cache = new Map();

/**
 * The intrinsic size of `src`, or null when there is honestly no answer.
 *
 * NULL IS A REAL RESULT AND NOT A FAILURE, and there are three ways to reach it:
 *
 *   an SVG          has no intrinsic pixel size worth asserting. Its `viewBox`
 *                   is a ratio, its `width` may be a percentage, and the four on
 *                   this site are marks that CSS sizes anyway.
 *   a remote URL    is not ours to measure, and `Picture` documents that its
 *                   `src` is first-party — but a facade's href or a future
 *                   caller could hand this one, and guessing would be worse.
 *   a missing file  is a broken image, which is `verify:links`' job to report.
 *                   Failing the build here would replace a precise error from
 *                   the check that exists for it with a vague one from this.
 *
 * A caller writes no attributes for null, which is exactly the markup that
 * shipped before this file existed.
 *
 * @param {string} src A root-relative path, e.g. `/img/orbiters/vitrola.webp`.
 * @returns {{width: number, height: number} | null}
 */
export function imageSize(src) {
  if (typeof src !== 'string' || !src.startsWith('/')) return null;
  if (cache.has(src)) return cache.get(src);

  let size = null;
  /* The address may carry a query or fragment; the file on disk does not. */
  const path = src.split(/[?#]/)[0];
  const dot = path.lastIndexOf('.');
  const reader = dot === -1 ? null : READERS[path.slice(dot).toLowerCase()];

  if (reader) {
    for (const root of ROOTS) {
      const file = join(root, path.slice(1));
      if (!existsSync(file)) continue;
      /* A JPEG's frame header can sit past any amount of metadata, so that one
         reader gets the whole file; the other three never look past 30 bytes. */
      const fd = openSync(file, 'r');
      try {
        const buf = Buffer.alloc(reader === jpeg ? 1 << 20 : HEAD);
        const read = readSync(fd, buf, 0, buf.length, 0);
        const found = reader(buf.subarray(0, read));
        if (found?.width > 0 && found?.height > 0) size = found;
      } finally {
        closeSync(fd);
      }
      break;
    }
  }

  cache.set(src, size);
  return size;
}
