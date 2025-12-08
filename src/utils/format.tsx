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

export function formatDate(d?: string | null) {
  return (d ? new Date(d).toLocaleString() : "—")
}

export function shortenString(s: string, left = 10, right = 10) {
  if (s.length > left + right + 3) {
    return `${s.slice(0, left)}…${s.slice(-right)}`
  } else {
    return s;
  } 
}

export function formatIsoTime(iso: string | Date) {
  if (!iso) return "Unknown Date";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown Date";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
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