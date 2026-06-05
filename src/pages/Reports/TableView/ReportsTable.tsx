import { useState } from "react";
import {
  faDotCircle,
  faEnvelope,
  faEnvelopeOpen,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { Report } from "../../../api/reports/types";
import { useReportMutations } from "../useReportMutations";
import { formatText } from "../../../utils/format";

import DataTable from "../../../components/DataTable/DataTable";
import type { DataTableSelection } from "../../../components/DataTable/types";
import AggieButton from "../../../components/AggieButton";
import AddReportsToIncidents from "../components/AddReportsToIncident";
import { buildReportColumns } from "./reportColumns";

interface IProps {
  data: Report[];
  isLoading?: boolean;
  queryKey: readonly unknown[];
  currentPageId?: string;
  selection?: DataTableSelection<Report>;
  onRowClick?: (report: Report) => void;
}

// Per-row action buttons. Holds its own "add to incident" modal state so each
// row's modal is independent.
const ReportRowActions = ({
  report,
  queryKey,
  currentPageId,
}: {
  report: Report;
  queryKey: readonly unknown[];
  currentPageId?: string;
}) => {
  const [openAttachModal, setOpenAttachModal] = useState(false);
  const { setRead, setIrrelevance } = useReportMutations({ key: queryKey });

  // Keep icons compact; only loosen at xl where the table has plenty of room.
  const btnSize = "text-[10px] md:text-xs xl:text-sm";
  const btnPadding = "px-1 py-0.5 xl:px-1.5 xl:py-1";

  return (
    // Horizontal by default; wraps to a second line only when the column is
    // pinched, so the icons never force a horizontal scrollbar.
    <div className='flex flex-wrap items-center gap-0.5 xl:gap-1'>
      <AggieButton
        variant={report.read ? "light:lime" : "light:amber"}
        className={`rounded-lg border border-slate-300 ${btnSize}`}
        padding={btnPadding}
        icon={report.read ? faEnvelopeOpen : faEnvelope}
        title={report.read ? "Mark as unread" : "Mark as read"}
        aria-label={report.read ? "Mark as unread" : "Mark as read"}
        loading={setRead.isLoading}
        disabled={setRead.isLoading}
        onClick={() =>
          setRead.mutate({
            reportIds: [report._id],
            read: !report.read,
            currentPageId,
          })
        }
      />
      <AggieButton
        variant='light:rose'
        className={`rounded-lg border border-slate-300 ${btnSize}`}
        padding={btnPadding}
        icon={faXmark}
        title='Ignore'
        aria-label='Ignore'
        loading={setIrrelevance.isLoading}
        disabled={setIrrelevance.isLoading}
        onClick={() =>
          setIrrelevance.mutate({
            reportIds: [report._id],
            irrelevant: report.irrelevant === "true" ? "maybe" : "true",
            currentPageId,
          })
        }
      />
      <AggieButton
        variant='light:green'
        className={`rounded-lg border border-slate-300 ${btnSize}`}
        padding={btnPadding}
        icon={faDotCircle}
        title='Investigate'
        aria-label='Investigate'
        loading={setIrrelevance.isLoading}
        disabled={setIrrelevance.isLoading}
        onClick={() =>
          setIrrelevance.mutate({
            reportIds: [report._id],
            irrelevant: report.irrelevant === "false" ? "maybe" : "false",
            currentPageId,
          })
        }
      />
      {!report._group && (
        <AggieButton
          variant='transparent'
          className={`rounded-lg border border-dashed border-slate-300 ${btnSize}`}
          padding={btnPadding}
          icon={faPlus}
          title='Add to incident'
          aria-label='Add to incident'
          onClick={() => setOpenAttachModal(true)}
        />
      )}
      <AddReportsToIncidents
        selection={[report]}
        isOpen={openAttachModal}
        queryKey={queryKey}
        onClose={() => setOpenAttachModal(false)}
        addRemove={() => setOpenAttachModal(false)}
      />
    </div>
  );
};

const ReportsTable = ({
  data,
  isLoading,
  queryKey,
  currentPageId,
  selection,
  onRowClick,
}: IProps) => {
  const columns = buildReportColumns();

  return (
    <DataTable
      data={data}
      isLoading={isLoading}
      getRowKey={(report) => report._id}
      columns={columns}
      selection={selection}
      onRowClick={onRowClick}
      actionsInMoreInfo
      rowActions={(report) => (
        <ReportRowActions
          report={report}
          queryKey={queryKey}
          currentPageId={currentPageId}
        />
      )}
      expandedContent={(report) => (
        <div className='flex flex-col gap-2'>
          <div>
            <strong className='text-teal-900 dark:text-teal-200'>
              Content:{" "}
            </strong>
            <span className='whitespace-pre-line'>
              {formatText(report.content)}
            </span>
          </div>
          {report.notes && (
            <div>
              <strong className='text-teal-900 dark:text-teal-200'>
                Notes:{" "}
              </strong>
              <span className='whitespace-pre-line'>{report.notes}</span>
            </div>
          )}
          {report.aitagnames && report.aitagnames.length > 0 && (
            <div className='flex flex-wrap gap-1 items-center'>
              <strong className='text-teal-900 dark:text-teal-200'>
                Tags:{" "}
              </strong>
              {report.aitagnames.map((tag) => (
                <span
                  key={tag}
                  className='inline-block bg-teal-50 text-teal-900 border border-teal-700 text-[12px] font-medium px-1.5 rounded-sm dark:bg-teal-100 dark:saturate-[0.7]'
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {report.url && (
            <div>
              <strong className='text-teal-900 dark:text-teal-200'>
                Source URL:{" "}
              </strong>
              <a
                href={report.url}
                target='_blank'
                rel='noreferrer'
                className='text-blue-700 hover:underline dark:text-blue-300 break-all'
                onClick={(e) => e.stopPropagation()}
              >
                {report.url}
              </a>
            </div>
          )}
        </div>
      )}
    />
  );
};

export default ReportsTable;
