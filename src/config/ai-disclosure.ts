/**
 * AI transparency — Article 50 of the EU AI Act, Regulation (EU) 2024/1689.
 *
 * THIS FILE IS THE FACTUAL CLAIM THE SITE MAKES ABOUT ITS OWN WORKS, and it is
 * the one place to correct it. Every disclosure a visitor sees, in both
 * languages, is rendered from here. Nothing restates it in prose, so a
 * correction here corrects the whole site and there is no second copy to fall
 * out of step.
 *
 * ── Which paragraph of Article 50 actually applies ──────────────────────────
 *
 * Maar World is a DEPLOYER of AI systems, never a provider of one. It runs no
 * model, serves no inference and ships no generative feature; it published
 * works that named AI tools helped make. That distinction decides the whole
 * obligation, so it is written down rather than left to be re-derived:
 *
 *   50(1)  AI systems that interact directly with a person — NOT APPLICABLE.
 *          This is a static site. There is no chatbot, no assistant and no
 *          inference of any kind at request time.
 *   50(2)  Providers of generative systems must mark output machine-readably —
 *          NOT APPLICABLE to us. That obligation sits on the provider of the
 *          model. We mark anyway, because it is cheap and it is the only thing
 *          a machine can read.
 *   50(3)  Emotion recognition, biometric categorisation — NOT APPLICABLE.
 *   50(4)  DEPLOYER disclosure of AI-generated or manipulated image, audio or
 *          video content — THIS IS THE ONE THAT BINDS US.
 *   50(5)  How: clear and distinguishable, at the latest at the time of first
 *          exposure, and accessible.
 *
 * ── Why the notice is ONE sentence and not a per-work statement ─────────────
 *
 * THE OWNER'S CORRECTION, 2026-08-14, AND IT CHANGED THE DESIGN. An earlier
 * version of this file tried to say which tool touched which work, gated the
 * notice per release, and left `STW3344` out because its credits named no AI.
 * That was wrong on the facts — AI was used more widely than the credits
 * tables record, including on cover artwork and on that card — and wrong in
 * shape, because it committed the site to a card-by-card audit nobody is going
 * to do and that would go stale the moment a work was revised.
 *
 * So the notice is now ONE short sentence, the same everywhere, saying that AI
 * assistance is part of how this work is made. It is uniform across every card
 * and every release, with no exceptions to maintain.
 *
 * That is not a weaker disclosure — for this site it is a truer one. Article
 * 50(4)'s second subparagraph limits the obligation on an "evidently artistic,
 * creative, satirical, fictional or analogous work" to disclosing the EXISTENCE
 * of generated content "in an appropriate manner that does not hamper the
 * display or enjoyment of the work". Existence is exactly what one uniform
 * sentence states. A precise per-card claim is a thing the Article never asked
 * for, and a precise claim that is WRONG is worse than a general one that is
 * right.
 *
 * The named tools still appear, once, on /ai-transparency. That is where
 * someone who wants the detail goes, and it is the only place that has to be
 * kept accurate.
 *
 * ── Timing ─────────────────────────────────────────────────────────────────
 *
 * Article 50 has applied since 2 August 2026. The Digital Omnibus deferred the
 * Annex III high-risk timetable to 2 December 2027 and left Article 50 where it
 * was, so this is in force now rather than pending.
 */

import { AI_WORK_IDS } from './ai-work-ids.mjs';

/**
 * IPTC Digital Source Type — the machine-readable half.
 *
 * The vocabulary the industry settled on for "how was this made", used by C2PA
 * Content Credentials and by the major platforms' AI labels. Article 50(2)'s
 * marking duty is the model provider's, not ours, but a deployer emitting the
 * same term is what makes a disclosure legible to something other than a human
 * reader — and 50(5)'s accessibility requirement is not met by an image of the
 * word "AI".
 *
 * `composite` is the term for human authorship plus a generative tool, which is
 * what everything here is. Do not invent a third term: the value is a
 * controlled URI, and one that is not in the vocabulary is worse than none
 * because it looks machine-readable and is not.
 */
export const DIGITAL_SOURCE_TYPE = {
  /** "A compilation of trained algorithmic media with other media." */
  composite: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
  /** "Created using a model derived from sampled content." Wholly model-made. */
  trained: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
} as const;

