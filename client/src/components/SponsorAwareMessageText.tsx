import {
  parseMessageBoldSegments,
  parseMessageSponsorSegments,
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
  onTagClick?: (tag: string) => void;
  highlightQuery?: string;
};

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
  onTagClick,
  highlightQuery,
}: SponsorAwareMessageTextProps) {
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

  const usesPlaceholder = text.includes(SPONSOR_PLACEHOLDER_MARKER);
  const segments = canViewSponsorContent
    ? parseMessageSponsorSegments(text)
    : usesPlaceholder
      ? parseSponsorPlaceholderSegments(text)
      : parseMessageSponsorSegments(text);

  const firstSponsorSegmentIndex = segments.findIndex((seg) => seg.sponsor);

  return (
    <div className={cn("text-sm leading-snug", className)}>
      {segments.map((seg, i) => {
        if (seg.sponsor && !canViewSponsorContent) {
          if (activePaymentSegmentIndex === i && conversationId) {
            return (
              <div
                key={i}
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
        if (!seg.text) return null;
        if (seg.sponsor && canViewSponsorContent) {
          return (
            <div
              key={i}
              className="my-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1"
            >
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {t.sponsorContentLabel}
              </span>
              <p className="whitespace-pre-wrap break-words pb-0.5">
                {renderSegmentContent(seg.text, `seg${i}`, onTagClick, highlightQuery)}
              </p>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words pb-0.5">
            {renderSegmentContent(seg.text, `seg${i}`, onTagClick, highlightQuery)}
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
