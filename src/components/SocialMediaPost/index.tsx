import Linkify from "linkify-react";
import { Report } from "../../api/reports/types";
import { formatText } from "../../utils/format";
import PostReactions from "./PostReactions";
import MediaPreview from "./MediaPreview";

import DateTime from "../DateTime";

import { parseContentType, isTwitterReply, sanitize } from "./reportParser";

import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import TwitterPost from "./TwitterPost";
import YoutubePost from "./YoutubePost";
import SocialMediaAuthor from "./SocialMediaAuthor";
import TruthSocialPost from "./TruthSocialPost";
import SocialMediaIcon from "./SocialMediaIcon";
import RSSPost from "./RSSPost";
import TwitterKWSearchPost from "./TwitterKWSearchPost";
import IodaEvent from "./IodaEvent";
import TrafficEvent from "./TrafficEvent";

interface IProps {
  report: Report;
  showMedia?: boolean;
  /**
   * Compact mode for fixed-height contexts (compare grid): the card fills its
   * container, charts scale down, and overflowing body content scrolls inside
   * the card instead of growing it.
   */
  compact?: boolean;
}
const SocialMediaPost = ({ report, showMedia, compact }: IProps) => {
  const contentType = parseContentType(report);
  function renderAuthor(type: typeof contentType) {
    switch (type) {
      // case "RSS":
      //   const website = new URL(report.url);
      //   return (
      //     <SocialMediaAuthor
      //       username={website.host}
      //       createdAt={report.authoredAt}
      //       url={report.metadata.accountUrl}
      //     />
      //   );
      default:
        return (
          <>
            <SocialMediaAuthor
              username={report.metadata.accountHandle || report.author}
              createdAt={report.authoredAt}
              url={report.metadata.accountUrl}
            />
          </>
        );
    }
  }
  function renderPost(type: typeof contentType) {
    switch (type) {
      // case "twitter":
      // case "twitter:quote":
      // case "twitter:quoteRetweet":
      // case "twitter:retweet":
      //   return <TwitterPost report={report} />;
      // case "twitter:keywordSearch":
      //   return <TwitterKWSearchPost report={report} />;
      // case "RSS":
      //   return <RSSPost report={report} />;
      // case "truthsocial":
      //   return <TruthSocialPost report={report} />;
      // case "youtube":
      //   return <YoutubePost report={report} />;
      case "ioda":
        return <IodaEvent report={report} compact={compact} />;
      case "cloudflare":
        return <TrafficEvent report={report} compact={compact} />;
      default:
        return (
          <>
            <div className='whitespace-pre-wrap mb-1 break-all '>
              <Linkify
                options={{
                  target: "_blank",
                  className: "underline text-blue-600 hover:bg-slate-100 dark:hover:bg-gray-700",
                }}
              >
                {formatText(report.content)}
              </Linkify>
            </div>
            {showMedia && (
              <MediaPreview
                mediaUrl={report.metadata.mediaUrl}
                media={report._media[0]}
                report={report}
              />
            )}
          </>
        );
    }
  }
  const TwitterReply = (props: { report: Report }) => {
    const { report } = props;

    const { author, url } = isTwitterReply(report);
    if (!author || !url) return <></>;

    return (
      <div className=''>
        <p className='text-xs text-slate-600 dark:text-gray-400 italic'>
          Replying to {author}'s{" "}
          <a href={url} className='underline' target='_blank'>
            post
          </a>
        </p>
        <div className='border-l-2 border-slate-400 ml-3 h-6 my-1'></div>
      </div>
    );
  };
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-slate-300 dark:bg-gray-800 ${
        compact
          ? "pb-1.5 px-2 pt-2 h-full min-h-0 flex flex-col overflow-hidden text-xs"
          : "pb-2 px-3 pt-3"
      }`}
    >
      {/* {report._media[0] === "twitter" && <TwitterReply report={report} />} */}
      <div className={`flex justify-between ${compact ? "mb-1" : "mb-2"}`}>
        {/* <TagsList values={report.smtcTags} /> */}
        <div className={`font-medium ${compact ? "[&_p]:text-xs" : ""}`}>
          {renderAuthor(contentType)}
        </div>
        <div className='flex items-center gap-2 h-fit pr-1'>
          {!!report.url && (
            <a
              target='_blank'
              href={report.url}
              className='ml-1 px-2 py-1 rounded-full border border-slate-200 font-medium text-xs inline-flex gap-1 items-center bg-slate-100 dark:bg-gray-700 hover:bg-white dark:hover:bg-gray-800 text-nowrap '
            >
              <span>Open Post</span>
              <FontAwesomeIcon icon={faExternalLink} />
            </a>
          )}
          <p className='text-slate-600 dark:text-gray-400'>
            <SocialMediaIcon mediaKey={report._media[0]} />
          </p>
        </div>
      </div>
      {compact ? (
        <div className='flex-1 min-h-0 overflow-y-auto'>
          {renderPost(contentType)}
        </div>
      ) : (
        renderPost(contentType)
      )}

      <div className='flex justify-between'>
        <div
          className={`flex gap-3 text-slate-500 dark:text-gray-400 font-medium mt-1 items-center ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          <PostReactions
            stats={report.metadata.actualStatistics}
            media={report._media[0]}
          />
        </div>
        <p className='text-xs text-slate-600 dark:text-gray-400 text-right'>
          updated: <br />
          <DateTime dateString={report.fetchedAt} />
        </p>
      </div>
    </div>
  );
};

export default SocialMediaPost;
