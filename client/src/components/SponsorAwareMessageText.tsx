import { useMemo } from "react";
import {
  parseMessageBoldSegments,
  parseMessageSponsorSegments,
  parseMessageTagSegments,
  parseSponsorPlaceholderSegments,
  SPONSOR_PLACEHOLDER_MARKER,
} from "@shared/messageFormatting";
import { FormattedMessageText } from "@/components/FormattedMessageText";
import { SponsorLockedBlock } from "@/components/SponsorLockedBlock";
import ChannelSponsorSection from "@/components/ChannelSponsorSection";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SponsorAwareMessageTextProps = {
  text: string;
  className?: string;
  canViewSponsorContent: boolean;
  monetizationEnabled?: boolean;
  isContentTruncated?: boolean;
  conversationId?: string;
  activePaymentSegmentIndex?: number | null;
  onPaymentSegmentOpen?: (segmentIndex: number) => void;
  onPaymentFlowClose?: () => void;
  onPaymentSegmentRef?: (segmentIndex: number, el: HTMLDivElement | null) => void;
  onTagClick?: (tag: string) => void;
  highlightQuery?: string;
};

const segmentTextClass = "m-0 whitespace-pre-wrap break-words";

function normalizeSegmentDisplayText(text: string): string {
  return text.replace(/^\n+/, "");
}

function isTagOnlyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const tagSegments = parseMessageTagSegments(trimmed);
  return (
    tagSegments.length > 0 &&
    tagSegments.every((part) => part.type === "tag" || (part.type === "text" && !part.text.trim()))
  );
}

function renderSegmentContent(
  segmentText: string,
  keyPrefix: string,
  onTagClick?: (tag: string) => void,
  highlightQuery?: string
) {
  const boldSegments = parseMessageBoldSegments(segmentText);
  return boldSegments.map((seg, i) =>
    seg.bold ? (
      <strong key={`${keyPrefix}-b${i}`}>
        <FormattedMessageText
          text={seg.text}
          onTagClick={onTagClick}
          highlightQuery={highlightQuery}
          as="span"
          className="inline"
        />
      </strong>
    ) : (
      <FormattedMessageText
        key={`${keyPrefix}-p${i}`}
        text={seg.text}
        onTagClick={onTagClick}
        highlightQuery={highlightQuery}
        as="span"
        className="inline"
      />
    )
  );
}

export function SponsorAwareMessageText({
  text,
  className,
  canViewSponsorContent,
  monetizationEnabled = false,
  isContentTruncated = false,
  conversationId,
  activePaymentSegmentIndex = null,
  onPaymentSegmentOpen,
  onPaymentFlowClose,
  onPaymentSegmentRef,
  onTagClick,
  highlightQuery,
}: SponsorAwareMessageTextProps) {
  const segments = useMemo(() => {
    if (!monetizationEnabled) return null;
    const usesPlaceholder = text.includes(SPONSOR_PLACEHOLDER_MARKER);
    return canViewSponsorContent
      ? parseMessageSponsorSegments(text)
      : usesPlaceholder
        ? parseSponsorPlaceholderSegments(text)
        : parseMessageSponsorSegments(text);
  }, [text, monetizationEnabled, canViewSponsorContent]);

  if (!monetizationEnabled) {
    return (
      <FormattedMessageText
        text={text}
        className={className}
        onTagClick={onTagClick}
        highlightQuery={highlightQuery}
      />
    );
  }

  const firstSponsorSegmentIndex = segments!.findIndex((seg) => seg.sponsor);

  return (
    <div className={cn("space-y-1 text-sm leading-snug", className)}>
      {segments!.map((seg, i) => {
        const prevIsSponsor = i > 0 && segments![i - 1].sponsor;
        if (seg.sponsor && !canViewSponsorContent) {
          if (activePaymentSegmentIndex === i && conversationId) {
            return (
              <div
                key={i}
                ref={(el) => onPaymentSegmentRef?.(i, el)}
                className="my-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2"
              >
                <ChannelSponsorSection
                  conversationId={conversationId}
                  isOwner={false}
                  embedded
                  tierTypes={["content"]}
                  initialSelectedTier="content"
                  onPaymentFlowClose={onPaymentFlowClose}
                />
              </div>
            );
          }
          return (
            <SponsorLockedBlock
              key={i}
              onClick={() => onPaymentSegmentOpen?.(i)}
            />
          );
        }
        const displayText = normalizeSegmentDisplayText(seg.text);
        if (!displayText.trim()) return null;
        if (seg.sponsor && canViewSponsorContent) {
          return (
            <div
              key={i}
              className="my-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1"
            >
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {t.sponsorContentLabel}
              </span>
              <p className={segmentTextClass}>
                {renderSegmentContent(displayText, `seg${i}`, onTagClick, highlightQuery)}
              </p>
            </div>
          );
        }
        return (
          <p
            key={i}
            className={cn(
              segmentTextClass,
              prevIsSponsor && isTagOnlyText(displayText) ? "pt-3" : "pb-0.5"
            )}
          >
            {renderSegmentContent(displayText, `seg${i}`, onTagClick, highlightQuery)}
          </p>
        );
      })}
      {!canViewSponsorContent && isContentTruncated && (
        <button
          type="button"
          onClick={() =>
            onPaymentSegmentOpen?.(
              firstSponsorSegmentIndex >= 0 ? firstSponsorSegmentIndex : 0
            )
          }
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          {t.readMore}
        </button>
      )}
    </div>
  );
}
