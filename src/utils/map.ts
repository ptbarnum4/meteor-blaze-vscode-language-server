export function initializeMapOnObjectKeys<
  T extends Record<string, unknown>,
  U extends keyof T,
>(obj: T, ...keys: U[]): asserts obj is T & { [K in U]-?: NonNullable<T[K]> } {
  if (!obj || !keys.length) {
    return;
  }

  for (const key of keys) {
    const existing = obj[key];

    if (!existing) {
      obj[key] = new Map<string, unknown>() as T[U];
    }
  }
}

export function initializeSetOnObjectKeys<
  T extends Record<string, unknown>,
  U extends keyof T,
>(obj: T, ...keys: U[]): asserts obj is T & { [K in U]-?: NonNullable<T[K]> } {
  if (!obj || !keys.length) {
    return;
  }

  for (const key of keys) {
    const existing = obj[key];

    if (!existing) {
      obj[key] = new Set<string>() as T[U];
    }
  }
}
