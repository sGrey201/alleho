import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";

const YANDEX_METRIKA_ID = 114272877;

type YmHit = (
  counterId: number,
  method: "hit",
  url: string,
  options?: { referer?: string; title?: string },
) => void;

/**
 * Sends a pageview on client-side navigations. The first view is already
 * reported by the counter in index.html.
 */
export function YandexMetrika() {
  const [location] = useLocation();
  const search = useSearch();
  const trackedUrl = useRef(
    (window as Window & { __hovialYmUrl?: string }).__hovialYmUrl ?? null,
  );

  useEffect(() => {
    const href = window.location.href;
    if (trackedUrl.current === href) return;

    const referer = trackedUrl.current ?? document.referrer;
    trackedUrl.current = href;

    const ym = (window as Window & { ym?: YmHit }).ym;
    ym?.(YANDEX_METRIKA_ID, "hit", href, {
      referer,
      title: document.title,
    });
  }, [location, search]);

  return null;
}
