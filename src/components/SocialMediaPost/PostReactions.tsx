import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faBookmark,
  faComment,
  faEye,
  faHeart,
  faPlay,
  faRetweet,
  faShare,
  faStar,
  faThumbsDown,
  faThumbsUp,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { MediaOptions } from "../../api/common";
import type {
  FacebookStatistics,
  Statistics,
  TiktokStatistics,
  TwitterStatistics,
  YoutubeStatistics,
} from "../../api/reports/types";

interface IProps {
  stats: Statistics;
  media: MediaOptions | undefined;
}

const PostReactions = ({ stats, media }: IProps) => {
  // helper component that show/hides values
  const Reaction = (props: {
    icon: IconProp;
    value: string | number | undefined | null;
    hideZero?: boolean;
  }) => {
    if (props.value === undefined || props.value === null) return <></>;
    if (!!props.hideZero && (props.value === 0 || props.value === "0"))
      return <></>;
    return (
      <span className='flex gap-1 items-center'>
        <FontAwesomeIcon icon={props.icon} />{" "}
        {Number(props.value).toLocaleString()}
      </span>
    );
  };

  switch (media) {
    // case "twitter": {
    //   // type narrowing isnt working, so this is a workaround.
    //   //TODO: fix type narrowing
    //   const twitterStats = stats as TwitterStatistics;
    //   return (
    //     <>
    //       <Reaction icon={faHeart} value={twitterStats.like_count} />
    //       <Reaction icon={faComment} value={twitterStats.reply_count} />
    //       <Reaction icon={faRetweet} value={twitterStats.retweet_count} />
    //       <Reaction icon={faEye} value={twitterStats.view_count} />
    //     </>
    //   );
    // }
    // case "facebook": {
    //   const facebook = stats as FacebookStatistics;

    //   return (
    //     <>
    //       <span className=' bg-slate-200 rounded-full px-2'>
    //         {facebook.angryCount +
    //           facebook.careCount +
    //           facebook.hahaCount +
    //           facebook.likeCount +
    //           facebook.sadCount +
    //           facebook.loveCount +
    //           facebook.thankfulCount +
    //           facebook.wowCount}{" "}
    //         Reactions
    //       </span>
    //       <Reaction icon={faComment} value={facebook.commentCount} />
    //       <Reaction icon={faShare} value={facebook.shareCount} />
    //     </>
    //   );
    // }
    // case "tiktok": {
    //   const tiktok = stats as TiktokStatistics;

    //   return (
    //     <>
    //       <Reaction icon={faPlay} value={tiktok.playCount} />
    //       <Reaction icon={faComment} value={tiktok.commentCount} />
    //       <Reaction icon={faShare} value={tiktok.shareCount} />
    //       <Reaction icon={faRetweet} value={tiktok.repostCount} />
    //       <Reaction icon={faBookmark} value={tiktok.collectCount} />
    //     </>
    //   );
    // }
    // case "youtube": {
    //   const youtube = stats as YoutubeStatistics;

    //   return (
    //     <>
    //       <Reaction icon={faThumbsUp} value={youtube.like_count} />
    //       <Reaction icon={faThumbsDown} value={youtube.dislike_count} />
    //       <Reaction icon={faComment} value={youtube.comment_count} />
    //       <Reaction icon={faEye} value={youtube.view_count} />
    //       <Reaction icon={faStar} value={youtube.favorite_count} />
    //     </>
    //   );
    // }
    default:
      return <></>;
  }
};

export default PostReactions;
