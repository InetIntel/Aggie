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
  const displayImages =
    images.length > 0
      ? images
      : mediaUrl
        ? [{ fullUrl: mediaUrl, previewUrl: mediaUrl }]
        : [];

  switch (media) {
    default:
      if (displayImages.length === 0) return <></>;

      const visibleImages = displayImages.slice(0, 4);
      const hiddenImagesCount = displayImages.length - visibleImages.length;

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
          {visibleImages.map((image, index) => {
            const isOverflowTile =
              hiddenImagesCount > 0 && index === visibleImages.length - 1;

            return (
              <div
                key={`${image.fullUrl}-${index}`}
                className={`relative overflow-hidden rounded ${formatImage(
                  index,
                  visibleImages.length
                )}`}
              >
                <img
                  className='h-full w-full object-cover'
                  src={image.previewUrl}
                  loading='lazy'
                  alt={`Post attachment ${index + 1}`}
                  onLoad={() => setLoaded(true)}
                />
                {isOverflowTile && (
                  <div className='absolute inset-0 grid place-items-center bg-black/55 text-lg font-medium text-white'>
                    +{hiddenImagesCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
  }
};
export default MediaPreview;
