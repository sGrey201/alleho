import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatArticleTitle(tags: { name: string; category: string }[]): string {
  const sortedTags = [...tags].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'situation' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  
  const title = sortedTags.map(tag => tag.name).join(', ');
  
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Resolve S3/Yandex URL or storage key to app-served /objects/... path. */
function objectPathFromStorageUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (!url.hostname.includes("storage.yandexcloud.net")) return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return undefined;
    if (parts[0] === "uploads") return `/objects/${parts.join("/")}`;
    if (parts.length >= 2 && parts[1] === "uploads") {
      return `/objects/${parts.slice(1).join("/")}`;
    }
    if (parts.length === 1) return `/objects/uploads/${parts[0]}`;
    return `/objects/${parts.slice(1).join("/")}`;
  } catch {
    return undefined;
  }
}

/** Avatar image src from users.profile_image_url (app-served /objects/... paths). */
export function profileAvatarSrc(profileImageUrl?: string | null): string | undefined {
  if (!profileImageUrl?.trim()) return undefined;
  const raw = profileImageUrl.trim();
  if (raw.startsWith("/objects/")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return objectPathFromStorageUrl(raw) ?? raw;
  }
  if (raw.startsWith("objects/")) return `/${raw}`;
  if (raw.startsWith("uploads/")) return `/objects/${raw}`;
  return raw.startsWith("/") ? raw : `/${raw}`;
}
