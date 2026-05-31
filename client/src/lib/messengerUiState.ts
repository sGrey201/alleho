export type MessengerFolder = "doctors" | "patients" | "groups" | "channels";

const STORAGE_KEY = "messenger-ui-state";

const VALID_FOLDERS = new Set<MessengerFolder>(["doctors", "patients", "groups", "channels"]);

export type MessengerUiState = {
  folder: MessengerFolder;
  path?: string;
};

export function readMessengerUiState(): MessengerUiState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MessengerUiState>;
    if (!parsed.folder || !VALID_FOLDERS.has(parsed.folder)) return null;
    const path =
      typeof parsed.path === "string" && parsed.path.startsWith("/messenger") ? parsed.path : undefined;
    return { folder: parsed.folder, path };
  } catch {
    return null;
  }
}

export function writeMessengerUiState(partial: Partial<MessengerUiState>) {
  const prev = readMessengerUiState() ?? { folder: "patients" as MessengerFolder };
  const next: MessengerUiState = {
    folder: partial.folder ?? prev.folder,
    path: partial.path !== undefined ? partial.path : prev.path,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
