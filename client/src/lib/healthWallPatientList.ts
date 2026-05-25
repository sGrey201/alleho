/** Sort patients by latest health wall activity (newest first). */

export type HealthWallPatientSortable = {
  patientUserId: string;
  lastMessageAt?: string | Date | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  unreadCount?: number;
};

function lastMessageTime(item: { lastMessageAt?: string | Date | null }): number {
  if (!item.lastMessageAt) return 0;
  const t = new Date(item.lastMessageAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function patientLabel(item: HealthWallPatientSortable): string {
  return (
    [item.firstName, item.lastName].filter(Boolean).join(" ").trim() ||
    item.email ||
    item.patientUserId
  );
}

export function sortHealthWallPatients<T extends HealthWallPatientSortable>(patients: T[]): T[] {
  return [...patients].sort((a, b) => {
    const aTime = lastMessageTime(a);
    const bTime = lastMessageTime(b);
    if (bTime !== aTime) return bTime - aTime;
    return patientLabel(a).localeCompare(patientLabel(b), "ru");
  });
}

export function bumpHealthWallPatientInList<T extends HealthWallPatientSortable>(
  patients: T[],
  patientUserId: string,
  patch: Partial<T>
): T[] {
  const idx = patients.findIndex((p) => p.patientUserId === patientUserId);
  if (idx < 0) return patients;
  const updated = { ...patients[idx], ...patch };
  const rest = patients.filter((_, i) => i !== idx);
  return sortHealthWallPatients([updated, ...rest]);
}
