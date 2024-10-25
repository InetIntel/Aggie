interface IUrlStringFromQuery<T extends Record<string, unknown>> {
  override?: (key: keyof T, value: unknown, url: URLSearchParams) => boolean;
  query: T;
}

/**
 */
export function QueryToUrlParams<T extends Record<string, unknown>>(
  options: IUrlStringFromQuery<Partial<T>>
) {
  const url = new URLSearchParams();
  // i think ideally GroupQueryState should convert to record<string,string>
  Object.entries(options.query).forEach(([key, value]) => {
    //overrides:
    const didOverride = options.override
      ? options?.override(key, value, url)
      : false;
    if (!didOverride) {
      url.set(key, `${value}`);
    }
  });

  return url;
}
