import { clearOfflineCache } from "@/lib/clearOfflineCache";
import { APP_HOME_PATH } from "@shared/brand";

export async function performLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  await clearOfflineCache();
  window.location.href = APP_HOME_PATH;
}
