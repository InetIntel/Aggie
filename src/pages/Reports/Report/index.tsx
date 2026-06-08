import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";

import { getReport } from "../../../api/reports";
import { useQueryParams } from "../../../hooks/useQueryParams";
import type { ReportQueryState } from "../../../api/reports/types";

import ReportDetail from "./ReportDetail";

const Report = () => {
  const { id } = useParams();
  const { getParam } = useQueryParams<ReportQueryState>();
  const location = useLocation();

  const isBatchMode = getParam("batch") === "true";
  const listQueryKey = isBatchMode
    ? ["batch"]
    : [
        "reports",
        location.pathname.startsWith("/mediaposts") ? "mediaposts" : "alerts",
        location.search.startsWith("?")
          ? location.search.slice(1)
          : location.search,
      ];

  const { data: report, isLoading } = useQuery(["reports", id], () =>
    getReport(id),
  );

  if (isLoading)
    return (
      <span className='pt-4 sticky top-0 font-medium text-center'>
        ...loading
      </span>
    );
  if (!report || !id) return <> error loading page</>;

  return (
    <article className='pt-4 pr-2 sticky top-0 overflow-y-auto min-h-[70vh] max-h-[93vh]'>
      <ReportDetail
        report={report}
        listQueryKey={listQueryKey}
        isBatchMode={isBatchMode}
      />
    </article>
  );
};

export default Report;
