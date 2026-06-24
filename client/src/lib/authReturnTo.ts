const AUTH_RETURN_KEY = "authReturnTo";

function isValidReturnPath(path: string): boolean {
  return path.startsWith("/messenger");
}

export function saveAuthReturnTo(path: string): void {
  if (typeof window === "undefined" || !isValidReturnPath(path)) return;
  sessionStorage.setItem(AUTH_RETURN_KEY, path);
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
  return value && isValidReturnPath(value) ? value : null;
}

export function resolveAuthReturnTo(): string | null {
  return readAuthReturnFromQuery() ?? peekAuthReturnTo();
}

export function navigateToAuth(setLocation: (path: string) => void, returnTo: string): void {
  saveAuthReturnTo(returnTo);
  const query = `?return=${encodeURIComponent(returnTo)}`;
  setLocation(`/auth${query}`);
}
