import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownLeftAndUpRightToCenter } from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import CompareModal from "../../../components/CompareModal/CompareModal";
import CompareIncidentCard from "./CompareIncidentCard";
import ImpactedAsnTable from "../Incident/ImpactedAsnTable";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Group[];
  /** Remove an incident from the comparison (deselects it in the parent table). */
  onRemoveIncident: (group: Group) => void;
}

// Incidents comparison: read-only side-by-side summary cards (no footer actions
// for v1 — incidents have no equivalent grouping action like alerts do). A card's
// "Impacted ASNs" button drills the whole modal into that incident's full ASN
// table, with a collapse control back to the cards.
const IncidentsCompareModal = ({
  isOpen,
  onClose,
  incidents,
  onRemoveIncident,
}: IProps) => {
  const [asnGroup, setAsnGroup] = useState<Group | null>(null);

  const handleClose = () => {
    setAsnGroup(null);
    onClose();
  };

  const detail = asnGroup ? (
    <div className='h-full flex flex-col'>
      <div className='flex items-start justify-between gap-2 mb-2'>
        <div className='min-w-0'>
          <div className='text-xs font-medium text-slate-500 dark:text-gray-400'>
            #{asnGroup.idnum} · Impacted ASNs
          </div>
          <div className='font-medium text-slate-800 dark:text-gray-200 truncate'>
            {asnGroup.title}
          </div>
        </div>
        <button
          type='button'
          aria-label='Back to comparison'
          title='Back to comparison'
          className='shrink-0 px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
          onClick={() => setAsnGroup(null)}
        >
          <FontAwesomeIcon icon={faDownLeftAndUpRightToCenter} />
        </button>
      </div>
      <div className='flex-1 min-h-0 overflow-auto'>
        <ImpactedAsnTable asns={asnGroup.impactedAsns ?? []} />
      </div>
    </div>
  ) : undefined;

  return (
    <CompareModal<Group>
      isOpen={isOpen}
      onClose={handleClose}
      title={asnGroup ? "Impacted ASNs" : "Compare Incidents"}
      items={incidents}
      detail={detail}
      renderCard={(group) => (
        <CompareIncidentCard
          group={group}
          onRemove={() => onRemoveIncident(group)}
          onOpenAsns={() => setAsnGroup(group)}
        />
      )}
    />
  );
};

export default IncidentsCompareModal;
