import { OFFLINE_CACHE_GC_TIME_MS } from "@/lib/offlineCacheConfig";

/** Offline-first queries: show cached data immediately, refresh when online. */
export const offlineMessengerQueryOptions = {
  staleTime: 60_000,
  gcTime: OFFLINE_CACHE_GC_TIME_MS,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  networkMode: "offlineFirst" as const,
};
