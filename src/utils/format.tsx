import { isString } from "lodash";
import { Fragment } from "react";
interface IFormatOptions {}
const formatters = [
  {
    key: "username",
    desc: "format usernames with @mark",
    regex: /@[a-z0-9_]+/g,
    defaultStyle: "bg-slate-200/75 dark:bg-gray-600/75 px-1",
  },
  {
    key: "hashtag",
    desc: "format #hastags",
    regex: /#[a-z0-9_]+/g,
    defaultStyle: "text-slate-500 dark:text-gray-400",
  },
];

/**
 * formats text with some css style based on formatter.
 * kinda goofy and should be rewritten if performance is an issue
 * @param text
 * @param options
 * @returns
 */
export function formatText(text: string, options: IFormatOptions = {}) {
  if (!text || !isString(text)) return text;
  const words = text.split(" ");
  let wordsToFormat = new Map();
  //match and mark words to be formatted
  // maybe this can be redone to use the built-in .match
  words.map((word, index) => {
    formatters.forEach(({ key, regex }) => {
      if (word.toLowerCase().match(regex)) {
        wordsToFormat.set(index, key);
      }
    });
  });

  return (
    <>
      {words.map((word, index) => {
        if (!wordsToFormat.has(index))
          return <Fragment key={index}>{word + " "}</Fragment>;
        const style = formatters.find(
          (i) => i.key === wordsToFormat.get(index)
        )?.defaultStyle;
        return (
          <Fragment key={index}>
            <span className={style}>{word}</span>{" "}
          </Fragment>
        );
      })}
    </>
  );
}

export const formatAuthor = (author: string, media: string[]) => {
  if (media[0] === "twitter") return "@" + author;
  return author;
};

/**
 * convert number to pretty text
 * @param number
 * @returns
 */
export function formatNumber(number: number): string {
  return number.toLocaleString();
}

/**
 * formatted pretty string of page count
 * @param page current page
 * @param pageSize number of items per page
 * @param total total item count
 * @returns
 */
export function formatPageCount(
  page: number | undefined,
  pageSize: number,
  total: number | undefined
) {
  if (page === undefined) return "0";

  const totalCount = total !== undefined ? formatNumber(total) : "---";

  const pageCount = page * pageSize;

  const toCount = pageCount + 51 > (total || 0) ? total || 0 : pageCount + 51;

  return `${formatNumber(pageCount + 1)} — ${formatNumber(toCount)} ${
    totalCount && "of " + totalCount
  }`;
}

export function shortenString(s: string, left = 10, right = 10) {
  if (s.length > left + right + 3) {
    return `${s.slice(0, left)}…${s.slice(-right)}`
  } else {
    return s;
  } 
}

export function formatDurationFromSeconds(seconds?: number | null) {
  if (seconds == null || seconds <= 0) return "Ongoing";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);

  return parts.join(" ");
}


// ---------------------------------------------------------------------------
// Text direction
// ---------------------------------------------------------------------------

/**
 * Base text direction for user-generated post content.
 * The direction has to come from what the post is mostly
 * written in, not from whichever character happens to come first.
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
