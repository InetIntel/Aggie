// this component is uh... one of the components of all time
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { Report, ReportQueryState } from "../../../api/reports/types";
import { getGroup } from "../../../api/groups";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDotCircle,
  faEnvelope,
  faEnvelopeOpen,
  faExclamationTriangle,
  faMinusCircle,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import DateTime from "../../../components/DateTime";

import AggieButton from "../../../components/AggieButton";
import { useReportMutations } from "../useReportMutations";
import AddReportsToIncidents from "./AddReportsToIncident";
import { useQueryParams } from "../../../hooks/useQueryParams";
import SocialMediaListItem from "../../../components/SocialMediaListItem";
import MultiSelectListItem from "../../../components/MultiSelectListItem";
//TODO: refactor and clean up tech debt
interface IProps {
  report: Report;
  isChecked: boolean;
  isSelectMode: boolean;
  onCheckChange: () => void;
  onOpenReportAttachModal?: () => void;
  setSelection?: (i: Report) => void;
}

const ReportListItem = ({
  report,
  isChecked,
  isSelectMode,
  onCheckChange,
}: IProps) => {
  const { id: currentPageId } = useParams();

  const { getParam } = useQueryParams<ReportQueryState>();

  const isBatchMode = getParam("batch") === "true";

  const { setRead, setIrrelevance } = useReportMutations({
    key: isBatchMode ? ["batch"] : ["reports"],
  });

  const { data: incident } = useQuery(
    ["group", report._group],
    () => getGroup(report._group),
    { enabled: !!report._group }
  );

  const [openAttachModal, setOpenAttachModal] = useState(false);

  // refactor at some point
  function bgState() {
    if (isChecked && !isSelectMode)
      return "border-2 border-slate-300 bg-slate-100 dark:bg-gray-700 rounded-lg";
    else if (isChecked && isSelectMode) return "bg-blue-100 dark:bg-gray-600";
    else if (report.read) return "bg-slate-50 dark:bg-gray-900  hover:bg-slate-100 dark:hover:bg-gray-700 ";
    return "bg-white dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 ";
  }

  return (
    <MultiSelectListItem
      isChecked={isChecked}
      isSelectMode={isSelectMode}
      onCheckChange={onCheckChange}
      className={`px-2 py-2 pb-4 border-b ${bgState()} ${
        currentPageId === report._id ? "ring-2 ring-inset rounded-lg" : ""
      } border-slate-300 text-sm text-slate-600 dark:text-gray-400 relative`}
    >
      <div className='grid grid-cols-5 gap-2 text-slate-700 dark:text-gray-300 text-sm'>
        <div
          className={`col-span-4 pl-7  ${
            report.read ? "" : " border-l-2 border-blue-600 "
          }`}
        >
          <SocialMediaListItem
            headerClassName='max-w-[35em]'
            report={report}
            header={
              <>
                <div className='text-xs group-hover:opacity-0 dark:text-gray-300'>
                  <DateTime dateString={report.authoredAt} />
                </div>
                <div className='flex gap-1 absolute right-0 top-0 text-xs group-hover:opacity-100 opacity-0'>
                  <AggieButton
                    variant={report.read ? "light:lime" : "light:amber"}
                    className='rounded-lg border border-slate-300 shadow-md'
                    onClick={(e) => {
                      e.stopPropagation();

                      setRead.mutate({
                        reportIds: [report._id],
                        read: !report.read,
                        currentPageId: currentPageId,
                      });
                    }}
                    loading={setRead.isLoading}
                    disabled={!report || setRead.isLoading}
                    icon={report.read ? faEnvelopeOpen : faEnvelope}
                  >
                    {report.read ? <> Unread</> : <> Read</>}
                  </AggieButton>
                  <div className='shadow-md rounded-lg border border-slate-300 '>
                    <AggieButton
                      variant={"light:rose"}
                      className='rounded-l-lg'
                      onClick={(e) => {
                        e.stopPropagation();
                        setIrrelevance.mutate({
                          reportIds: [report._id],
                          irrelevant: (report.irrelevant && report.irrelevant === "true") ? "maybe" : "true",
                          currentPageId: currentPageId,
                        });
                      }}
                      icon={faXmark}
                      loading={setIrrelevance.isLoading}
                      disabled={!report || setIrrelevance.isLoading}
                    >
                      Ignore
                    </AggieButton>
                    <AggieButton
                      variant={"light:green"}
                      className='rounded-r-lg'
                      onClick={(e) => {
                        e.stopPropagation();
                        setIrrelevance.mutate({
                          reportIds: [report._id],
                          irrelevant: (report.irrelevant && report.irrelevant === "false") ? "maybe" : "false",
                          currentPageId: currentPageId,
                        });
                      }}
                      icon={faDotCircle}
                      loading={setIrrelevance.isLoading}
                      disabled={!report || setIrrelevance.isLoading}
                    >
                      Investigate
                    </AggieButton>
                  </div>
                </div>
              </>
            }
          />
        </div>

        <div className='flex flex-col '>
          {!!report._group && !!incident ? (
            <Link
              to={`/incidents/${incident._id}`}
              className={`rounded-lg ${
                incident?.closed
                  ? "bg-purple-50 dark:bg-purple-50 dark:saturate-[0.7] text-purple-700 "
                  : "bg-slate-50 dark:bg-gray-900 text-slate-700 dark:text-gray-300 dark:text-gray-300"
              }  px-2 py-1 flex-grow border border-slate-300 hover:cursor-pointer hover:bg-white dark:hover:bg-gray-800`}
              onClick={(e) => e.stopPropagation()}
            >
              <p className='font-medium flex justify-between'>
                <span className='line-clamp-3'>
                  {incident?.title}{" "}
                  {incident?.escalated && (
                    <FontAwesomeIcon
                      icon={faExclamationTriangle}
                      className='text-red-500'
                    />
                  )}{" "}
                  {incident?.closed && (
                    <FontAwesomeIcon
                      icon={faMinusCircle}
                      className='text-purple-500'
                    />
                  )}
                </span>{" "}
                <span>#{incident?.idnum}</span>
              </p>
              <p>{incident._reports.length} Reports</p>
            </Link>
          ) : (
            <AggieButton
              onClick={(e) => {
                e.stopPropagation();
                setOpenAttachModal(true);
              }}
              className='rounded-lg flex-grow flex gap-1 bg-slate-50 dark:bg-gray-900 border border-dashed hover:border-slate-300 border-slate-300 focus-theme hover:bg-white dark:hover:bg-gray-800 justify-center items-center h-full '
              icon={faPlus}
            >
              Add to Incident
            </AggieButton>
          )}
        </div>
        <AddReportsToIncidents
          selection={[report]}
          isOpen={openAttachModal}
          queryKey={[isBatchMode ? "batch" : "reports"]}
          onClose={() => setOpenAttachModal(false)}
          addRemove={() => setOpenAttachModal(false)}
        />
      </div>
    </MultiSelectListItem>
  );
};

export default ReportListItem;
