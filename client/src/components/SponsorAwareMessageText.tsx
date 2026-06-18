import {
  parseMessageBoldSegments,
  parseMessageSponsorSegments,
  parseSponsorPlaceholderSegments,
  SPONSOR_PLACEHOLDER_MARKER,
} from "@shared/messageFormatting";
import { FormattedMessageText } from "@/components/FormattedMessageText";
import { SponsorLockedBlock } from "@/components/SponsorLockedBlock";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SponsorAwareMessageTextProps = {
  text: string;
  className?: string;
  canViewSponsorContent: boolean;
  monetizationEnabled?: boolean;
  isContentTruncated?: boolean;
  onTagClick?: (tag: string) => void;
  highlightQuery?: string;
  onSponsorCtaClick?: () => void;
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
  onTagClick,
  highlightQuery,
  onSponsorCtaClick,
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

  return (
    <div className={cn("text-sm leading-snug", className)}>
      {segments.map((seg, i) => {
        if (seg.sponsor && !canViewSponsorContent) {
          return <SponsorLockedBlock key={i} onClick={onSponsorCtaClick} />;
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
          onClick={onSponsorCtaClick}
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          {t.readMore}
        </button>
      )}
    </div>
  );
}
