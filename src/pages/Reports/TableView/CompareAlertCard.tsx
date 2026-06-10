import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDotCircle,
  faEllipsis,
  faEnvelope,
  faEnvelopeOpen,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { Report } from "../../../api/reports/types";
import { useReportMutations } from "../useReportMutations";

import SocialMediaPost from "../../../components/SocialMediaPost";
import DropdownMenu from "../../../components/DropdownMenu";

interface IProps {
  report: Report;
  queryKey: readonly unknown[];
  currentPageId?: string;
  isHighlighted: boolean;
  onToggleHighlight: () => void;
  onRemove: () => void;
}

// One alert in the compare grid: the shared SocialMediaPost detail card, plus a
// ⋯ menu (remove / read / ignore / investigate) and a click-to-highlight ring
// that marks the card for the modal's footer actions.
const CompareAlertCard = ({
  report,
  queryKey,
  currentPageId,
  isHighlighted,
  onToggleHighlight,
  onRemove,
}: IProps) => {
  const { setRead, setIrrelevance } = useReportMutations({ key: queryKey });

  const menuItem =
    "w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-2";

  return (
    <div
      onClick={onToggleHighlight}
      className={`cursor-pointer rounded-xl transition-shadow h-full min-h-0 flex flex-col ${
        isHighlighted ? "ring-2 ring-yellow-400" : "ring-1 ring-transparent"
      }`}
    >
      {/* Per-card action menu — its clicks must not toggle the highlight. */}
      <div className='flex justify-end mb-1' onClick={(e) => e.stopPropagation()}>
        <DropdownMenu
          buttonElement={<FontAwesomeIcon icon={faEllipsis} />}
          className='px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
          panelClassName='right-0 w-52 rounded-lg border border-slate-300 bg-white dark:bg-gray-800 py-1'
        >
          <button type='button' className={menuItem} onClick={onRemove}>
            <FontAwesomeIcon icon={faTrash} /> Remove from comparison
          </button>
          <button
            type='button'
            className={menuItem}
            onClick={() =>
              setRead.mutate({
                reportIds: [report._id],
                read: !report.read,
                currentPageId,
              })
            }
          >
            <FontAwesomeIcon icon={report.read ? faEnvelope : faEnvelopeOpen} />
            Mark as {report.read ? "unread" : "read"}
          </button>
          <button
            type='button'
            className={menuItem}
            onClick={() =>
              setIrrelevance.mutate({
                reportIds: [report._id],
                irrelevant: report.irrelevant === "true" ? "maybe" : "true",
                currentPageId,
              })
            }
          >
            <FontAwesomeIcon icon={faXmark} />
            {report.irrelevant === "true" ? "Remove ignore" : "Ignore"}
          </button>
          <button
            type='button'
            className={menuItem}
            onClick={() =>
              setIrrelevance.mutate({
                reportIds: [report._id],
                irrelevant: report.irrelevant === "false" ? "maybe" : "false",
                currentPageId,
              })
            }
          >
            <FontAwesomeIcon icon={faDotCircle} />
            {report.irrelevant === "false" ? "Remove investigate" : "Investigate"}
          </button>
        </DropdownMenu>
      </div>

      <div className='flex-1 min-h-0'>
        <SocialMediaPost report={report} showMedia compact />
      </div>
    </div>
  );
};

export default CompareAlertCard;
