import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}
const RSSPost = ({ report }: IProps) => {
  const rawData = report.metadata.rawAPIResponse as any;
  const content =
    "content:encoded" in rawData ? rawData["content:encoded"] : report.content;
  return (
    <>
      <h2 className='font-medium'>{rawData?.title}</h2>
      <p className=' mb-1'>By {report.author}</p>
      <p className='flex gap-2 flex-wrap text-sm text-slate-700 mb-1'>
        Categories:{" "}
        {rawData?.categories?.map((i: string) => (
          <span className='text-slate-800 font-medium bg-slate-100'>{i}</span>
        ))}
      </p>
      <div
        className='whitespace-pre-line mb-1 rsspost'
        dangerouslySetInnerHTML={{ __html: content }}
      ></div>
    </>
  );
};

export default RSSPost;
