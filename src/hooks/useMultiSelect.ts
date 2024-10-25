import { useState } from "react";
import { isEqual } from "lodash";
import { hasId } from "../api/common";

interface IOptions<T extends hasId> {
  /** list of data that we want to select. can by any type.*/
  allItems?: T[];
  /** tells function how to grab a unique id string from each data object. must return a string
   * for example, if data object contains an id field use:
   *
   * (item) => item.id
   */
  mapFn?: (item: T) => string;
  /** initial selection */
  initial?: T[];
}

/**
 *
 *  wrapper for "select multiple" functionality
 *  keeps track of a string array that keeps id's of the selected object
 *
 * @param options required options
 * @returns
 */
export function useMultiSelect<T extends hasId>({
  allItems,
  mapFn,
  initial,
}: IOptions<T>) {
  const [selection, setSelection] = useState<T[]>(initial || []);
  const [isActive, setIsActive] = useState(false);

  /**utility to compare if items in list are equal. if no allItems list is provided, do a simple length comparison */
  function compareSelection(data: T[]) {
    if (!allItems) return selection.length === data.length;

    return isEqual(
      allItems.map((i) => i._id),
      selection.map((i) => i._id)
    );
  }

  /**  if id exists, remove. otherwise add to list */
  function addRemove(obj: T) {
    const ifExists = selection.some((i) => i._id === obj._id);
    if (ifExists) {
      const newSelection = selection.filter((i) => i._id !== obj._id);
      setSelection(newSelection || []);
    } else {
      if (selection.length === 0) setIsActive(true);

      setSelection([...selection, obj]);
    }
  }

  /** given list of data, toggle selection. if list is different, then set selection */
  function addRemoveAll(data: T[] | undefined) {
    // this function might have performance issues. if there is, lets refactor the compare to not do all that
    if (!data) return;
    if (data.length === 0 || compareSelection(data)) {
      setSelection([]);
    } else {
      setSelection(data);
    }
  }
  /** toggles select multiple mode and clears selection */
  function toggleActive() {
    if (isActive) {
      setSelection([]);
      setIsActive(false);
    } else setIsActive(true);
  }

  // utility

  /** returns true if anything is selected */
  function any() {
    return selection.length > 0;
  }

  /** returns true if everything is selected, assuming everything is defined the inital list */
  function all() {
    if (!allItems) return undefined;
    return selection.length === allItems.length;
  }
  /** returns true if id exists in selection */
  function exists(obj: T) {
    return selection.some((i) => i._id === obj._id);
  }
  function toIdList() {
    return selection.map((i) => i._id);
  }
  return {
    isActive,
    toggleActive,
    selection,
    addRemoveAll,
    addRemove,
    toIdList,
    any,
    all,
    exists,
    setActive: setIsActive,
    set: setSelection,
  };
}

export type IuseMultiSelect = typeof useMultiSelect;
