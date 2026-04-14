import { useState } from "react";
import { MediaOptions } from "../../api/common";
import { Report } from "../../api/reports/types";
import { getReportImages } from "./mediaAttachments";

interface IProps {
  mediaUrl: string | null;
  media: MediaOptions;
  report: Report;
}
const MediaPreview = ({ mediaUrl, media, report }: IProps) => {
  const [loaded, setLoaded] = useState(false);
  const images = getReportImages(report);

  switch (media) {
    default:
      if (!mediaUrl && images.length === 0) return <></>;

      const formatImage = (index: number, total: number) => {
        if (total === 1) return "h-auto col-span-2 max-h-[60vh]";
        if (total === 3 && index === 0) return "h-full row-span-2 col-span-1";
        return "h-full max-h-[60vh]";
      };

      return (
        <div className='min-h-[30vh] relative grid grid-cols-2 gap-1'>
          {!loaded && (
            <div className='absolute inset-0 z-10 rounded bg-slate-50 dark:bg-gray-900 grid place-items-center'>
              Loading Image...
            </div>
          )}
          {images.map((image, index) => (
            <img
              key={image.fullUrl}
              className={`w-full rounded object-cover ${formatImage(
                index,
                images.length
              )}`}
              src={image.fullUrl}
              loading='lazy'
              onLoad={() => setLoaded(true)}
            />
          ))}
        </div>
      );
  }
};
export default MediaPreview;
