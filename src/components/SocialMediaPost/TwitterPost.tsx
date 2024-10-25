import { Report, TwitterStatistics } from "../../api/reports/types";
import { formatText } from "../../utils/format";
import DateTime from "../DateTime";
import PostReactions from "./PostReactions";
import Linkify from "linkify-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRetweet } from "@fortawesome/free-solid-svg-icons";
import SocialMediaAuthor from "./SocialMediaAuthor";
import { tweetType } from "./reportParser";

// ----------- component
interface IProps {
  report: Report;
}
const TwitterPost = ({ report }: IProps) => {
  const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
    ?.post_data;

  const type = tweetType(report);
  const innerData = parseQuoteRetweet(rawPostData);

  interface basetweetProps {
    content: string;
    id: string;
    cardData: ReturnType<typeof LinkCard>;
    images: ReturnType<typeof tweetImages>;
  }
  const BaseTweet = ({ content, id, images, cardData }: basetweetProps) => {
    return (
      <>
        <div className='whitespace-pre-line  my-2'>
          <Linkify
            key={id}
            options={{
              target: "_blank",
              className: "underline text-blue-600 hover:bg-slate-100 ",
            }}
          >
            {formatText(content)}
          </Linkify>
        </div>
        {RenderImages(images)}
        {RenderCard(cardData)}
      </>
    );
  };

  const RenderImages = (images: ReturnType<typeof tweetImages>) => {
    function formatTwitter(index: number, total: number) {
      if (total === 1) return "h-auto col-span-2 max-h-[60vh]";
      if (total === 3 && index === 0) return "h-full row-span-2 col-span-1";
      return "h-full";
    }
    if (!images || images.length === 0) return <></>;

    return (
      <div className='min-h-[30vh] relative grid grid-cols-2 gap-1'>
        {images.map((image, index: number) => (
          <img
            key={index}
            className={`w-full rounded object-cover ${formatTwitter(
              index,
              images.length
            )}`}
            src={image.url}
            loading='lazy'
          />
        ))}
      </div>
    );
  };
  const RenderCard = (cardData: ReturnType<typeof LinkCard>) => {
    if (!cardData) return <></>;

    const { title, image, description, url } = cardData;

    return (
      <a target={"_blank"} href={url}>
        <div className='flex text-sm gap-2 p-1 border border-slate-200 rounded hover:bg-slate-50'>
          <img
            src={image}
            className='object-cover w-32 ratio-video rounded-sm'
          />
          <div>
            <p className='font-medium line-clamp-2 mb-1'>{title}</p>
            <p className=' line-clamp-2'>{description}</p>
            <p className='text-slate-800 mt-1 line-clamp-1'>{url}</p>
          </div>
        </div>
      </a>
    );
  };
  const QuoteRetweetContent = ({
    author,
    authoredAt,
    content,
    statistics,
    images,
    cardData,
    innerPost,
  }: ReturnType<typeof dataFromInnerPost>) => {
    return (
      <>
        <div className='border border-slate-300 py-2 px-2 rounded-lg'>
          <SocialMediaAuthor
            username={author?.username}
            createdAt={authoredAt}
          />

          <div className='whitespace-pre-line my-2'>
            <BaseTweet
              content={content}
              id={report._id + "_quote"}
              images={images}
              cardData={cardData}
            />
          </div>
          {innerPost && <QuoteRetweetContent {...innerPost} />}
          <div className='flex gap-3 text-sm text-slate-500 font-medium mt-1 items-center'>
            <PostReactions stats={statistics} media={report._media[0]} />
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {(type === "twitter:retweet" || type === "twitter:quoteRetweet") && (
        <>
          <p className='text-sm text-slate-600'>
            <FontAwesomeIcon icon={faRetweet} /> Retweeted:
          </p>
          <QuoteRetweetContent {...innerData} />
        </>
      )}
      {type === "twitter:quote" && (
        <>
          <BaseTweet
            content={report.content}
            id={report._id}
            cardData={LinkCard(rawPostData)}
            images={tweetImages(rawPostData)}
          />
          <QuoteRetweetContent {...innerData} />
        </>
      )}
      {type === "twitter" && (
        <BaseTweet
          content={report.content}
          id={report._id}
          cardData={LinkCard(rawPostData)}
          images={tweetImages(rawPostData)}
        />
      )}
    </>
  );
};

export default TwitterPost;

// ---- twitter post parsing
function parseTwitterUser(rawPostData: any) {
  const userData = rawPostData?.core?.user_results?.result;
  if (!userData) return undefined;
  return {
    name: userData?.legacy.name,
    username: userData?.legacy.screen_name,
    followers: userData?.legacy.followers_count,
    url: userData?.legacy.url,
    createdAt: userData?.legacy.created_at,
    pfp: userData?.legacy.profile_image_url_https,
    verified: userData.is_blue_verified,
  };
}

export function parseQuoteRetweet(post_data: any) {
  const retweetResult = post_data?.retweeted_status_result?.result;
  const quotedResult = post_data?.api_data?.quoted_status_result?.result;
  const result = retweetResult || quotedResult;

  return dataFromInnerPost(result);
}

function dataFromInnerPost(result: any) {
  const images = tweetImages(result?.legacy);
  const cardData = LinkCard(result?.legacy);
  const innerAuthor = parseTwitterUser(result);

  // retweets can be quote tweets
  const innerQuoteResult = result?.quoted_status_result?.result;
  const innerPost: any = !!innerQuoteResult
    ? dataFromInnerPost(innerQuoteResult)
    : undefined;

  const statistics: TwitterStatistics = {
    reply_count: result?.legacy?.reply_count,
    retweet_count: result?.legacy?.retweet_count + result?.legacy?.quote_count,
    like_count: result?.legacy?.favorite_count,
    view_count: result?.views?.count,
  };

  return {
    author: innerAuthor,
    authoredAt: result?.legacy?.created_at,
    content: result?.legacy?.full_text,
    statistics,
    images,
    cardData,
    innerPost,
  };
}

function LinkCard(post_data: any) {
  const card =
    (post_data?.card?.binding_values as any[]) ||
    (post_data?.card?.legacy?.binding_values as any[]);
  if (!card || card.length === 0) return;
  return {
    title: card.find((i) => i.key === "title")?.value?.string_value,
    image: card.find(
      (i) => i.key === "thumbnail_image" || i.key === "player_image"
    )?.value.image_value?.url,
    description: card.find((i) => i.key === "description")?.value?.string_value,
    url: card.find((i) => i.key === "card_url")?.value?.string_value,
  };
}
function tweetImages(post_data: any) {
  const media = post_data?.entities?.media as unknown[];
  if (!media || media.length === 0) return undefined;
  const result = media.map((item: any) => {
    return {
      type: item.type,
      url: item.media_url_https + "?format=jpg&name=medium",
    };
  });
  return result;
}
