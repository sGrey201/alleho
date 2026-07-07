import { useMemo } from "react";
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
const linkClassName = "text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400";
const highlightMarkClass = "rounded-sm bg-yellow-300/80 text-inherit dark:bg-yellow-500/40";
const tagHighlightClass = "rounded-sm bg-yellow-300/80 dark:bg-yellow-500/40";
const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

type TextUrlSegment =
  | { type: "text"; text: string }
  | { type: "url"; text: string; href: string };

function trimTrailingUrlPunctuation(url: string): { cleanUrl: string; trailing: string } {
  let cleanUrl = url;
  let trailing = "";
  while (/[),.!?:;]$/.test(cleanUrl)) {
    trailing = cleanUrl.slice(-1) + trailing;
    cleanUrl = cleanUrl.slice(0, -1);
  }
  return { cleanUrl, trailing };
}

function ensureUrlProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function splitTextAndUrls(text: string): TextUrlSegment[] {
  const segments: TextUrlSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(urlRegex.source, "gi");

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const rawUrl = match[0];
    const { cleanUrl, trailing } = trimTrailingUrlPunctuation(rawUrl);
    if (cleanUrl) {
      segments.push({
        type: "url",
        text: cleanUrl,
        href: ensureUrlProtocol(cleanUrl),
      });
    }
    if (trailing) {
      segments.push({ type: "text", text: trailing });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

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
        {splitTextAndUrls(seg.text).map((part, partIndex) => {
          if (part.type === "url") {
            return (
              <a
                key={`${keyPrefix}-${j}-u${partIndex}`}
                href={part.href}
                target="_blank"
                rel="noreferrer noopener"
                className={linkClassName}
                onClick={(e) => e.stopPropagation()}
              >
                {part.text}
              </a>
            );
          }
          return (
            <span key={`${keyPrefix}-${j}-t${partIndex}`}>
              {renderHighlightedText(part.text, `${keyPrefix}-${j}-${partIndex}`, highlightQuery)}
            </span>
          );
        })}
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
  const segments = useMemo(() => parseMessageBoldSegments(text), [text]);
  const content = useMemo(
    () =>
      segments.map((seg, i) =>
        seg.bold ? (
          <strong key={i}>{renderPlainWithTags(seg.text, `b${i}`, onTagClick, highlightQuery)}</strong>
        ) : (
          <span key={i}>{renderPlainWithTags(seg.text, `p${i}`, onTagClick, highlightQuery)}</span>
        )
      ),
    [segments, onTagClick, highlightQuery]
  );
  const Tag = as;

  return (
    <Tag className={cn("whitespace-pre-wrap break-words pb-0.5 text-sm leading-snug", className)}>
      {content}
    </Tag>
  );
}
