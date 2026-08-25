import fs from "fs";
import path from "path";

export function getClientAppVersion(): string {
  const filePath = path.resolve(import.meta.dirname, "public", "app-version.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // missing in `npm run dev` — no production client bundle
  }
  return process.env.APP_BUILD_ID?.trim() || "dev";
}
