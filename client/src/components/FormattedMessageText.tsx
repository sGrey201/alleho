import {
  parseMessageBoldSegments,
  parseMessageTagSegments,
  splitByHighlight,
} from "@shared/messageFormatting";
import { cn } from "@/lib/utils";

type FormattedMessageTextProps = {
  text: string;
  className?: string;
  onTagClick?: (tag: string) => void;
  highlightQuery?: string;
  as?: "p" | "span";
};

const tagClassName = "font-normal text-blue-600 hover:underline dark:text-blue-400";
const highlightMarkClass = "rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-500/40";
const tagHighlightClass = "rounded-sm bg-yellow-300/80 dark:bg-yellow-500/40";

function renderHighlightedText(text: string, keyPrefix: string, highlightQuery?: string) {
  if (!highlightQuery?.trim()) {
    return text;
  }
  return splitByHighlight(text, highlightQuery).map((seg, k) =>
    seg.highlighted ? (
      <mark key={`${keyPrefix}-h${k}`} className={highlightMarkClass}>
        {seg.text}
      </mark>
    ) : (
      <span key={`${keyPrefix}-h${k}`}>{seg.text}</span>
    )
  );
}

function renderPlainWithTags(
  text: string,
  keyPrefix: string,
  onTagClick?: (tag: string) => void,
  highlightQuery?: string
) {
  const tagSegments = parseMessageTagSegments(text);
  const queryLower = highlightQuery?.trim().toLowerCase() ?? "";

  return tagSegments.map((seg, j) => {
    if (seg.type === "tag") {
      const tagHighlighted = queryLower.length > 0 && seg.text.toLowerCase().includes(queryLower);
      if (onTagClick) {
        return (
          <button
            key={`${keyPrefix}-${j}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick(seg.text);
            }}
            className={cn(
              "inline cursor-pointer border-0 bg-transparent p-0 align-baseline",
              tagClassName,
              tagHighlighted && tagHighlightClass
            )}
          >
            {seg.text}
          </button>
        );
      }
      return (
        <span key={`${keyPrefix}-${j}`} className={cn(tagClassName, tagHighlighted && tagHighlightClass)}>
          {seg.text}
        </span>
      );
    }
    return (
      <span key={`${keyPrefix}-${j}`}>
        {renderHighlightedText(seg.text, `${keyPrefix}-${j}`, highlightQuery)}
      </span>
    );
  });
}

export function FormattedMessageText({
  text,
  className,
  onTagClick,
  highlightQuery,
  as = "p",
}: FormattedMessageTextProps) {
  const segments = parseMessageBoldSegments(text);
  const Tag = as;

  return (
    <Tag className={cn("whitespace-pre-wrap break-words pb-0.5 text-sm leading-snug", className)}>
      {segments.map((seg, i) =>
        seg.bold ? (
          <strong key={i}>{renderPlainWithTags(seg.text, `b${i}`, onTagClick, highlightQuery)}</strong>
        ) : (
          <span key={i}>{renderPlainWithTags(seg.text, `p${i}`, onTagClick, highlightQuery)}</span>
        )
      )}
    </Tag>
  );
}
