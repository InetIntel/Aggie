import { FloatingTree } from "@floating-ui/react";
import { useEffect, useState } from "react";
import AggieButton from "../AggieButton";
import DateSelector from "./DateSelector";
import FilterDropdown from "./FilterDropdown";

interface IProps {
  before: string;
  onSetBefore: (item: string) => void;
  after: string;
  onSetAfter: (item: string) => void;
}
const FilterDateTime = ({ before, onSetBefore, after, onSetAfter }: IProps) => {
  const [beforeDate, setBefore] = useState("");
  const [afterDate, setAfter] = useState("");

  function update() {
    onSetBefore(beforeDate);
    onSetAfter(afterDate);
    console.log(beforeDate);
  }
  useEffect(() => {
    if (beforeDate !== before) setBefore(before);
    if (afterDate !== after) setAfter(after);
  }, [before, after]);

  function renderRange() {
    const aDate = after && new Date(after).toLocaleDateString();
    const bDate = before && new Date(before).toLocaleDateString();

    if (before && after) return `${aDate} - ${bDate}`;
    else if (before) return `Before ${bDate}`;
    else if (after) return `After ${aDate}`;
    return "";
  }
  return (
    <FloatingTree>
      <FilterDropdown
        label={"Date Range"}
        value={renderRange()}
        onReset={() => {
          setBefore("");
          setAfter("");
          onSetBefore("");
          onSetAfter("");
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) update();
        }}
      >
        {({ close }) => (
          <>
            <div className='flex gap-1 text-sm p-1'>
              <div>
                <p>After:</p>
                <DateSelector
                  unsetLabel={"set date"}
                  value={afterDate}
                  onChange={(d) => setAfter(d)}
                />
              </div>
              <div>
                <p>Before:</p>
                <DateSelector
                  unsetLabel={"set date"}
                  value={beforeDate}
                  onChange={(d) => setBefore(d)}
                />
              </div>
            </div>
            <AggieButton
              variant='primary'
              padding='px-2 py-1'
              type='button'
              className='text-sm ml-1 mb-1'
              onClick={() => close()}
            >
              Filter
            </AggieButton>
          </>
        )}
      </FilterDropdown>
    </FloatingTree>
  );
};

export default FilterDateTime;
