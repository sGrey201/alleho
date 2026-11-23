import { useMemo } from "react";
import { Send } from "lucide-react";
import {
  parseMessageBoldSegments,
  parseMessageQuestionSegments,
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
  enableQuestionActions?: boolean;
  onQuestionClick?: (question: string) => void;
  questionSendPending?: boolean;
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

function renderBoldText(
  text: string,
  keyPrefix: string,
  onTagClick?: (tag: string) => void,
  highlightQuery?: string
) {
  return parseMessageBoldSegments(text).map((seg, i) =>
    seg.bold ? (
      <strong key={`${keyPrefix}-b${i}`}>
        {renderPlainWithTags(seg.text, `${keyPrefix}-b${i}`, onTagClick, highlightQuery)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-p${i}`}>
        {renderPlainWithTags(seg.text, `${keyPrefix}-p${i}`, onTagClick, highlightQuery)}
      </span>
    )
  );
}

export function FormattedMessageText({
  text,
  className,
  onTagClick,
  highlightQuery,
  as = "p",
  enableQuestionActions = false,
  onQuestionClick,
  questionSendPending = false,
}: FormattedMessageTextProps) {
  const questionSegments = useMemo(
    () => (enableQuestionActions ? parseMessageQuestionSegments(text) : null),
    [enableQuestionActions, text]
  );
  const plainContent = useMemo(
    () => (questionSegments ? null : renderBoldText(text, "t", onTagClick, highlightQuery)),
    [questionSegments, text, onTagClick, highlightQuery]
  );

  if (questionSegments && onQuestionClick) {
    return (
      <div className={cn("pb-0.5 text-sm leading-snug", className)}>
        {questionSegments.map((seg, i) =>
          seg.type === "question" ? (
            <button
              key={`q${i}`}
              type="button"
              disabled={questionSendPending}
              className="my-1 flex w-full items-start gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-2 text-left text-sm text-foreground disabled:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                onQuestionClick(seg.text);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Send className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{seg.text}</span>
            </button>
          ) : seg.text ? (
            <span key={`t${i}`} className="whitespace-pre-wrap break-words">
              {renderBoldText(seg.text, `t${i}`, onTagClick, highlightQuery)}
            </span>
          ) : null
        )}
      </div>
    );
  }

  const Tag = as;
  return (
    <Tag className={cn("whitespace-pre-wrap break-words pb-0.5 text-sm leading-snug", className)}>
      {plainContent}
    </Tag>
  );
}
