import { vi } from 'vitest'

/**
 * Installs an in-memory `Storage` as the test's `localStorage`.
 *
 * jsdom's own storage is shadowed here by Node 22's experimental
 * `localStorage` global (`get() { lazyLocalStorage ??= require('internal/webstorage').localStorage }`),
 * which returns undefined unless Node was started with `--localstorage-file`.
 * `window` is the same object as `globalThis` under Vitest's jsdom environment,
 * so `vi.stubGlobal` is enough, and it is scoped to the calling test file — no
 * global setup change is imposed on the other suites.
 */
export function stubLocalStorage(): Storage {
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
  }

  vi.stubGlobal('localStorage', storage)
  return storage
}
