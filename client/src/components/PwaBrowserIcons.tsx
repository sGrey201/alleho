import { cn } from "@/lib/utils";

type BrowserIconProps = {
  className?: string;
};

function BrowserIconImage({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={cn("h-7 w-7 shrink-0 object-contain", className)}
    />
  );
}

export function SafariBrowserIcon({ className }: BrowserIconProps) {
  return <BrowserIconImage src="/browser-safari.png" className={className} />;
}

export function ChromeBrowserIcon({ className }: BrowserIconProps) {
  return <BrowserIconImage src="/browser-chrome.png" className={className} />;
}

export function YandexBrowserIcon({ className }: BrowserIconProps) {
  return <BrowserIconImage src="/browser-yandex.png" className={className} />;
}
