import { find } from "linkifyjs";
import { useQuery } from "@tanstack/react-query";
import { getReportByUrl } from "../../../api/reports";
import SocialMediaPost from "../../../components/SocialMediaPost";
import MediaPreview from "../../../components/SocialMediaPost/MediaPreview";

export function commentPostUrls(text: string) {
  // Bound lookups for long comments and deduplicate repeated links.
  return Array.from(new Set(find(text)
    .filter((link) => link.type === "url" && /^https?:\/\//i.test(link.value))
    .map((link) => link.value))).slice(0, 10);
}

function CommentPostPreview({ url }: { url: string }) {
  const { data: report } = useQuery(["comment-post", url], () => getReportByUrl(url), {
    retry: false,
    // Retry cached misses when comments mount again or the window regains focus.
    staleTime: 0,
  });
  // The original comment link stays available while loading, on errors and on misses.
  if (!report) return null;
  const raw = (report.metadata.rawAPIResponse || {}) as any;
  // Develop's Twitter renderer reads provider payload images rather than mediaUrl.
  const needsMediaFallback = report._media[0] === "twitter" && report.metadata.mediaUrl &&
    !raw.attributes?.post_data?.entities?.media?.length &&
    !raw.post?.post_data?.entities?.media?.length;
  return <>
    <SocialMediaPost report={report} showMedia />
    {needsMediaFallback && <MediaPreview report={report} media={report._media[0]} mediaUrl={report.metadata.mediaUrl} />}
  </>;
}

export default function CommentPostPreviews({ text }: { text: string }) {
  return <>{commentPostUrls(text).map((url) => <CommentPostPreview key={url} url={url} />)}</>;
}
