import { useSearchParams } from "react-router-dom";

/**
 *  wrapper for common query search parameter functions
 *
 * @param initialParams initialize with object
 * */
export function useQueryParams<T extends object>(initialParams?: T) {
  // lets initialize searchparams with some data we pass in.
  const initialize = new URLSearchParams();
  if (initialParams) {
    Object.entries(initialParams).forEach(([key, value]) => {
      if (!!value) initialize.set(key, value);
    });
  }

  const [searchParams, setSearchParams] = useSearchParams(
    initialize.size > 0 ? initialize : undefined
  );

  /** gets all parameters and returns defined object */
  const getAllParams = (params: URLSearchParams): T => {
    const entries = params.entries();
    let paramObject = {};
    for (const [key, value] of entries) {
      paramObject = { ...paramObject, [key]: value };
    }
    return paramObject as T;
  };

  /**
   * returns a parameter, if null then returns an empty string.
   * @param key parameter key, defined by object when initalized
   * @returns value as string
   */
  const getParam = (key: keyof T): string => {
    const get = searchParams.get(key as string);
    if (get === null || get === undefined) return "";
    return get;
  };

  /**
   * sets multiple parameters at once. accepts an object with properties that exist in initialized object type
   * @param values
   */
  const setParams = (values: Partial<T>) => {
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "") searchParams.delete(key);
      else searchParams.set(key, value as string);
    });

    setSearchParams(searchParams);
  };

  /** clears all parameters */
  const clearAllParams = () => {
    setSearchParams(new URLSearchParams());
  };

  return { searchParams, getAllParams, setParams, getParam, clearAllParams };
}

export type IuseQueryParams = typeof useQueryParams;
