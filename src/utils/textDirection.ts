/**
 * Base text direction for user-generated post content.
 *
 * Why not `dir="auto"` (or `unicode-bidi: plaintext`)? Both resolve direction from
 * the FIRST strong character (Unicode bidi algorithm rules P2/P3). That gets the
 * common Twitter shape wrong:
 *
 *   RT @MattTheRat_: ازتون میخوام به این رشتوی بسیار مهم افشاگری توجه کنید
 *
 * The first strong character is the `R` of `RT`, so the paragraph resolves LTR and
 * the retweet prefix renders on the visual left — the opposite end from where a
 * Persian reader expects the start of the line. Same for a post opening with a
 * brand name or a URL. The direction has to come from what the post is mostly
 * written in, not from whichever character happens to come first.
 *
 * This is a heuristic for picking `dir`, not an implementation of the bidi
 * algorithm — the browser still does the actual reordering. It deliberately
 * counts Arabic-Indic digits (۱۲۳) as an RTL signal even though the bidi
 * algorithm classes them as weak, because in practice they only show up in
 * RTL-script text and they help short posts resolve correctly.
 */

// Hebrew, Arabic (covers Persian/Urdu), Syriac, Thaana, NKo, Samaritan, Mandaic,
// Arabic Extended-A, and the Arabic presentation-form blocks.
const RTL_CHARS =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿߀-߿ࠀ-࠿ࡀ-࡟ࢠ-ࣿיִ-﷿ﹰ-﻿]/g;

// Latin (incl. accented), Greek, Cyrillic, Armenian. ASCII digits and punctuation
// are intentionally absent: they are not strong characters and appear just as
// often inside RTL text ("۲۴ ساعت", "45%"), so counting them would bias LTR.
const LTR_CHARS = /[A-Za-zÀ-ʯͰ-ϿЀ-ӿ԰-֏]/g;

// Fragments that shouldn't get a vote. A Persian post is still a Persian post when
// it links to an English URL, quotes an @handle, or carries a tag —
// and `RT` is boilerplate, not content.
const NON_VOTING = [
  /<[^>]+>/g, // HTML tags -- TruthSocial content arrives as markup, and `<p>`,
  //            `href`, `class` etc. are Latin characters that aren't content
  /https?:\/\/\S+/gi, // URLs
  /\bwww\.\S+/gi,
  /@[\w.]+/g, // mentions
  /#[^\s#]+/g, // hashtags, in any script
  /\bRT\b/g, // retweet prefix
];

/**
 * Share of strong characters that must be RTL for the whole block to be RTL.
 * Low on purpose: RTL posts routinely carry English product names, place names
 * and transliterations, and those shouldn't flip the paragraph. The inverse case
 * (an English post quoting a line of Persian) stays LTR because the Persian is a
 * small fraction of the text.
 */
const RTL_THRESHOLD = 0.3;

function countStrong(text: string) {
  return {
    rtl: (text.match(RTL_CHARS) || []).length,
    ltr: (text.match(LTR_CHARS) || []).length,
  };
}

/**
 * Returns the `dir` value to put on an element rendering `text`.
 *
 * Text with no RTL characters at all always returns "ltr", so English and every
 * other LTR-script post behaves exactly as it did before this existed.
 */
export function detectTextDirection(text?: string | null): "rtl" | "ltr" {
  if (!text || typeof text !== "string") return "ltr";

  const sample = NON_VOTING.reduce((acc, re) => acc.replace(re, " "), text);
  let { rtl, ltr } = countStrong(sample);

  // A post that is nothing but a handle, a link and hashtags strips down to
  // nothing — fall back to the raw text rather than defaulting it to LTR.
  if (rtl === 0 && ltr === 0) ({ rtl, ltr } = countStrong(text));

  if (rtl === 0) return "ltr";
  if (ltr === 0) return "rtl";
  return rtl / (rtl + ltr) >= RTL_THRESHOLD ? "rtl" : "ltr";
}
