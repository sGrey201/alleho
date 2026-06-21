import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { truncateMessageForPreview } from "@shared/messageFormatting";
import { t } from "@/lib/i18n";

type CollapsibleMessageTextProps = {
  text: string;
  enabled?: boolean;
  className?: string;
  onToggleExpand?: () => void;
  children: (displayText: string) => ReactNode;
};

export function CollapsibleMessageText({
  text,
  enabled = true,
  className,
  onToggleExpand,
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

  if (!enabled || !preview.isTruncated) {
    return <div className={className}>{children(text)}</div>;
  }

  const displayText = expanded ? text : preview.text;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

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
          {expanded ? t.sponsorPaymentCollapse : t.readMore}
        </button>
      </div>
    </div>
  );
}
