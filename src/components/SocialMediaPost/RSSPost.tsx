import { isObject, isString } from "lodash";
import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}
const RSSPost = ({ report }: IProps) => {
  function renderCategories(item: any) {
    if (isString(item)) return item;
    if (isObject(item)) {
      const category = (item as any)._;
      if (category) return category;
      else return "";
    }
    return "";
  }

  function renderContent(raw: any) {
    if ("content:encoded" in raw) return raw["content:encoded"];
    if ("content" in raw) return raw["content"];
    return report.content;
  }

  const rawData = report?.metadata?.rawAPIResponse as any;
  const content = renderContent(rawData);
  return (
    <>
      <h2 className='font-medium'>{rawData?.title}</h2>
      <p className=' mb-1'>By {report.author}</p>
      <p className='flex gap-2 flex-wrap text-sm text-slate-700 mb-1'>
        Categories:{" "}
        {rawData?.categories?.map((i: string, index: number) => (
          <span key={index} className='text-slate-800 font-medium bg-slate-100'>
            {renderCategories(i)}
          </span>
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
