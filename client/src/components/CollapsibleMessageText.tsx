import { useMemo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { truncateMessageForPreview } from "@shared/messageFormatting";
import { t } from "@/lib/i18n";

type CollapsibleMessageTextProps = {
  text: string;
  enabled?: boolean;
  className?: string;
  onToggleExpand?: () => void;
  /** Guest preview: show truncated text and redirect instead of expanding. */
  guestPreviewMode?: boolean;
  onGuestReadFull?: () => void;
  children: (displayText: string) => ReactNode;
};

export function CollapsibleMessageText({
  text,
  enabled = true,
  className,
  onToggleExpand,
  guestPreviewMode = false,
  onGuestReadFull,
  children,
}: CollapsibleMessageTextProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => truncateMessageForPreview(text), [text]);
  const pendingScrollTopRef = useRef<number | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    const top = pendingScrollTopRef.current;
    if (root == null || top == null) return;
    root.scrollTop = top;
    pendingScrollTopRef.current = null;
  }, [expanded]);

  const isTruncated = preview.isTruncated || guestPreviewMode;

  if (!enabled || !isTruncated) {
    return <div className={className}>{children(text)}</div>;
  }

  const displayText = guestPreviewMode || !expanded ? preview.text : text;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (guestPreviewMode) {
      onGuestReadFull?.();
      return;
    }

    const scrollRoot = e.currentTarget.closest(".chat-messages-pane") as HTMLElement | null;
    if (scrollRoot) {
      scrollRootRef.current = scrollRoot;
      pendingScrollTopRef.current = scrollRoot.scrollTop;
    }

    onToggleExpand?.();
    setExpanded((v) => !v);
  };

  return (
    <div className={className}>
      {children(displayText)}
      <div className="mt-3 w-full text-left">
        <button
          type="button"
          className="text-sm font-semibold text-primary hover:underline"
          onClick={handleToggle}
        >
          {guestPreviewMode ? t.readFull : expanded ? t.sponsorPaymentCollapse : t.readMore}
        </button>
      </div>
    </div>
  );
}
