
import { Report } from "../../../api/reports/types";
import MultiSelectListItem from "../../../components/MultiSelectListItem";
import SocialMediaListItem from "../../../components/SocialMediaListItem";
import DateTime from "../../../components/DateTime";
import AggieButton from "../../../components/AggieButton";
import {
  faArrowUp,
  faThumbtack,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps {
  report: Report;
  isChecked: boolean;
  isSelectMode: boolean;
  onCheckChange: () => void;
  hideCheckbox?: boolean;
  onTogglePin?: () => void;
  isPinLoading?: boolean;
}

const GroupReportListItem = ({
  report,
  isChecked,
  isSelectMode,
  onCheckChange,
  hideCheckbox,
  onTogglePin,
  isPinLoading,
}: IProps) => {
  const isPinned = !!report.pinnedInGroupAt;
  return (
    <MultiSelectListItem
      isChecked={isChecked}
      isSelectMode={isSelectMode}
      onCheckChange={onCheckChange}
      hideCheckbox={hideCheckbox}
    >
      <div className='text-sm '>
        <SocialMediaListItem
          report={report}
          header={
            <div className='text-xs text-right'>
              <div>
                Published: <DateTime dateString={report.authoredAt} />
              </div>
              {/* Reports linked before add-tracking existed have no addedToGroupAt. */}
              {report.addedToGroupAt && (
                <div className='text-slate-500 dark:text-gray-400'>
                  Added to incident: <DateTime dateString={report.addedToGroupAt} />
                </div>
              )}
            </div>
          }
        />
        {onTogglePin && (
          <div className='flex justify-end mt-1 -mb-2'>
            <AggieButton
              variant={isPinned ? "light:amber" : "transparent"}
              padding='px-1.5 py-0.5'
              className={`group/pin text-xs rounded ${isPinned ? "" : "text-slate-500 dark:text-gray-400 hover:no-underline"}`}
              icon={isPinned ? undefined : faArrowUp}
              loading={isPinLoading}
              disabled={isPinLoading}
              title={isPinned ? "Unpin" : "Pin to top"}
              aria-label={isPinned ? "Unpin" : "Pin to top"}
              onClick={(e) => {
                // the list row opens the report preview on click
                e.stopPropagation();
                onTogglePin();
              }}
            >
              {isPinned ? (
                // Shows the state ("Pinned") at rest and the action ("Unpin") on hover/focus.
                <>
                  <span className='inline-flex gap-1 items-center group-hover/pin:hidden group-focus-visible/pin:hidden'>
                    {!isPinLoading && <FontAwesomeIcon icon={faThumbtack} />}
                    Pinned
                  </span>
                  <span className='hidden gap-1 items-center group-hover/pin:inline-flex group-focus-visible/pin:inline-flex'>
                    {!isPinLoading && <FontAwesomeIcon icon={faXmark} />}
                    Unpin
                  </span>
                </>
              ) : (
                "Pin to top"
              )}
            </AggieButton>
          </div>
        )}
      </div>
    </MultiSelectListItem>
  );
};

export default GroupReportListItem;
