/** Bump when persisted query shape or policy changes. */
export const OFFLINE_CACHE_BUSTER = "v1";

/** How long dehydrated query data stays valid in IndexedDB. */
export const OFFLINE_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export const OFFLINE_CACHE_GC_TIME_MS = OFFLINE_CACHE_MAX_AGE_MS;

export const OFFLINE_PERSISTER_KEY = "hovial-query-cache";

export const MAX_PERSISTED_CONVERSATIONS = 50;
export const MAX_MESSAGE_PAGES_PER_CONVERSATION = 10;

export const MEDIA_THUMB_CACHE = "media-thumbs-v2";
/** Bump when object-cache policy changes (e.g. stop storing HTTP 206 Range slices). */
export const MEDIA_FILES_CACHE = "media-files-v2";
