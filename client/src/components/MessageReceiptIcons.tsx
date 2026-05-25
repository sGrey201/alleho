import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageReceiptStatus } from "@/lib/messageReceipt";
import { t } from "@/lib/i18n";

type MessageReceiptIconsProps = {
  status: MessageReceiptStatus;
  className?: string;
};

const ariaByStatus: Record<MessageReceiptStatus, string> = {
  sent: t.messageReceiptSent,
  read: t.messageReceiptRead,
};

const receiptBlueClass = "text-blue-600 dark:text-blue-400";

export function MessageReceiptIcons({ status, className }: MessageReceiptIconsProps) {
  const checkClass = cn("h-3 w-3 shrink-0", receiptBlueClass, className);

  if (status === "read") {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center -space-x-1.5", receiptBlueClass, className)}
        role="img"
        aria-label={ariaByStatus[status]}
      >
        <Check className={checkClass} strokeWidth={2.5} />
        <Check className={checkClass} strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex shrink-0", receiptBlueClass, className)}
      role="img"
      aria-label={ariaByStatus[status]}
    >
      <Check className={checkClass} strokeWidth={2.5} />
    </span>
  );
}
