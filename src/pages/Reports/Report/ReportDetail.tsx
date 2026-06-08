import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Report } from "../../../api/reports/types";
import { useReportMutations } from "../useReportMutations";

import AggieButton from "../../../components/AggieButton";
import AddReportsToIncidents from "../components/AddReportsToIncident";
import DropdownMenu from "../../../components/DropdownMenu";
import SocialMediaPost from "../../../components/SocialMediaPost";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faDotCircle,
  faEnvelope,
  faEnvelopeOpen,
  faFile,
  faFileEdit,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

interface IProps {
  report: Report;
  /** Query key of the list this report belongs to, for optimistic updates. */
  listQueryKey: readonly unknown[];
  /** Mark the report read when the detail is shown. Default true. */
  markReadOnView?: boolean;
  isBatchMode?: boolean;
}

/**
 * Presentational alert/report detail: action toolbar + the platform-specific
 * post/event card. Used both by the standalone `/alerts/:id` route and inline
 * (expanded rows in the list and table views).
 */
const ReportDetail = ({
  report,
  listQueryKey,
  markReadOnView = true,
  isBatchMode = false,
}: IProps) => {
  const navigate = useNavigate();
  const { setRead, setIrrelevance } = useReportMutations({ key: listQueryKey });
  const [addReportModal, setAddReportModal] = useState(false);

  // Mark as read once when the detail becomes visible.
  const [markedId, setMarkedId] = useState("");
  useEffect(() => {
    if (!markReadOnView || !report?._id || markedId === report._id) return;
    if (!report.read) {
      setRead.mutate({
        reportIds: [report._id],
        read: true,
        currentPageId: report._id,
      });
    }
    setMarkedId(report._id);
  }, [report, markReadOnView, markedId, setRead]);

  function newIncidentFromReport() {
    const params = new URLSearchParams({ reports: [report._id].toString() });
    if (isBatchMode) params.append("key", "batch");
    navigate("/incidents/new?" + params.toString());
  }

  return (
    <div className='flex flex-col gap-2'>
      <AddReportsToIncidents
        selection={[report]}
        isOpen={addReportModal}
        queryKey={listQueryKey}
        onClose={() => setAddReportModal(false)}
        addRemove={() => setAddReportModal(false)}
      />

      <nav className='flex justify-end items-center gap-1 text-xs'>
        <AggieButton
          variant={report.read ? "light:lime" : "light:amber"}
          className='rounded-lg border border-slate-300'
          onClick={(e) => {
            e.stopPropagation();
            setRead.mutate({
              reportIds: [report._id],
              read: !report.read,
              currentPageId: report._id,
            });
          }}
          loading={setRead.isLoading}
          disabled={setRead.isLoading}
          icon={report.read ? faEnvelopeOpen : faEnvelope}
        >
          {report.read ? "Unread" : "Read"}
        </AggieButton>
        <div className='rounded-lg border border-slate-300 flex'>
          <AggieButton
            variant='light:rose'
            className='rounded-l-lg'
            onClick={(e) => {
              e.stopPropagation();
              setIrrelevance.mutate({
                reportIds: [report._id],
                irrelevant: report.irrelevant === "true" ? "maybe" : "true",
                currentPageId: report._id,
              });
            }}
            icon={faXmark}
            loading={setIrrelevance.isLoading}
            disabled={setIrrelevance.isLoading}
          >
            Ignore
          </AggieButton>
          <AggieButton
            variant='light:green'
            className='rounded-r-lg'
            onClick={(e) => {
              e.stopPropagation();
              setIrrelevance.mutate({
                reportIds: [report._id],
                irrelevant: report.irrelevant === "false" ? "maybe" : "false",
                currentPageId: report._id,
              });
            }}
            icon={faDotCircle}
            loading={setIrrelevance.isLoading}
            disabled={setIrrelevance.isLoading}
          >
            Investigate
          </AggieButton>
        </div>

        <div className='flex font-medium'>
          <AggieButton
            className='px-2 py-1 rounded-l-lg bg-slate-100 dark:bg-gray-700 border border-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600'
            onClick={(e) => {
              e.stopPropagation();
              setAddReportModal(true);
            }}
          >
            {report._group ? (
              <>
                <FontAwesomeIcon icon={faFileEdit} />
                Change Incident
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPlus} />
                Add to Incident
              </>
            )}
          </AggieButton>
          <DropdownMenu
            variant='secondary'
            buttonElement={
              <FontAwesomeIcon icon={faCaretDown} className='ui-open:rotate-180' />
            }
            className='px-2 py-1 rounded-r-lg border-y border-r'
            panelClassName='right-0'
          >
            <AggieButton
              className='px-3 py-2 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600'
              onClick={newIncidentFromReport}
            >
              <FontAwesomeIcon icon={faFile} />
              Create New Incident with Report
            </AggieButton>
          </DropdownMenu>
        </div>
      </nav>

      <SocialMediaPost report={report} showMedia />
    </div>
  );
};

export default ReportDetail;
