/**
 * Mapping between production URLs and files in the build output.
 *
 * The site builds with Astro `build.format: 'file'` and `trailingSlash: 'never'`,
 * which emits `about.html` for `/about`. The extensionless URL is then served by
 * the host's `.html` fallback — a host behaviour, not a build artifact. That is
 * why `/EBT5599` and `/EBT5599.html` both resolve today on GitHub Pages, and why
 * the fallback has to be re-proved on any new host before cutover.
 */

/** Percent-decode a URL path into the literal filename on disk. */
export function decodePath(urlPath) {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return urlPath; // malformed escape — compare literally
  }
}

/**
 * A trailing file extension.
 *
 * The bound was 8 characters, which silently excluded `.webmanifest` (11) — so
 * `/site.webmanifest` was treated as an extensionless page URL and resolved as
 * `site.webmanifest.html`, a file that does not and should not exist. Every
 * page links to the manifest, so the moment one shipped, `verify:links`
 * reported 134 broken internal links against a file sitting right there in
 * dist/.
 *
 * 12 covers `.webmanifest` with room to spare. Checked against the contract
 * before widening: the only paths in routes/policy.json with a dot-suffix over
 * 8 characters ARE the webmanifests, so nothing that was resolving as a page
 * starts resolving as a file.
 */
const HAS_EXTENSION = /\.[a-z0-9]{1,12}$/i;

/**
 * Candidate build-output files that would satisfy a production URL, in order of
 * preference. More than one is legitimate: `/about` is served by `about.html`
 * under format:'file', or by `about/index.html` under format:'directory'.
 *
 * @param {string} urlPath e.g. "/EBT5599", "/cards/032_...card%20X%20.html", "/"
 * @returns {string[]} dist-relative POSIX paths
 */
export function routeToFiles(urlPath) {
  let p = decodePath(urlPath.split('#')[0].split('?')[0]);
  if (!p.startsWith('/')) p = `/${p}`;
  const bare = p.slice(1);

  if (p === '/') return ['index.html'];
  if (p.endsWith('/')) return [`${bare}index.html`];
  if (HAS_EXTENSION.test(p)) return [bare];

  // Extensionless page URL: format:'file' emits `<name>.html`.
  return [`${bare}.html`, `${bare}/index.html`];
}

/**
 * Resolve a URL against an exact, case-sensitive index of the build output.
 * Returns the matching dist-relative path, or null.
 */
export function resolveRoute(urlPath, distSet) {
  for (const candidate of routeToFiles(urlPath)) {
    if (distSet.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Both immutable URL forms for an NFC card code.
 * These 70 strings are a contract with physical objects. Never derive them by
 * transforming one into the other at request time — enumerate both.
 */
export function cardUrlForms(code) {
  return [`/${code}`, `/${code}.html`];
}
