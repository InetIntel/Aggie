/**
 * parsing the mess of metadata that we get from various sources.
 * this is a very trial-and-error process.
 * would love to refactor this into something that makes more sense
 */
import { Report } from "../../api/reports/types";
//import sanitizeHtml from "sanitize-html";

//  default means i dont have a specialized parser for this

export function parseContentType(report: Report) {
  if (!report._media) return "default";

  // if (report._media[0] === "twitter") {
  //   // some goofy coding practices going on here
  //   const type = tweetType(report);
  //   return type;
  // }

  return report._media[0];
}

export type ContentType = ReturnType<typeof parseContentType>;

export const isQuoteRetweet = (report: Report) =>
  !!(report.metadata.rawAPIResponse.attributes as any)?.post_data?.api_data
    ?.quoted_status_result?.result;

export const tweetType = (report: Report) => {
  if (report.metadata.rawAPIResponse.tweetID) return "twitter:keywordSearch";
  const post_data = (report.metadata.rawAPIResponse.attributes as any)
    ?.post_data;

  if (post_data?.api_data?.quoted_status_result) return "twitter:quote";
  if (post_data?.retweeted_status_result) {
    if (post_data?.retweeted_status_result?.result?.quoted_status_result)
      return "twitter:quoteRetweet";
    return "twitter:retweet";
  }
  return "twitter";
};

export const isRetweet = (report: Report) =>
  !!(report.metadata.rawAPIResponse.attributes as any)?.post_data
    .retweeted_status_result?.result;

export function isTwitterReply(report: Report) {
  const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
    ?.post_data;
  const name = rawPostData?.in_reply_to_screen_name;
  const id = rawPostData?.in_reply_to_status_id_str;
  return {
    author: name,
    url: !!name && !!id ? `https://x.com/${name}/status/${id}` : undefined,
  };
}

// export function getTweetImages(report: Report) {
//   const rawPostData = (report.metadata.rawAPIResponse.attributes as any)
//     ?.search_data_fields;

//   const images = rawPostData?.media_data?.map((imgData: any) => {
//     return imgData.thumb_url + "?format=jpg&name=medium";
//   });
//   return images as string[];
// }

// temporary, should be done server-side
export function sanitize(string: string) {
  return string;
  // return sanitizeHtml(string, {
  //   allowedAttributes: {
  //     ...sanitizeHtml.defaults.allowedAttributes,
  //     span: ["class"],
  //   },
  //});
}
