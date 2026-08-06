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
 * bodies: copying a string here before the page that holds it is converted
 * would create the second spelling this file exists to remove. Add the entry
 * and delete the markup in one commit.
 *
 * `external` IS STILL ABSENT, AND THAT IS NOT AN OVERSIGHT. Its only caller was
 * `/radio`, and that page was deleted rather than converted — so there is no
 * page whose markup an `external` entry would replace, and adding one would be
 * exactly the speculative pre-population the paragraph above forbids. Whoever
 * next needs a facade for a link that is not a named platform adds it then, and
 * picks the reader-facing name at that point: "the source" / "la fuente" is
 * what `/radio` used, and it is recorded here as a starting point, not a
 * decision already taken.
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
    en: { name: 'YouTube', label: 'Watch this video on YouTube' },
    es: { name: 'YouTube', label: 'Ver este video en YouTube' },
  },
  vimeo: {
    en: { name: 'Vimeo', label: 'Watch this video on Vimeo' },
    es: { name: 'Vimeo', label: 'Ver este video en Vimeo' },
  },
  /**
   * The booking calendar. NOTE THE KEY IS NOT THE NAME — `google-calendar`
   * against "Google Calendar" — which is the distinction this table exists to
   * keep, and the first entry where the two actually differ.
   */
  /**
   * The Dadada live set. THE VERB IS THE POINT: you *listen* to a track and you
   * *watch* a video, and nothing derives one from the other — which is the
   * reason `label` is per provider in this table rather than composed from the
   * name the way `note` is.
   *
   * Its Spanish half was the note at the top of this file: `lab/es/dadada`
   * shipped "listen on soundcloud", the English sentence, under Spanish copy
   * and a Spanish heading. Fixed by existing here rather than in that body.
   */
  soundcloud: {
    en: { name: 'SoundCloud', label: 'Listen to this track on SoundCloud' },
    es: { name: 'SoundCloud', label: 'Escuchar este track en SoundCloud' },
  },
  'google-calendar': {
    en: { name: 'Google Calendar', label: 'Open the booking calendar on Google Calendar' },
    es: { name: 'Google Calendar', label: 'Abrir el calendario de reservas en Google Calendar' },
  },
};

/**
 * "Opens in a new tab. Nothing is requested from YouTube until you choose it."
 *
 * The reassurance under every facade, composed from the name the facade shows.
 * It is the site's promise that the invariant in AGENTS.md holds — no
 * third-party request fires on load — so it names the party that is not being
 * contacted, and it must name the same one the span above it does.
 */
export const noteFor = (name: string, lang: Lang): string =>
  lang === 'es'
    ? `Se abre en una pestaña nueva. No se le pide nada a ${name} hasta que lo elijas.`
    : `Opens in a new tab. Nothing is requested from ${name} until you choose it.`;

/**
 * What the GATE says once JavaScript has replaced the facade — MW-19.
 *
 * `ui/EmbedConsentScript` builds its poster button in the browser, and it built
 * it in English on every page: the visible line read "plays from youtube" and
 * the button's accessible name ended "— loads the player from
 * youtube-nocookie.com", under Spanish copy, on every Spanish page with a video.
 * The booking calendar's line said "open the booking calendar here". None of it
 * was visible to any check, and all of it was visible to a reader.
 *
 * It is the same defect as the navigation, as the full-screen link under a
 * player, and as `lab/es/dadada` saying "listen on soundcloud" — a sentence
 * that lives in one place and was written in one language. So it lives here,
 * beside the facade's own words, keyed the same way.
 *
 * THE SCRIPT READS `document.documentElement.lang`, which the shell already
 * sets per page. It does not guess and it does not default to English: an
 * unknown value falls back to `en` explicitly below, and that fallback is the
 * only English a Spanish page can reach.
 */
export const GATE = {
  en: {
    /** The three visible words on the poster: "Plays from YouTube". */
    playsFrom: (name: string) => `Plays from ${name}`,
    /** The rest of the offer, for a screen reader only. */
    loadsFrom: (host: string) => `loads the player from ${host}`,
  },
  es: {
    playsFrom: (name: string) => `Se reproduce desde ${name}`,
    loadsFrom: (host: string) => `carga el reproductor desde ${host}`,
  },
} as const;

/** The gate's words for a page, from whatever `<html lang>` says. */
export const gateStrings = (lang: string) => (lang === 'es' ? GATE.es : GATE.en);

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
