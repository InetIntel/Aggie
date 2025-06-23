import { useQueryClient } from "@tanstack/react-query";

/**
 * wraps tanstack queryClient with a new update function that updates data in the local cache directly
 * @returns
 */
export function useUpdateQueryData() {
  const queryClient = useQueryClient();

  /**
   * gets and sets data in a the query data cache locally
   * @param queryKey tanstack-query querykey
   * @param updateFn callback that returns the new data
   * @returns pass reference to old and new data objects
   */
  function update<T extends object>(
    queryKey: string[],
    updateFn: (data: T) => { [key in keyof T]?: T[keyof T] }
  ) {
    const previousData = queryClient.getQueryData<T>(queryKey);
    if (!previousData) return undefined;
    const newData = {
      ...previousData,
      ...updateFn(previousData),
    };
    queryClient.setQueryData(queryKey, newData);

    return { previousData, newData };
  }

  return { queryClient, update };
}

export type IuseUpdateQueryData = typeof useUpdateQueryData;
