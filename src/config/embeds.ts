/**
 * What a click-to-load facade SAYS, keyed by provider and language — MW-19.
 *
 * This is the table `site.ts` predicted when the Collect landing was converted:
 * *"when the remaining fifteen pairs are converted they will want one shared
 * table keyed by provider and language; this is that table's first entry, not a
 * per-page value."* This is that table. `COLLECT_LANDING.video` is gone and the
 * family reads from here, so the strings exist once for the whole site.
 *
 * They are chrome, not page copy. The identical pair appears on eight pages, and
 * a reader learns the sentence rather than reading it — so it belongs to the
 * mechanism, the way the header's section names do, and not to any one record.
 *
 * ── THE KEY IS NOT THE NAME ──────────────────────────────────────────────────
 *
 * `provider` is the KEY `ui/EmbedConsentScript` selects on and the string that
 * goes in `data-embed-provider`. `name` is the word a READER sees. They are the
 * same for youtube and vimeo, which is exactly why the distinction is easy to
 * lose — they are different for every other provider on the site:
 *
 *   key `google-calendar`  ->  name "google calendar"
 *   key `external`         ->  name "the source" / "la fuente"   (per language!)
 *
 * So the name is a field here, per language, and never derived from the key.
 *
 * ── THE NOTE IS DERIVED, ON PURPOSE ──────────────────────────────────────────
 *
 * Every note on the site is the same sentence with the provider's name in it.
 * Written out per entry it would be a fourth hand-held correspondence — the
 * failure mode this repo has actually shipped three times — where a note could
 * come to name a different provider from the span directly above it. `noteFor`
 * composes it from the same `name` the facade displays, so the two cannot
 * disagree.
 *
 * ── GROWING THIS TABLE ───────────────────────────────────────────────────────
 *
 * One entry per provider a converted page needs, added by the conversion that
 * needs it. It is deliberately NOT pre-populated from a grep of the unconverted
 * bodies: `soundcloud`, `google-calendar` and `external` still have their
 * strings written into `lab/dadada`, `calendar` and `radio`, and copying them
 * here before those pages are converted would create the second spelling this
 * file exists to remove. Add the entry and delete the markup in one commit.
 *
 * NOTE FOR WHOEVER CONVERTS `lab/dadada`: its Spanish half currently says
 * "listen on soundcloud" — the English label, on a Spanish page. That is a bug
 * to fix in the conversion, not a string to transcribe faithfully.
 */

/** The languages the site is published in. English is the source of truth. */
type Lang = 'en' | 'es';

interface FacadeStrings {
  /** The provider name a reader sees. NOT the key. Per language. */
  name: string;
  /** The action, in this language: "watch this video on youtube". */
  label: string;
}

/**
 * Keyed by `data-embed-provider`, then by language.
 *
 * The label is per provider because the verb is: you *watch* a video and you
 * *listen* to a track, and no rule derives one from the other.
 */
export const EMBED_FACADE: Record<string, Record<Lang, FacadeStrings>> = {
  youtube: {
    en: { name: 'youtube', label: 'watch this video on youtube' },
    es: { name: 'youtube', label: 'ver este video en youtube' },
  },
  vimeo: {
    en: { name: 'vimeo', label: 'watch this video on vimeo' },
    es: { name: 'vimeo', label: 'ver este video en vimeo' },
  },
};

/**
 * "opens in a new tab. nothing is requested from youtube until you choose it."
 *
 * The reassurance under every facade, composed from the name the facade shows.
 * It is the site's promise that the invariant in AGENTS.md holds — no
 * third-party request fires on load — so it names the party that is not being
 * contacted, and it must name the same one the span above it does.
 */
export const noteFor = (name: string, lang: Lang): string =>
  lang === 'es'
    ? `se abre en una pestaña nueva. no se le pide nada a ${name} hasta que lo elijas.`
    : `opens in a new tab. nothing is requested from ${name} until you choose it.`;

/**
 * Everything a facade needs to render, for one provider in one language.
 *
 * Throws rather than falling back to English. A missing entry is a page that
 * would ship half-translated chrome — the defect MW-19 exists to remove — and a
 * silent English default is how that ships green. The build stops instead.
 */
export function facadeStrings(provider: string, lang: Lang) {
  const entry = EMBED_FACADE[provider]?.[lang];
  if (!entry) {
    throw new Error(
      `[embeds] no facade strings for provider "${provider}" in "${lang}" — ` +
        'add the entry to EMBED_FACADE in src/config/embeds.ts',
    );
  }
  return { ...entry, note: noteFor(entry.name, lang) };
}
