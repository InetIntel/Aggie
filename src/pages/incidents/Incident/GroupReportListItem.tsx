
import { Report } from "../../../api/reports/types";
import MultiSelectListItem from "../../../components/MultiSelectListItem";
import SocialMediaListItem from "../../../components/SocialMediaListItem";

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
        <SocialMediaListItem report={report} />
      </div>
    </MultiSelectListItem>
  );
};

export default GroupReportListItem;
