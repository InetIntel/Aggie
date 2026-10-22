import { Report } from "../../api/reports/types";
import MediaPreview from "./MediaPreview";
import { detectTextDirection } from "../../utils/format";

interface IProps {
  report: Report;
}
const TruthSocialPost = ({ report }: IProps) => {
  return (
    <>
      <div
        dir={detectTextDirection(report.content)}
        className='whitespace-pre-line mb-1 post-text'
      >
        <p
          className='truthsocial'
          dangerouslySetInnerHTML={{
            __html: report.content,
          }}
        ></p>
      </div>

      <MediaPreview
        mediaUrl={report.metadata.mediaUrl}
        media={report._media[0]}
        report={report}
      />
    </>
  );
};

export default TruthSocialPost;
