export const safeParse = <T>(
  jsonString: string,
  defaultValue?: T
): T | null => {
  try {
    const json = JSON.parse(jsonString) as T;
    if (!json || typeof json !== 'object') {
      return (defaultValue !== undefined ? defaultValue : null) as T;
    }
    return json || (defaultValue !== undefined ? defaultValue : null);
  } catch {
    return defaultValue !== undefined ? defaultValue : null;
  }
};
