import type { ReactNode } from "react";
import type { Source } from "../../../api/sources/types";

// Shared source-domain display helpers: turn a Source's provider-specific config
// (stored in the overloaded `keywords`/`lists`/`regex` fields) into human-readable
// labels. Used by both the Feeds page row title (feedTypeLabel) and the feed
// details view (getSourceConfigRows).

// Splits the `lists` field (a comma/space-separated string) into hashtags,
// mirroring how the edit form's MastodonHashtagField parses them.
export const parseHashtags = (raw?: string) =>
  (raw || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean);

export const MASTODON_MODE_LABELS: Record<string, string> = {
  public: "Public timeline",
  home: "Home timeline",
  hashtag: "Hashtag",
  keyword: "Keyword search",
};

export const MASTODON_SCOPE_LABELS: Record<string, string> = {
  local: "Local public timeline",
  public: "Federated public timeline",
};

// A short, category-only "type" label for a feed — the mode/scope, without any
// configured data values. Shown (uppercased via CSS) as the feed row title on
// the Feeds page. Every active provider maps to something meaningful; unknown
// providers fall back to the raw keywords so the row still reads sensibly.
export const feedTypeLabel = (source?: Source): string => {
  if (!source) return "";

  switch (source.media) {
    case "mastodon": {
      const mode = source.keywords || "";
      if (mode === "public") {
        if (source.regex === "local") return "Public timeline (Local)";
        if (source.regex === "public") return "Public timeline (Federated)";
        return "Public timeline";
      }
      if (mode === "home") return "Home timeline";
      if (mode === "hashtag") return "Hashtags";
      if (mode === "keyword") return "Keyword search";
      return mode;
    }
    case "junkipedia":
      return "Junkipedia lists";
    case "telegramUser":
      return "Chats / Channels";
    case "ioda":
    case "cloudflare":
      return "Country";
    case "ooni":
      return "Network ASNs";
    default:
      return source.keywords ?? "";
  }
};

// Read-only rows describing a feed's provider-specific configuration — the same
// fields the edit form exposes as inputs. Empty values are omitted so a feed
// with no extra config simply shows no rows.
export const getSourceConfigRows = (
  source?: Source
): { label: string; value: ReactNode; hint?: ReactNode }[] => {
  if (!source) return [];
  const rows: { label: string; value: ReactNode; hint?: ReactNode }[] = [];

  switch (source.media) {
    case "mastodon": {
      const mode = source.keywords || "";
      if (mode)
        rows.push({ label: "Mode", value: MASTODON_MODE_LABELS[mode] || mode });
      if (mode === "hashtag") {
        const tags = parseHashtags(source.lists);
        if (tags.length)
          rows.push({
            label: tags.length === 1 ? "Hashtag" : "Hashtags",
            value: (
              <div className='flex flex-wrap gap-2'>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className='inline-flex items-center rounded-full bg-slate-200 dark:bg-gray-600 px-2 py-1 text-sm font-medium'
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ),
            hint:
              tags.length === 1
                ? "We pull in posts that use this hashtag."
                : "We pull in posts that use any of these hashtags, without repeating a post that has more than one.",
          });
      } else if (mode === "keyword") {
        if (source.lists) rows.push({ label: "Keyword", value: source.lists });
      } else if (mode === "public") {
        if (source.regex)
          rows.push({
            label: "Public timeline scope",
            value: MASTODON_SCOPE_LABELS[source.regex] || source.regex,
          });
      }
      break;
    }
    case "junkipedia":
      if (source.lists)
        rows.push({
          label: "Lists",
          value: source.lists,
          hint: "Junkipedia List IDs. Each one points to a monitoring list (a saved set of accounts, channels, hashtags, or search terms). Aggie collects the posts from these lists as Alerts.",
        });
      break;
    case "telegramUser":
      if (source.lists)
        rows.push({
          label: "Chats / Channels / Users",
          value: source.lists,
          hint: "The Telegram entities this feed pulls from, such as public usernames like @channel_one or private chat/channel IDs like -1001234567890.",
        });
      break;
    case "ioda":
    case "cloudflare":
      if (source.keywords)
        rows.push({ label: "Country code", value: source.keywords });
      break;
    case "ooni":
      if (source.lists)
        rows.push({ label: "Network ASNs", value: source.lists });
      break;
    default:
      break;
  }

  return rows;
};
