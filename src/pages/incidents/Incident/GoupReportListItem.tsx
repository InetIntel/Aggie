import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Report } from "../../../api/reports/types";
import AggieCheck from "../../../components/AggieCheck";
import MultiSelectListItem from "../../../components/MultiSelectListItem";
import SocialMediaListItem from "../../../components/SocialMediaListItem";

interface IProps {
  report: Report;
  isChecked: boolean;
  isSelectMode: boolean;
  onCheckChange: () => void;
}

const GroupReportListItem = ({
  report,
  isChecked,
  isSelectMode,
  onCheckChange,
}: IProps) => {
  return (
    <MultiSelectListItem
      isChecked={isChecked}
      isSelectMode={isSelectMode}
      onCheckChange={onCheckChange}
    >
      <div className='text-sm'>
        <SocialMediaListItem report={report} />
      </div>
    </MultiSelectListItem>
  );
};

export default GroupReportListItem;
