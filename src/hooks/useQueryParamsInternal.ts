import { omitBy, isNil } from "lodash";
import {  useState } from "react";

/**
 *  same as useQueryParams but uses internal useState instead of URLSearchParams.
 *
 * @param initialParams initialize with object
 * */
export function useQueryParamsInternal<T extends object>(initialParams?: T) {
  // lets initialize searchparams with some data we pass in.
  const [query, setQuery] = useState<T>(initialParams || ({} as T));

  // this exists only for compatibility with useQueryParams
  // this forces an extra render which isnt good but idk how else to achieve this
  const searchParams = new URLSearchParams(query as Record<string, string>);

  /** gets all parameters and returns defined object */
  const getAllParams = (): T => {
    return query;
  };

  /**
   * returns a parameter, if null then returns an empty string.
   * @param key parameter key, defined by object when initalized
   * @returns value as string
   */
  const getParam = (key: keyof T): string => {
    if (key in query) return query[key] as string;
    return "";
  };

  /**
   * sets multiple parameters at once. accepts an object with properties that exist in initialized object type
   * @param values
   */
  const setParams = (values: Partial<T>) => {
    const combine = { ...query, ...values };
    const removeEmpty = omitBy(combine, (v) => isNil(v) || v === "");

    setQuery(removeEmpty as T);
  };

  /** clears all parameters */
  const clearAllParams = () => {
    setQuery({} as T);
  };

  return {
    searchParams: searchParams,
    query,
    getAllParams,
    setParams,
    getParam,
    clearAllParams,
  };
}
