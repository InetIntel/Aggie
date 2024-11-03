import { FloatingTree } from "@floating-ui/react";
import DateSelector from "./DateSelector";
import FilterDropdown from "./FilterDropdown";

interface IProps {
  before: string;
  onSetBefore: (item: string) => void;
}
const FilterDateTime = ({ before, onSetBefore }: IProps) => {
  return (
    <FloatingTree>
      <FilterDropdown
        label={"Date Range"}
        value={before}
        onReset={() => onSetBefore("")}
      >
        {({ close }) => (
          <>
            <DateSelector
              unsetLabel={"set date"}
              value={before}
              onChange={(d) => onSetBefore(d)}
            />
          </>
        )}
      </FilterDropdown>
    </FloatingTree>
  );
};

export default FilterDateTime;
