import type { Report } from "../../../api/reports/types";

export const reportAuthorUrl = (report: Report) => {
  if (report.metadata.accountUrl) {
    return report.metadata.accountUrl;
  } else {
    // Twitter
    return "https://twitter.com/" + report.author;
  }
};
