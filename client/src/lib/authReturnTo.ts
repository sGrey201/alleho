const AUTH_RETURN_KEY = "authReturnTo";

const AUTH_FLOW_PREFIXES = ["/auth", "/invite/accept", "/reset-password", "/onboarding/role"];

function getPathname(path: string): string {
  return path.split("?")[0] ?? "";
}

function normalizeReturnPath(path: string): string {
  const [pathname, search = ""] = path.split("?");
  const query = search ? `?${search}` : "";

  if (pathname === "/profile") {
    return `/messenger/profile${query}`;
  }
  const profileMatch = pathname.match(/^\/profile\/([^/]+)$/);
  if (profileMatch) {
    return `/messenger/profile/${profileMatch[1]}${query}`;
  }
  if (pathname === "/health-wall") {
    return "/messenger";
  }
  const healthWallMatch = pathname.match(/^\/health-wall\/([^/]+)$/);
  if (healthWallMatch) {
    return "/messenger";
  }

  return path;
}

function isValidReturnPath(path: string): boolean {
  const pathname = getPathname(path);
  if (!pathname || pathname === "/") return false;
  return !AUTH_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function saveAuthReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeReturnPath(path);
  if (!isValidReturnPath(normalized)) return;
  sessionStorage.setItem(AUTH_RETURN_KEY, normalized);
}

export function peekAuthReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(AUTH_RETURN_KEY);
  return value && isValidReturnPath(value) ? value : null;
}

export function consumeAuthReturnTo(): string | null {
  const value = peekAuthReturnTo();
  if (value) sessionStorage.removeItem(AUTH_RETURN_KEY);
  return value;
}

export function readAuthReturnFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("return");
  if (!value) return null;
  const normalized = normalizeReturnPath(value);
  return isValidReturnPath(normalized) ? normalized : null;
}

export function resolveAuthReturnTo(): string | null {
  return readAuthReturnFromQuery() ?? peekAuthReturnTo();
}

/** Current browser location to restore after login (pathname + search). */
export function getRequestedReturnPath(): string {
  if (typeof window === "undefined") return "";
  return normalizeReturnPath(`${window.location.pathname}${window.location.search}`);
}

/** Auth page URL that preserves the intended destination after login. */
export function buildAuthRedirectPath(returnTo?: string): string {
  const path = returnTo ? normalizeReturnPath(returnTo) : getRequestedReturnPath();
  if (!isValidReturnPath(path)) return "/auth";
  saveAuthReturnTo(path);
  return `/auth?return=${encodeURIComponent(path)}`;
}

export function navigateToAuth(setLocation: (path: string) => void, returnTo: string): void {
  setLocation(buildAuthRedirectPath(returnTo));
}

export function navigateToAuthRegister(setLocation: (path: string) => void, returnTo: string): void {
  const path = normalizeReturnPath(returnTo);
  if (isValidReturnPath(path)) {
    saveAuthReturnTo(path);
    setLocation(`/auth/register?return=${encodeURIComponent(path)}`);
    return;
  }
  setLocation("/auth/register");
}
