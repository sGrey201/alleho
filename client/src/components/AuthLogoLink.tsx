import { Link } from "wouter";

/** hovial logo on auth/invite screens — links to the landing page. */
export function AuthLogoLink() {
  return (
    <Link
      href="/"
      className="mx-auto block w-full max-w-[280px] rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="На главную"
    >
      <img
        src="/auth-logo.png"
        alt="hovial"
        className="h-auto w-full object-contain"
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
