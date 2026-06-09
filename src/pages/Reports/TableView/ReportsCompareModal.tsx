import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { faFileCirclePlus, faPlus } from "@fortawesome/free-solid-svg-icons";

import type { Report } from "../../../api/reports/types";
import CompareModal from "../../../components/CompareModal/CompareModal";
import CompareAlertCard from "./CompareAlertCard";
import AddReportsToIncidents from "../components/AddReportsToIncident";
import AggieButton from "../../../components/AggieButton";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  reports: Report[];
  queryKey: readonly unknown[];
  currentPageId?: string;
  /** Remove a report from the comparison (deselects it in the parent table). */
  onRemoveReport: (report: Report) => void;
}

const plural = (n: number) => (n === 1 ? "alert" : "alerts");

// Alerts comparison: a grid of full-detail cards with footer actions that group
// the highlighted alerts into an incident, reusing the existing flows.
const ReportsCompareModal = ({
  isOpen,
  onClose,
  reports,
  queryKey,
  currentPageId,
  onRemoveReport,
}: IProps) => {
  const navigate = useNavigate();
  // When set, the "Add to incident" picker is open with these reports.
  const [addSelection, setAddSelection] = useState<Report[] | null>(null);

  // Close the modal once every card has been removed.
  useEffect(() => {
    if (isOpen && reports.length === 0) onClose();
  }, [isOpen, reports.length, onClose]);

  function createIncident(targets: Report[]) {
    if (!targets.length) return;
    const params = new URLSearchParams({
      reports: targets.map((r) => r._id).join(":"),
    });
    navigate({ pathname: "/incidents/new", search: params.toString() });
  }

  return (
    <>
      <CompareModal<Report>
        // Hide the compare modal while the incident picker is open (avoids two
        // stacked dialogs); reopens on cancel.
        isOpen={isOpen && !addSelection}
        onClose={onClose}
        title='Compare Alerts'
        items={reports}
        renderCard={(report, { isHighlighted, onToggleHighlight }) => (
          <CompareAlertCard
            report={report}
            queryKey={queryKey}
            currentPageId={currentPageId}
            isHighlighted={isHighlighted}
            onToggleHighlight={onToggleHighlight}
            onRemove={() => onRemoveReport(report)}
          />
        )}
        footer={(effective) => (
          <div className='flex gap-3'>
            <AggieButton
              variant='secondary'
              className='flex-1 justify-center py-3 text-base'
              icon={faFileCirclePlus}
              disabled={!effective.length}
              onClick={() => createIncident(effective)}
            >
              Create new incident ({effective.length} {plural(effective.length)})
            </AggieButton>
            <AggieButton
              variant='primary'
              className='flex-1 justify-center py-3 text-base'
              icon={faPlus}
              disabled={!effective.length}
              onClick={() => setAddSelection(effective)}
            >
              Add to incident ({effective.length} {plural(effective.length)})
            </AggieButton>
          </div>
        )}
      />

      <AddReportsToIncidents
        isOpen={!!addSelection}
        selection={addSelection ?? []}
        queryKey={queryKey}
        onClose={() => setAddSelection(null)}
        onSuccess={() => {
          setAddSelection(null);
          onClose();
        }}
        addRemove={(report) =>
          setAddSelection((cur) =>
            cur
              ? cur.some((r) => r._id === report._id)
                ? cur.filter((r) => r._id !== report._id)
                : [...cur, report]
              : cur
          )
        }
      />
    </>
  );
};

export default ReportsCompareModal;
