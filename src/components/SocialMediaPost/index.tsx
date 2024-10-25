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

interface IProps {
  report: Report;
  showMedia?: boolean;
}
const SocialMediaPost = ({ report, showMedia }: IProps) => {
  const contentType = parseContentType(report);

  const TwitterReply = (props: { report: Report }) => {
    const { report } = props;

    const { author, url } = isTwitterReply(report);
    if (!author || !url) return <></>;

    return (
      <div className=''>
        <p className='text-xs text-slate-600 italic'>
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
    <div className='pb-2 px-3 pt-3 bg-white rounded-xl border border-slate-300 text-base '>
      {report._media[0] === "twitter" && <TwitterReply report={report} />}
      <div className='flex justify-between mb-2'>
        {/* <TagsList values={report.smtcTags} /> */}
        <div className=' font-medium  '>
          <SocialMediaAuthor
            username={report.metadata.accountHandle}
            createdAt={report.authoredAt}
            url={report.metadata.accountUrl}
          />
        </div>
        <p className='flex items-center gap-2 h-fit pr-1'>
          <a
            target='_blank'
            href={report.url}
            className='ml-1 px-2 py-1 rounded-full border border-slate-200 font-medium text-xs inline-flex gap-1 items-center bg-slate-100 hover:bg-white text-nowrap'
          >
            <span>Open Post</span>
            <FontAwesomeIcon icon={faExternalLink} />
          </a>
          <div className='text-slate-600'>
            <SocialMediaIcon mediaKey={report._media[0]} />
          </div>
        </p>
      </div>

      {contentType.includes("twitter") && <TwitterPost report={report} />}
      {contentType === "youtube" && <YoutubePost report={report} />}
      {contentType === "truthsocial" && <TruthSocialPost report={report} />}
      {contentType === "default" && (
        <>
          <div className='whitespace-pre-wrap mb-1 break-all '>
            <Linkify
              options={{
                target: "_blank",
                className: "underline text-blue-600 hover:bg-slate-100 ",
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
      )}

      <div className='flex justify-between'>
        <div className='flex gap-3 text-sm text-slate-500 font-medium mt-1 items-center'>
          <PostReactions
            stats={report.metadata.actualStatistics}
            media={report._media[0]}
          />
        </div>
        <p className='text-xs text-slate-600 text-right'>
          posted: <br />
          <DateTime dateString={report.authoredAt} />
        </p>
      </div>
    </div>
  );
};

export default SocialMediaPost;
