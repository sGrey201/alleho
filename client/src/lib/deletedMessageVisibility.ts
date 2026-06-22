const DELETED_MESSAGE_PLAQUE_MS = 24 * 60 * 60 * 1000;

export function shouldShowDeletedMessagePlaque(deletedAt: string | null | undefined): boolean {
  if (!deletedAt) return false;
  const deletedTime = new Date(deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return false;
  return Date.now() - deletedTime <= DELETED_MESSAGE_PLAQUE_MS;
}
