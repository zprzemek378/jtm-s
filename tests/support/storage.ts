// A localStorage that behaves like the real one, including running out.
//
// The app's storage helpers swallow every failure, so the only way to check
// what happens when a game will not fit is to have a store that can refuse.

export type FakeStorage = {
  /** What is stored, by key. */
  entries: Map<string, string>;
  /** How many characters all of it comes to. */
  size: () => number;
  restore: () => void;
};

/** @param quota The most it will hold, in characters; unlimited by default. */
export function stubStorage(quota = Number.POSITIVE_INFINITY): FakeStorage {
  const entries = new Map<string, string>();
  const original = Reflect.getOwnPropertyDescriptor(globalThis, "localStorage");
  const size = () =>
    [...entries].reduce((total, [key, value]) => total + key.length + value.length, 0);

  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const without =
        size() - (entries.get(key)?.length ?? 0) - (entries.has(key) ? key.length : 0);

      if (without + key.length + value.length > quota) {
        // What a browser throws when the origin is full.
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      }

      entries.set(key, value);
    },
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

  return {
    entries,
    size,
    restore: () => {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    },
  };
}
