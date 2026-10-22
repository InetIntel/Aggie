import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { debounce } from "lodash";

type IState = "loading" | "finished" | "idle";
interface IProps {
  className?: string;
}
const FetchIndicator = ({ className }: IProps) => {
  const [fetchState, setFetchState] = useState<IState>("idle");
  const isFetching = useIsFetching();
  //const isMutating = useIsMutating();
  const isMutating = 0; // dont track mutation

  function onFetchState() {
    if (fetchState === "finished") return;
    setFetchState("finished");
    setTimeout(() => {
      setFetchState("idle");
    }, 150);
  }
  const doOnFetchState = useCallback(debounce(onFetchState, 150), [fetchState]);

  useEffect(() => {
    if (isFetching + isMutating === 0) doOnFetchState();
    else setFetchState("loading");
  }, [isFetching, isMutating]);
  function setWidth(value: number, state: IState) {
    if (value === 0 && state === "idle") return 0;
    // lol...

    const width = 75 / (value + 1) + 25;
    return state === "finished" ? 100 : width;
  }
  return (
    <div className={`w-full  pointer-events-none ${className}`}>
      <span className='h-[1em] w-full bg-green-600 dark:bg-green-600 dark:saturate-[0.7]'></span>
      <span
        className='h-[0.12em] absolute top-0 left-0 transition duration-800 bg-green-600 dark:bg-green-600 dark:saturate-[0.7]'
        style={{
          width: `${setWidth(isFetching + isMutating, fetchState)}%`,
        }}
      ></span>
    </div>
  );
};
export default FetchIndicator;
