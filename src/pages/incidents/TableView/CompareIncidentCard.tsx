import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faEllipsis,
  faExclamationTriangle,
  faMinusCircle,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { statusFromGroup, IncidentTableStatus } from "./statusFromGroup";
import AsnChips from "./AsnChips";
import DropdownMenu from "../../../components/DropdownMenu";

interface IProps {
  group: Group;
  onRemove: () => void;
}

const statusClass: Record<IncidentTableStatus, string> = {
  Open: "bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-gray-300",
  Closed: "bg-purple-100 text-purple-700 dark:bg-purple-100 dark:saturate-[0.7]",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-100 dark:saturate-[0.7]",
};

const formatDateTime = (raw?: Date | string | null) => {
  if (!raw) return "—";
  return raw.toString().slice(0, 16).replace("T", " ");
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
};

const formatAssignedTo = (group: Group) => {
  if (!group.assignedTo || group.assignedTo.length === 0) return "—";
  return (
    group.assignedTo
      .map((u) => ("username" in u && u.username) || "")
      .filter(Boolean)
      .join(", ") || "—"
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex gap-2'>
    <dt className='font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap'>
      {label}
    </dt>
    <dd className='min-w-0'>{children}</dd>
  </div>
);

// Read-only incident summary for the compare grid. Mirrors the columns the
// incidents table shows, in a card layout for side-by-side scanning.
const CompareIncidentCard = ({ group, onRemove }: IProps) => {
  const status = statusFromGroup(group);
  const duration = formatDuration(group.incidentDurationSeconds);
  const reportCount = group._reports?.length ?? 0;

  return (
    <div className='rounded-xl border border-slate-300 bg-white dark:bg-gray-800 p-2 h-full min-h-0 flex flex-col overflow-hidden'>
      <div className='flex justify-between items-start gap-2 mb-1.5'>
        <div className='min-w-0'>
          <div className='text-xs font-medium text-slate-500 dark:text-gray-400'>
            #{group.idnum}
          </div>
          <Link
            to={`/incidents/${group._id}`}
            className='text-sm text-blue-700 hover:underline font-medium dark:text-blue-300 leading-snug break-words'
          >
            {group.title}
            {group.escalated && (
              <FontAwesomeIcon
                icon={faExclamationTriangle}
                className='text-red-500 ml-1'
              />
            )}
            {group.closed && (
              <FontAwesomeIcon
                icon={faMinusCircle}
                className='text-purple-500 ml-1'
              />
            )}
          </Link>
        </div>
        <DropdownMenu
          buttonElement={<FontAwesomeIcon icon={faEllipsis} />}
          className='px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
          panelClassName='right-0 w-52 rounded-lg border border-slate-300 bg-white dark:bg-gray-800 py-1'
        >
          <button
            type='button'
            className='w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-2'
            onClick={onRemove}
          >
            <FontAwesomeIcon icon={faTrash} /> Remove from comparison
          </button>
          <Link
            to={`/incidents/${group._id}`}
            className='w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-2'
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open incident
          </Link>
        </DropdownMenu>
      </div>

      <div className='mb-1.5'>
        <span
          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusClass[status]}`}
        >
          {status}
        </span>
      </div>

      <dl className='flex flex-col gap-1 text-xs text-slate-700 dark:text-gray-300'>
        <Row label='Start:'>{formatDateTime(group.incidentStartedAt)}</Row>
        <Row label='End:'>{formatDateTime(group.incidentEndedAt)}</Row>
        {duration && <Row label='Duration:'>{duration}</Row>}
        <Row label='Reports:'>{reportCount}</Row>
        <Row label='Assigned:'>{formatAssignedTo(group)}</Row>
        {group.locationName && <Row label='Location:'>{group.locationName}</Row>}
        <Row label='ASNs:'>
          <AsnChips asns={group.impactedAsns} max={20} />
        </Row>
      </dl>

      {group.notes && (
        <div className='mt-1.5 pt-1.5 border-t border-slate-200 dark:border-gray-700 text-xs flex-1 min-h-0 overflow-y-auto'>
          <div className='font-semibold text-slate-600 dark:text-gray-400'>
            Notes
          </div>
          <p className='whitespace-pre-line text-slate-700 dark:text-gray-300'>
            {group.notes}
          </p>
        </div>
      )}
    </div>
  );
};

export default CompareIncidentCard;