export type DigitalSourceType = (typeof DIGITAL_SOURCE_TYPE)[keyof typeof DIGITAL_SOURCE_TYPE];

/**
 * THE NOTICE. One sentence, every page that carries the work, both languages.
 *
 * ── Every word here is doing a job ─────────────────────────────────────────
 *
 * "Parts of this work" — not "this image", not "this card". It is true wherever
 * it appears, which is what lets the same line sit on 100+ pages with no
 * per-page fact to verify and no exception to maintain.
 *
 * "were made with AI" — the plain words. `generado o manipulado artificialmente`
 * is the Regulation's phrasing and it is not what this is: these are works an
 * artist made using tools. The Article asks for the existence of the content to
 * be disclosed, not for its own vocabulary to be recited at a reader.
 *
 * It does not name a tool. Tools are named once, on /ai-transparency, because
 * naming them per page is the enumeration that was wrong before.
 *
 * KEEP IT SHORT. The whole line, label included, has to read as fine print at
 * the bottom of a page. Every clause added here is added to a hundred pages.
 */
export const AI_NOTE = {
  en: {
    text: 'Parts of this work were made with AI.',
    more: 'AI transparency',
    href: '/ai-transparency',
  },
  es: {
    text: 'Partes de esta obra fueron hechas con IA.',
    more: 'Transparencia sobre IA',
    href: '/es/ai-transparency',
  },
} as const;

/** The notice in the reader's language, falling back to English. */
export const aiNoteFor = (lang: string | undefined) => (lang === 'es' ? AI_NOTE.es : AI_NOTE.en);

/** Which sense a work involves. */
export type AiMedium = 'image' | 'text' | 'audio';

/**
 * The works described on /ai-transparency. The list lives in `ai-work-ids.mjs`
 * — see that file for why it is a separate module and why it stayed one after
 * the reason expired. A name there with no entry in `AI_WORKS` below is a type
 * error, which is the point of importing rather than restating it.
 */
export type AiWorkId = (typeof AI_WORK_IDS)[number];

export interface AiWork {
  /** The named systems, spelled as their makers spell them. */
  readonly systems: readonly string[];
  readonly medium: readonly AiMedium[];
  readonly digitalSourceType: DigitalSourceType;
  /** What this work is and what AI did in it. Shown only on /ai-transparency. */
  readonly en: string;
  readonly es: string;
  /** Where the site itself records this, where it does. Kept so it is auditable. */
  readonly source: string;
  /** Has the owner confirmed this against the work? */
  readonly attested: boolean;
}

/**
 * The detail, for /ai-transparency only. NOT rendered beside any work — the
 * notice above is what appears there.
 *
 * These entries may be revised without touching a single page, which is the
 * point of keeping the per-page notice general.
 */
