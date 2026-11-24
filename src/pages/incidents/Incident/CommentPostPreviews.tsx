import { find } from "linkifyjs";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportByUrl } from "../../../api/reports";
import SocialMediaPost from "../../../components/SocialMediaPost";

export function commentPostUrls(text: string) {
  // Bound lookups for long comments and deduplicate repeated links.
  return Array.from(
    new Set(
      find(text)
        .filter(
          (link) => link.type === "url" && /^https?:\/\//i.test(link.value),
        )
        .map((link) => link.value),
    ),
  ).slice(0, 10);
}

// X status ID for x.com / twitter.com post links (kept as a string: 19-digit IDs exceed JS number precision).
export function tweetIdFromUrl(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    if (!/^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/i.test(hostname))
      return null;
    return (
      /^\/(?:[^/]+\/status(?:es)?|i\/web\/status)\/(\d+)\/?$/.exec(
        pathname,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

// Load X's widgets.js once per page.
let twitterWidgets: Promise<any> | null = null;
function loadTwitterWidgets(): Promise<any> {
  const w = window as any;
  if (w.twttr?.widgets) return Promise.resolve(w.twttr);
  if (!twitterWidgets) {
    twitterWidgets = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://platform.twitter.com/widgets.js";
      s.async = true;
      s.onload = () => (w.twttr ? w.twttr.ready(resolve) : reject());
      s.onerror = () => {
        twitterWidgets = null;
        reject();
      };
      document.head.appendChild(s);
    });
  }
  return twitterWidgets;
}

// Fallback for posts not stored as reports: X's official embed. Renders nothing if the embed fails.
function TweetEmbed({ tweetId }: { tweetId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = "";
    setFailed(false);
    loadTwitterWidgets()
      .then((twttr) =>
        twttr.widgets.createTweet(tweetId, el, {
          conversation: "none",
          dnt: true,
          align: "left",
        }),
      )
      .then((node) => {
        if (!cancelled && !node) setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      el.innerHTML = "";
    };
  }, [tweetId]);
  return failed ? null : (
    <div ref={ref} className="tweet-embed max-w-[550px]" />
  );
}

function CommentPostPreview({ url }: { url: string }) {
  const { data: report, isFetchedAfterMount } = useQuery(
    ["comment-post", url],
    () => getReportByUrl(url),
    {
      retry: false,
      // Retry cached misses when comments mount again or the window regains focus.
      staleTime: 0,
    },
  );
  if (report) return <SocialMediaPost report={report} showMedia />;
  // Not stored as a report (or lookup failed): fall back to X's official embed for tweets.
  const tweetId = tweetIdFromUrl(url);
  // Wait for this mount's lookup so a stale cached miss doesn't flash the embed.
  if (tweetId && isFetchedAfterMount) return <TweetEmbed tweetId={tweetId} />;
  // The original comment link stays available while loading, on errors and on misses.
  return null;
}

export default function CommentPostPreviews({ text }: { text: string }) {
  return (
    <>
      {commentPostUrls(text).map((url) => (
        <CommentPostPreview key={url} url={url} />
      ))}
    </>
  );
}
