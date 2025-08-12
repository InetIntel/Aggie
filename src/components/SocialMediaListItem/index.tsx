import {
  faXmark,
  faExclamationTriangle,
  faRetweet,
  faDotCircle,
  faImages,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { isString } from "lodash";
import { Report } from "../../api/reports/types";
import { formatText } from "../../utils/format";
import AggieToken from "../AggieToken";
import DateTime from "../DateTime";
import {
  parseContentType,
  sanitize,
  signalToNameColor
} from "../SocialMediaPost/reportParser";
import SocialMediaIcon from "../SocialMediaPost/SocialMediaIcon";
import { parseQuoteRetweet, tweetImages } from "../SocialMediaPost/TwitterPost";
import { parseYoutube } from "../SocialMediaPost/YoutubePost";
import TagsList from "../Tags/TagsList";

interface IProps {
  report: Report;
  header?: React.ReactNode;
  headerClassName?: string;
}

const SocialMediaListItem = ({ report, header, headerClassName }: IProps) => {
  const contentType = parseContentType(report);
  const { imagePreview, imagesCount } = renderImage(contentType, report);
  const [signal, bgColor] = signalToNameColor(report?.metadata?.rawAPIResponse?.rawEvent?.datasource);

  const imageUrl = isString(imagePreview) ? imagePreview : imagePreview?.url;
  return (
    <>
      <header className='flex justify-between mb-2 relative'>
        <div
          className={`flex flex-wrap gap-1 text-xs items-center ${headerClassName}`}
        >
          <span className='text-slate-600'>
            <SocialMediaIcon mediaKey={report._media[0]} />
          </span>
          <h1 className='text-sm text-black font-medium'>
            {renderAuthor(contentType, report)}
          </h1>
          {signal && (
            <AggieToken className={`${bgColor} font-medium px-1 rounded-lg text-sm text-white`}>
              {signal}
            </AggieToken>
          )}
          {report.irrelevant && report.irrelevant === "true" && (
            <AggieToken variant='light:red' icon={faXmark} className='text-xs'>
              Ignore
            </AggieToken>
          )}
          {report.irrelevant && report.irrelevant === "false" && (
            <AggieToken
              variant='light:green'
              icon={faDotCircle}
              className='text-xs'
            >
              Investigate
            </AggieToken>
          )}
        </div>
        {header || (
          <div className='text-xs '>
            <DateTime dateString={report.authoredAt} />
          </div>
        )}
      </header>
      <div className='flex gap-1 justify-between'>
        <div className='flex gap-2 flex-1 max-w-prose'>
          {renderText(contentType, report)}
        </div>
        {imagePreview && (
          <div className='w-24 h-24 flex-0 justify-self-end relative'>
            <img
              loading='lazy'
              src={imageUrl}
              className='w-full rounded h-full object-cover bg-slate-100 border border-slate-200 '
              alt='image preview'
            />
            <p className='absolute bottom-1 right-1 px-1 rounded-sm bg-black/75 text-xs text-white'>
              <FontAwesomeIcon icon={faImages} /> {imagesCount}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default SocialMediaListItem;

function twitterParsing(report: Report) {
  const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
    ?.post_data;

  const data = parseQuoteRetweet(rawPostData);

  return data;
}

function renderAuthor(
  type: ReturnType<typeof parseContentType>,
  report: Report
) {
  switch (type) {
    case "ioda":
      return "IODA";
    case "cloudflare":
      return report?.metadata?.rawAPIResponse?.dataSource;
    default:
      return report.author;
  }
}
function renderImage(
  type: ReturnType<typeof parseContentType>,
  report: Report
) {
  if (type.includes("twitter")) {
    const results = tweetImages(
      (report.metadata.rawAPIResponse.attributes as any)?.post_data
    );
    if (results && results.length > 0) {
      const imagePreview = results[0].url;
      return { imagePreview, imagesCount: 1 };
    }
    const { imagePreview, imagesCount } = twitterParsing(report);
    return { imagePreview, imagesCount };
  }
  if (type.includes("youtube")) {
    const imagePreview = (report.metadata?.rawAPIResponse?.attributes as any)
      ?.thumbnail_url;
    const imagesCount = imagePreview ? 1 : 0;
    return { imagePreview, imagesCount };
  }
  const imagePreview = report.metadata?.mediaUrl;
  const imagesCount = imagePreview ? 1 : 0;
  return { imagePreview, imagesCount };
}
function renderText(type: ReturnType<typeof parseContentType>, report: Report) {
  switch (type) {
    case "twitter:quoteRetweet": {
      const data = twitterParsing(report);

      return (
        <>
          <div className='grid place-items-center text-slate-600'>
            <FontAwesomeIcon icon={faRetweet} />
          </div>
          <div className=' max-h-[10em] text-black'>
            <p className='font-medium text-sm'>{data.author?.name}</p>
            <p className='text-black line-clamp-2 mb-1'>
              {formatText(data.content)}
            </p>

            <div className='border border-slate-300 rounded-lg py-2 px-3 '>
              <p className='font-medium text-sm'>
                {data.innerPost.author?.name}
              </p>
              <p className='line-clamp-2'>
                {formatText(data.innerPost.content)}
              </p>
            </div>
          </div>
        </>
      );
    }
    case "twitter:retweet":
      twitterParsing(report);

      return (
        <>
          <div className='grid place-items-center text-slate-600'>
            <FontAwesomeIcon icon={faRetweet} />
          </div>
          <p className=' text-black max-h-[10em] line-clamp-4'>
            {formatText(report.content)}
          </p>
        </>
      );
    case "twitter:quote": {
      const data = twitterParsing(report);

      return (
        <>
          <div className=' max-h-[10em] text-black'>
            <p className='text-black line-clamp-2 mb-1'>
              {formatText(report.content)}
            </p>

            <div className='border border-slate-300 rounded-lg py-2 px-3 '>
              <p className='font-medium text-sm'>{data.author?.name}</p>
              <p className='line-clamp-2'>{formatText(data.content)}</p>
            </div>
          </div>
        </>
      );
    }
    case "twitter":
      twitterParsing(report);
      return (
        <p className=' text-black max-h-[10em] line-clamp-4'>
          {formatText(report.content)}
        </p>
      );

    // case "truthsocial":
    //   return (
    //     <p
    //       className='truthsocial text-black line-clamp-4'
    //       dangerouslySetInnerHTML={{
    //         __html: sanitize(report.content),
    //       }}
    //     ></p>
    //   );
    // case "youtube":
    //   const { title, description } = parseYoutube(report);
    //   return (
    //     <p className=' text-black max-h-[10em] line-clamp-4'>
    //       <span className=''>{title} </span>
    //     </p>
    //   );
    // case "RSS":
    //   const rawData = report?.metadata?.rawAPIResponse as any;
    //   return (
    //     <div>
    //       {rawData?.title && (
    //         <p className='text-black font-medium'>{rawData?.title}</p>
    //       )}
    //       <p className=' text-black max-h-[10em] line-clamp-2'>
    //         {formatText(report.content)}
    //       </p>
    //     </div>
    //   );
    case "ioda":
      const rawStart = report?.metadata?.rawAPIResponse?.rawEvent?.start;
      const start = new Date(rawStart * 1000); // Convert to milliseconds
      const startUtc =
        start.toISOString().replace('T', ' ').substring(0, 16);
      const rawDuration = report?.metadata?.rawAPIResponse?.rawEvent?.duration;
      const end = new Date((rawStart + rawDuration) * 1000);
      const endUtc =
        end.toISOString().replace('T', ' ').substring(0, 16);
      return (
        <p>
          {report?.author}<br />
          {startUtc} to {
            (startUtc.substring(0, 10) === endUtc.substring(0, 10)) ?
            endUtc.substring(11) : endUtc
          }
        </p>
      );
    case "cloudflare":
      const endDate = 
        report?.metadata?.rawAPIResponse?.rawEvent?.endDate || "now";
      return (
        <p>
          {report?.author}<br />
          {
            report?.authoredAt.replace('T', ' ').substring(0, 16)
          } to {endDate.replace('T', ' ').substring(0, 16)}
        </p>
      );
    default:
      return (
        <p className=' text-black max-h-[10em] line-clamp-4'>
          {formatText(report.content)}
        </p>
      );
  }
}
