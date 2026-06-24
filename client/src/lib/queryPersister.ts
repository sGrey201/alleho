import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient, PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import {
  OFFLINE_CACHE_BUSTER,
  OFFLINE_CACHE_MAX_AGE_MS,
  OFFLINE_PERSISTER_KEY,
} from "@/lib/offlineCacheConfig";
import {
  shouldPersistQueryKey,
  trimDehydratedStateForPersistence,
} from "@/lib/queryCacheEviction";

const idbStorage = {
  getItem: async (key: string) => {
    const value = await get<string>(key);
    return value ?? null;
  },
  setItem: async (key: string, value: string) => {
    await set(key, value);
  },
  removeItem: async (key: string) => {
    await del(key);
  },
};

export const offlineQueryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: OFFLINE_PERSISTER_KEY,
  serialize: (client: PersistedClient) => {
    const trimmed: PersistedClient = {
      ...client,
      clientState: trimDehydratedStateForPersistence(client.clientState),
    };
    return JSON.stringify(trimmed);
  },
  deserialize: (cached) => JSON.parse(cached) as PersistedClient,
});

export const offlinePersistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: offlineQueryPersister,
  maxAge: OFFLINE_CACHE_MAX_AGE_MS,
  buster: OFFLINE_CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== "success") return false;
      return shouldPersistQueryKey(query.queryKey);
    },
  },
};

export async function removeOfflinePersisterStorage(): Promise<void> {
  await del(OFFLINE_PERSISTER_KEY);
}
