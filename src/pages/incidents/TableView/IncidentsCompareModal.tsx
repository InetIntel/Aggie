import type { Group } from "../../../api/groups/types";
import CompareModal from "../../../components/CompareModal/CompareModal";
import CompareIncidentCard from "./CompareIncidentCard";

interface IProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Group[];
  /** Remove an incident from the comparison (deselects it in the parent table). */
  onRemoveIncident: (group: Group) => void;
}

// Incidents comparison: read-only side-by-side summary cards (no footer actions
// for v1 — incidents have no equivalent grouping action like alerts do).
const IncidentsCompareModal = ({
  isOpen,
  onClose,
  incidents,
  onRemoveIncident,
}: IProps) => (
  <CompareModal<Group>
    isOpen={isOpen}
    onClose={onClose}
    title='Compare Incidents'
    items={incidents}
    renderCard={(group) => (
      <CompareIncidentCard
        group={group}
        onRemove={() => onRemoveIncident(group)}
      />
    )}
  />
);

export default IncidentsCompareModal;
