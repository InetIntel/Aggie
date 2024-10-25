import {
  faXmark,
  faExclamationTriangle,
  faRetweet,
  faDotCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Report } from "../../api/reports/types";
import { formatText } from "../../utils/format";
import AggieToken from "../AggieToken";
import DateTime from "../DateTime";
import GeneratedTagsList from "../GeneratedTagsList";
import { parseContentType, sanitize } from "../SocialMediaPost/reportParser";
import SocialMediaIcon from "../SocialMediaPost/SocialMediaIcon";
import { parseQuoteRetweet } from "../SocialMediaPost/TwitterPost";
import { parseYoutube } from "../SocialMediaPost/YoutubePost";
import TagsList from "../Tags/TagsList";
interface IProps {
  report: Report;
  header?: React.ReactNode;
  headerClassName?: string;
}

const SocialMediaListItem = ({ report, header, headerClassName }: IProps) => {
  const contentType = parseContentType(report);

  function renderText(type: typeof contentType) {
    switch (type) {
      case "twitter:quoteRetweet": {
        const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
          ?.post_data;
        const data = parseQuoteRetweet(rawPostData);

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
        const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
          ?.post_data;
        const data = parseQuoteRetweet(rawPostData);

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
      case "truthsocial":
        return (
          <p
            className='truthsocial text-black line-clamp-4'
            dangerouslySetInnerHTML={{
              __html: sanitize(report.content),
            }}
          ></p>
        );
      case "youtube":
        const { title, description } = parseYoutube(report);
        return (
          <p className=' text-black max-h-[10em] line-clamp-4'>
            <span className=''>{title} </span>
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

  return (
    <>
      <header className='flex justify-between mb-2 relative'>
        <div
          className={`flex flex-wrap gap-1 text-sm items-baseline ${headerClassName}`}
        >
          <h1 className={`text-sm text-black mx-1 font-medium `}>
            <span className='mr-2 text-slate-600 text-xs'>
              <SocialMediaIcon mediaKey={report._media[0]} />
            </span>
            {report.author}
          </h1>

          {report.irrelevant && report.irrelevant === "true" && (
            <AggieToken variant='light:red' icon={faXmark} className='text-xs'>
              Irrelevant
            </AggieToken>
          )}
          {report.irrelevant && report.irrelevant === "false" && (
            <AggieToken
              variant='light:green'
              icon={faDotCircle}
              className='text-xs'
            >
              Relevant
            </AggieToken>
          )}
          {report.red_flag && (
            <AggieToken
              variant='dark:red'
              icon={faExclamationTriangle}
              className='text-xs'
            >
              Red Flag
            </AggieToken>
          )}
          <GeneratedTagsList tags={report.aitags} report={report} />
          <TagsList values={report.smtcTags} />
        </div>
        {header || (
          <div className='text-xs '>
            <DateTime dateString={report.authoredAt} />
          </div>
        )}
      </header>
      <div className='flex gap-2 max-w-prose'>{renderText(contentType)}</div>
    </>
  );
};

export default SocialMediaListItem;
