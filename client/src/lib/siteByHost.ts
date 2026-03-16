/**
 * Определение «раздела» по пути (один домен alleho.ru, поддомены не используются).
 */
export type Site = "landing" | "portraits" | "chat" | "wall";

export function getSite(): Site {
  if (typeof window === "undefined") return "portraits";
  const path = window.location.pathname;
  if (path === "/" || path === "") return "landing";
  if (path.startsWith("/portraits") || path.startsWith("/article") || path.startsWith("/remedies") || path.startsWith("/situations")) return "portraits";
  if (path.startsWith("/messenger")) return "chat";
  if (path.startsWith("/health-wall")) return "wall";
  return "portraits";
}

export function getChatBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/messenger`;
}

export function getWallBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/health-wall`;
}

export function getPortraitsBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/portraits`;
}
