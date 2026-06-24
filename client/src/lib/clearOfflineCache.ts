import { queryClient } from "@/lib/queryClient";
import { MEDIA_FILES_CACHE, MEDIA_THUMB_CACHE } from "@/lib/offlineCacheConfig";
import { removeOfflinePersisterStorage } from "@/lib/queryPersister";

const MEDIA_CACHE_NAMES = new Set([MEDIA_THUMB_CACHE, MEDIA_FILES_CACHE]);

export async function clearOfflineCache(): Promise<void> {
  queryClient.clear();
  await removeOfflinePersisterStorage();

  if (!("caches" in window)) return;

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => MEDIA_CACHE_NAMES.has(name)).map((name) => caches.delete(name))
  );
}
