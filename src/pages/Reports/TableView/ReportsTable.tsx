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

import DataTable from "../../../components/DataTable/DataTable";
import type { DataTableSelection } from "../../../components/DataTable/types";
import AggieButton from "../../../components/AggieButton";
import AddReportsToIncidents from "../components/AddReportsToIncident";
import ReportDetail from "../Report/ReportDetail";
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
    <div className='flex items-center justify-end gap-0.5 xl:gap-1'>
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
      rowActions={(report) => (
        <ReportRowActions
          report={report}
          queryKey={queryKey}
          currentPageId={currentPageId}
        />
      )}
      expandedContent={(report) => (
        <ReportDetail report={report} listQueryKey={queryKey} />
      )}
    />
  );
};

export default ReportsTable;
