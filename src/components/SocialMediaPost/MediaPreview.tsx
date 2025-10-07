import { useState } from "react";
import { MediaOptions } from "../../api/common";
import { Report } from "../../api/reports/types";

interface IProps {
  mediaUrl: string;
  media: MediaOptions;
  report: Report;
}
const MediaPreview = ({ mediaUrl, media, report }: IProps) => {
  const [loaded, setLoaded] = useState(false);

  switch (media) {
    default:
      if (!mediaUrl) return <></>;

      return (
        <div className='min-h-[30vh] relative'>
          {!loaded && (
            <div className='absolute inset-0 z-10 rounded bg-slate-50 dark:bg-gray-900 grid place-items-center'>
              Loading Image...
            </div>
          )}
          <img
            className='w-full h-auto rounded'
            src={mediaUrl}
            onLoad={() => setLoaded(true)}
          />
        </div>
      );
  }
};
export default MediaPreview;
