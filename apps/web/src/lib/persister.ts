import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

/**
 * IndexedDB rather than localStorage: localStorage is synchronous (it blocks
 * the main thread), capped around 5 MB, and stores strings only. A season of
 * fixtures will exceed that.
 */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key).then((v: string | undefined) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: "livescore-query-cache",
  throttleTime: 1000,
});