export const AI_WORKS: Record<AiWorkId, AiWork> = {
  /**
   * The Sky Sounds release. The credits table names DALL·E 2 and ChatGPT-3, and
   * the owner has confirmed AI ran wider than that table records — across card
   * artwork, cover artwork and card texts, rather than being confined to the
   * cards whose credits mention it.
   *
   * SO THIS ENTRY DOES NOT ENUMERATE. It says the release was made with these
   * tools, which is true, and declines to say which card got which, which is
   * not known and is not what Article 50 asks for.
   */
  'sky-sounds': {
    /**
     * The credits table names DALL·E 2 and "Chat-GPT3". The owner added the
     * cover artwork and confirmed the tool there was ChatGPT (2026-08-14).
     *
     * SPELLED WITHOUT A VERSION NUMBER on purpose. "ChatGPT-3" is accurate to
     * the one use the credits record and would be wrong for the covers, and
     * pinning versions is the same enumeration this design dropped. The plain
     * product name is true of every use.
     */
    systems: ['DALL·E 2', 'ChatGPT'],
    medium: ['image', 'text'],
    digitalSourceType: DIGITAL_SOURCE_TYPE.composite,
    en: 'The Sky Sounds cards were made with AI assistance alongside hand work — across the card artwork, the cover artwork and the card texts.',
    es: 'Las cartas de Sky Sounds fueron hechas con asistencia de IA junto al trabajo a mano: en las ilustraciones, en las portadas y en los textos.',
    source: '/collect/docs/releases/skysounds — credits, and the owner’s account of the work',
    attested: true,
  },
  /**
   * The collages used as section covers and header artwork — the 27-image set
   * under `/img/collages/`, wired up in `SECTION_COLLAGE` and
   * `ARTICLE_COVER_FALLBACKS`.
   *
   * The owner's account, 2026-08-14: **all** of them are AI-assisted, and they
   * are mixed rather than generated — her own elements made first, then
   * combined with AI. That is `compositeWithTrainedAlgorithmicMedia` in the
   * exact sense the IPTC term is defined for, so the marker was already right
   * and only the inventory needed the entry.
   *
   * NO TOOL NAMED, because none is recorded and the owner has not named one for
   * this set. Saying "presumably the same tools as the cards" would be a guess
   * dressed as a credit.
   *
   * The pages carrying these are not listed here and must not be: `collageFor`
   * resolves them from `SECTION_COLLAGE`, so the route asks that helper rather
   * than keeping a second list that could disagree with it.
   */
  covers: {
    systems: [],
    medium: ['image'],
    digitalSourceType: DIGITAL_SOURCE_TYPE.composite,
    en: 'The collages used as section covers and header artwork are mixed works — elements made by hand first, then combined with AI.',
    es: 'Los collages que se usan como portadas de sección e ilustraciones de cabecera son obras mixtas: elementos hechos a mano primero y después combinados con IA.',
    source: 'the owner’s account of the work',
    attested: true,
  },
  /**
   * Dadada — `lab/{en,es}/dadada`.
   *
   * The owner named this page as involving AI (2026-08-14) while describing the
   * covers. Its record carries `ai: true` and its body names no tool, so THIS
   * ENTRY IS THE ONLY PLACE THE CLAIM CAN BE AUDITED FROM — which is why it
   * exists at all. Review flagged the page as disclosed-but-unaccounted-for,
   * and a flag with nothing behind it is the failure this file is meant to
   * prevent.
   *
   * `attested: false`, and the wording is deliberately the least specific thing
   * that is true: the owner said AI is involved, not what it did. Sharpen this
   * only from her account of the work, never from looking at the picture.
   */
  dadada: {
    systems: [],
    medium: ['image'],
    digitalSourceType: DIGITAL_SOURCE_TYPE.composite,
    en: 'The Dadada piece involves AI-assisted imagery alongside hand work.',
    es: 'La pieza Dadada involucra imágenes asistidas por IA junto al trabajo a mano.',
    source: 'the owner’s account of the work — not recorded on the page itself',
    attested: false,
  },
  /**
   * Rthw00. The page's own line — "War march transformed with artificial
   * intelligence systems that learned from scientific and poetic texts" — is
   * already a disclosure in substance. This is the same fact in the form
   * Article 50(5) asks for, and it names no system because the record names
   * none.
   */
  rthw00: {
    systems: [],
    medium: ['audio'],
    digitalSourceType: DIGITAL_SOURCE_TYPE.composite,
    en: 'This composition transforms a recorded war march using artificial intelligence systems trained on scientific and poetic texts.',
    es: 'Esta composición transforma una marcha militar grabada mediante sistemas de inteligencia artificial entrenados con textos científicos y poéticos.',
    source: '/rthw00 — body text',
    attested: false,
  },
  /**
   * The Maar World narrative: "from the brush to the machine learning models
   * that reinterpret these creations and expand the stories of an imaginary
   * world". A statement of method for the imaginary as a whole.
   */
  'maar-world-imaginary': {
    systems: [],
    medium: ['image', 'text'],
    digitalSourceType: DIGITAL_SOURCE_TYPE.composite,
    en: 'The Maar World imaginary is built by hand and expanded with machine learning models that reinterpret the original work.',
    es: 'El imaginario de Maar World se construye a mano y se expande con modelos de aprendizaje automático que reinterpretan la obra original.',
    source: '/collect/docs/mw — body text',
    attested: false,
  },
};

/** A work's line in the reader's language, falling back to English. */
export const aiLineFor = (work: AiWork, lang: string | undefined) =>
  lang === 'es' ? work.es : work.en;
