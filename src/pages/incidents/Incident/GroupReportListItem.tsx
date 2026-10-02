
import { Report } from "../../../api/reports/types";
import MultiSelectListItem from "../../../components/MultiSelectListItem";
import SocialMediaListItem from "../../../components/SocialMediaListItem";
import DateTime from "../../../components/DateTime";

interface IProps {
  report: Report;
  isChecked: boolean;
  isSelectMode: boolean;
  onCheckChange: () => void;
  hideCheckbox?: boolean;
}

const GroupReportListItem = ({
  report,
  isChecked,
  isSelectMode,
  onCheckChange,
  hideCheckbox,
}: IProps) => {
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
      </div>
    </MultiSelectListItem>
  );
};

export default GroupReportListItem;
