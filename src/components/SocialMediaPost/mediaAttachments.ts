import { Report, SocialAttachment } from "../../api/reports/types";

export interface ReportImage {
  fullUrl: string;
  previewUrl: string;
}

function isImageAttachment(
  attachment: SocialAttachment | undefined
): attachment is SocialAttachment {
  return attachment?.type === "image" && !!(attachment.imageUrl || attachment.thumbnailUrl);
}

export function getReportImages(report: Report): ReportImage[] {
  const attachments = report.metadata?.attachments;

  if (Array.isArray(attachments) && attachments.length > 0) {
    return attachments
      .filter(isImageAttachment)
      .map((attachment) => {
        const fullUrl = attachment.imageUrl || attachment.thumbnailUrl || "";
        const previewUrl = attachment.thumbnailUrl || attachment.imageUrl || "";

        return {
          fullUrl,
          previewUrl,
        };
      })
      .filter((image) => !!image.fullUrl && !!image.previewUrl);
  }

  if (report.metadata?.mediaUrl) {
    return [
      {
        fullUrl: report.metadata.mediaUrl,
        previewUrl: report.metadata.mediaUrl,
      },
    ];
  }

  return [];
}
