import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReportMutations } from "../useReportMutations";

import AggieButton from "../../../components/AggieButton";
import DropdownMenu from "../../../components/DropdownMenu";
import AddReportsToIncidents from "./AddReportsToIncident";

import {
  faEnvelopeOpen,
  faEnvelope,
  faXmark,
  faDotCircle,
  faPlus,
  faCaretDown,
  faFile,
  faSpinner,
  faFileArchive,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Report } from "../../../api/reports/types";
import { useMutation } from "@tanstack/react-query";
import { removeReportsFromGroup } from "../../../api/reports";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

interface IProps {
  disabled: boolean;
  selection: Report[];
  currentPageId: string | undefined;
  queryKey: string[];
  addRemoveSelection: (r: Report) => void;
}

const MultiSelectActions = ({
  disabled,
  selection,
  currentPageId,
  queryKey,
  addRemoveSelection,
}: IProps) => {
  const { setRead, setIrrelevance } = useReportMutations({ key: queryKey });
  const navigate = useNavigate();
  const [addReportModal, setAddReportModal] = useState(false);

  function onNewIncidentFromReports() {
    const params = new URLSearchParams({
      reports: selection.map((i) => i._id).join(":"),
    });

    if (queryKey.includes("batch")) params.append("key", "batch");

    navigate({ pathname: "/incidents/new", search: params.toString() });
  }

  const idList = selection.map((i) => i._id);

  return (
    <>
      <div className=' rounded-lg flex border border-slate-300 min-w-fit'>
        <AggieButton
          variant='light:amber'
          className='rounded-l-lg'
          disabled={disabled || setRead.isLoading}
          icon={faEnvelopeOpen}
          onClick={() =>
            setRead.mutate({
              reportIds: idList,
              read: true,
              currentPageId,
            })
          }
        >
          Read
        </AggieButton>
        <AggieButton
          variant='light:lime'
          className='rounded-r-lg'
          disabled={disabled || setRead.isLoading}
          icon={faEnvelope}
          onClick={() =>
            setRead.mutate({
              reportIds: idList,
              read: false,
              currentPageId,
            })
          }
        >
          Unread
        </AggieButton>
      </div>
      <div className='flex rounded-lg border border-slate-300'>
        <AggieButton
          variant='light:rose'
          className='rounded-l-lg'
          disabled={disabled || setIrrelevance.isLoading}
          icon={faXmark}
          onClick={() =>
            setIrrelevance.mutate({
              reportIds: idList,
              irrelevant: "true",
              currentPageId,
            })
          }
        >
          Ignore
        </AggieButton>
        <AggieButton
          variant='light:green'
          className='rounded-r-lg'
          disabled={disabled || setIrrelevance.isLoading}
          icon={faDotCircle}
          onClick={() =>
            setIrrelevance.mutate({
              reportIds: idList,
              irrelevant: "false",
              currentPageId,
            })
          }
        >
          Investigate
        </AggieButton>
      </div>

      <div className='flex font-medium'>
        <AggieButton
          className='px-2 py-1 rounded-l-lg bg-slate-100 border border-slate-300 hover:bg-slate-200'
          onClick={() => setAddReportModal(true)}
          disabled={disabled}
        >
          <FontAwesomeIcon icon={faPlus} />
          Add to Incident
        </AggieButton>
        <DropdownMenu
          variant='secondary'
          buttonElement={
            <FontAwesomeIcon
              icon={faCaretDown}
              className='ui-open:rotate-180'
            />
          }
          className='px-2 py-1 rounded-r-lg border-y border-r'
          panelClassName='right-0'
          disabled={disabled}
        >
          <AggieButton
            className='px-3 py-2 hover:bg-slate-200'
            onClick={onNewIncidentFromReports}
          >
            <FontAwesomeIcon icon={faFile} />
            Create New Incident with Report
          </AggieButton>
        </DropdownMenu>
      </div>
      {(setIrrelevance.isLoading || setRead.isLoading) && (
        <FontAwesomeIcon
          className='text-slate-600 animate-spin'
          icon={faSpinner}
        />
      )}
      <AddReportsToIncidents
        selection={selection}
        queryKey={queryKey}
        isOpen={addReportModal}
        addRemove={addRemoveSelection}
        onClose={() => {
          setAddReportModal(false);
        }}
      />
    </>
  );
};

export default MultiSelectActions;
