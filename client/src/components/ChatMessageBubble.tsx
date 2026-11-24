import { memo, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import type { ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { Button } from "@/components/ui/button";
import { MessageReceiptIcons } from "@/components/MessageReceiptIcons";
import { getMessageReceiptStatus } from "@/lib/messageReceipt";
import { shouldShowDeletedMessagePlaque } from "@/lib/deletedMessageVisibility";
import { t } from "@/lib/i18n";

type ChatMessageBubbleProps = {
  msg: ConversationMessageWithAuthor;
  isOwn: boolean;
  isChannel: boolean;
  canInteractWithChannel: boolean;
  showReceiptIcons: boolean;
  peerLastReadAt?: string | null;
  onCommentsClick: () => void;
  setMessageRef: (id: string) => (el: HTMLDivElement | null) => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>, msg: ConversationMessageWithAuthor) => void;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, msg: ConversationMessageWithAuthor) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onTouchStart: (e: React.TouchEvent<HTMLElement>, msg: ConversationMessageWithAuthor) => void;
  onTouchMove: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  formatBubbleTime: (createdAt: string) => string;
  highlightQuery?: string;
  inlinePaymentSegmentIndex?: number | null;
  showPatientPhotoAnalysis?: boolean;
  photoAnalysisPending?: boolean;
  onPhotoAnalysis?: (messageId: string) => void;
  children: ReactNode;
};

function bubblePropsEqual(prev: ChatMessageBubbleProps, next: ChatMessageBubbleProps): boolean {
  const pm = prev.msg;
  const nm = next.msg;
  return (
    pm.id === nm.id &&
    pm.editedAt === nm.editedAt &&
    pm.deletedAt === nm.deletedAt &&
    pm.content === nm.content &&
    pm.messageType === nm.messageType &&
    pm.imageUrl === nm.imageUrl &&
    pm.pinnedAt === nm.pinnedAt &&
    pm.commentsCount === nm.commentsCount &&
    pm.isContentTruncated === nm.isContentTruncated &&
    pm.hasSponsorContent === nm.hasSponsorContent &&
    JSON.stringify(pm.reactions) === JSON.stringify(nm.reactions) &&
    JSON.stringify(pm.pollResults) === JSON.stringify(nm.pollResults) &&
    prev.isOwn === next.isOwn &&
    prev.isChannel === next.isChannel &&
    prev.canInteractWithChannel === next.canInteractWithChannel &&
    prev.showReceiptIcons === next.showReceiptIcons &&
    prev.peerLastReadAt === next.peerLastReadAt &&
    prev.highlightQuery === next.highlightQuery &&
    prev.inlinePaymentSegmentIndex === next.inlinePaymentSegmentIndex &&
    prev.showPatientPhotoAnalysis === next.showPatientPhotoAnalysis &&
    prev.photoAnalysisPending === next.photoAnalysisPending
  );
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  msg,
  isOwn,
  isChannel,
  canInteractWithChannel,
  showReceiptIcons,
  peerLastReadAt,
  onCommentsClick,
  setMessageRef,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  formatBubbleTime,
  showPatientPhotoAnalysis = false,
  photoAnalysisPending = false,
  onPhotoAnalysis,
  children,
}: ChatMessageBubbleProps) {
  if (msg.deletedAt && !shouldShowDeletedMessagePlaque(msg.deletedAt)) {
    return null;
  }
  const isDeleted = shouldShowDeletedMessagePlaque(msg.deletedAt);
  const isPhoto =
    !!msg.imageUrl &&
    msg.messageType !== "voice" &&
    msg.messageType !== "video" &&
    msg.messageType !== "file" &&
    msg.messageType !== "call";

  return (
    <div
      ref={setMessageRef(msg.id)}
      className={`group flex w-full transition-shadow duration-300 ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      {!isDeleted ? (
        <div className={isPhoto ? "min-w-0 w-full max-w-[85%] md:w-fit md:max-w-[min(85%,34rem)]" : "max-w-[85%]"}>
          <div
            onContextMenu={(e) => onContextMenu(e, msg)}
            onPointerDown={(e) => onPointerDown(e, msg)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
            onTouchStart={(e) => onTouchStart(e, msg)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            className={`message relative min-h-[2.75rem] min-w-28 rounded-2xl border px-2 pt-1 pb-1.5 select-none ${
              isPhoto ? "w-full md:w-fit " : ""
            }${
              isOwn
                ? "bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800 text-foreground"
                : "border-border/50 bg-stone-50 text-foreground shadow-sm dark:bg-stone-900/80"
            }`}
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
          >
            {msg.hasSponsorContent && (
              <span
                className="pointer-events-none absolute right-1.5 top-1 z-[1] flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-[11px] font-bold leading-none text-amber-800 dark:bg-amber-900/80 dark:text-amber-200"
                aria-hidden
                title={t.sponsorContentLabel}
              >
                $
              </span>
            )}
            {children}
            {isChannel && (
              <div className="mt-0.5 pt-0.5">
                <div className="my-0.5 h-px w-full bg-foreground/35" />
                <button
                  type="button"
                  className={`text-xs text-muted-foreground hover:text-foreground ${
                    isOwn ? "ml-auto block text-right" : ""
                  }`}
                  onClick={() => {
                    if (!canInteractWithChannel) return;
                    onCommentsClick();
                  }}
                >
                  {msg.commentsCount && msg.commentsCount > 0
                    ? `${msg.commentsCount} комментариев`
                    : "Комментировать"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className="message relative min-h-[2.75rem] min-w-28 max-w-[85%] rounded-2xl border border-dashed border-border/60 bg-muted/40 pl-2 pr-1.5 pt-1 pb-3.5 text-muted-foreground italic select-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-snug pr-7 pb-0.5">
            {t.messageDeleted}
          </p>
          <span className="pointer-events-none absolute bottom-0.5 right-1.5 flex items-center gap-0.5 text-[10px] leading-none tabular-nums select-none">
            <span className="text-muted-foreground">{formatBubbleTime(msg.createdAt)}</span>
            {isOwn && showReceiptIcons && (
              <MessageReceiptIcons
                status={getMessageReceiptStatus({
                  createdAt: msg.createdAt,
                  peerLastReadAt,
                })}
              />
            )}
          </span>
        </div>
      )}
      {showPatientPhotoAnalysis && !isDeleted && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={photoAnalysisPending}
          className="mb-1 ml-1.5 h-8 w-8 shrink-0 self-end rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted"
          aria-label={t.photoAnalysis}
          data-testid={`button-photo-analysis-${msg.id}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPhotoAnalysis?.(msg.id);
          }}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}, bubblePropsEqual);
