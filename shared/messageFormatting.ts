export const BOLD_MARKER = "**";
export const SPONSOR_MARKER = "$$";

const BOLD_REGEX = /\*\*([^*\n]+)\*\*/g;
const SPONSOR_REGEX = /\$\$([^$]+?)\$\$/g;
const SPONSOR_PLACEHOLDER = "[[SPONSOR]]";

export const SPONSOR_CONTENT_MAX_LINES = 30;

export type MessageBoldSegment = {
  bold: boolean;
  text: string;
};

export type MessageSponsorSegment = {
  sponsor: boolean;
  text: string;
};

export const TAG_REGEX = /#([a-zA-Z\u0400-\u04FF0-9_-]+)/g;

export type MessageTagSegment = {
  type: "text" | "tag";
  text: string;
  tag?: string;
};

/** Split plain text into segments with #hashtags. */
export function parseMessageTagSegments(text: string): MessageTagSegment[] {
  const segments: MessageTagSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(TAG_REGEX.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "tag", text: match[0], tag: match[1] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

export type HighlightSegment = {
  highlighted: boolean;
  text: string;
};

/** Split text into plain and highlighted segments for a case-insensitive query. */
export function splitByHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ highlighted: false, text }];

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery, lastIndex);

  while (index !== -1) {
    if (index > lastIndex) {
      segments.push({ highlighted: false, text: text.slice(lastIndex, index) });
    }
    segments.push({ highlighted: true, text: text.slice(index, index + q.length) });
    lastIndex = index + q.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    segments.push({ highlighted: false, text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ highlighted: false, text }];
}

/** Remove paired **...** markers, leaving inner text. Unmatched ** are left as-is. */
export function stripMessageFormatting(text: string): string {
  return text.replace(BOLD_REGEX, "$1");
}

/** Remove paired $$...$$ sponsor sections entirely. */
export function stripSponsorSections(text: string): string {
  return text.replace(SPONSOR_REGEX, "");
}

/** Replace $$...$$ with a placeholder for non-sponsor rendering. */
export function replaceSponsorSectionsWithPlaceholder(text: string): string {
  return text.replace(SPONSOR_REGEX, SPONSOR_PLACEHOLDER);
}

export function hasSponsorSections(text: string): boolean {
  return new RegExp(SPONSOR_REGEX.source).test(text);
}

export function countContentLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/** Truncate to maxLines; returns truncated text and whether truncation occurred. */
export function truncateToLines(
  text: string,
  maxLines: number
): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

/** Filter message content for non-sponsor viewers when monetization is enabled. */
export function filterMessageForNonSponsor(
  content: string,
  options: { monetizationEnabled: boolean }
): {
  content: string;
  hasSponsorContent: boolean;
  isTruncated: boolean;
} {
  if (!content || !options.monetizationEnabled) {
    return { content, hasSponsorContent: false, isTruncated: false };
  }

  const hadSponsor = hasSponsorSections(content);
  let filtered = replaceSponsorSectionsWithPlaceholder(content);
  const { text: truncated, truncated: isTruncated } = truncateToLines(
    filtered,
    SPONSOR_CONTENT_MAX_LINES
  );
  filtered = truncated;

  return {
    content: filtered,
    hasSponsorContent: hadSponsor,
    isTruncated,
  };
}

/** Split text into sponsor and public segments for rendering. */
export function parseMessageSponsorSegments(text: string): MessageSponsorSegment[] {
  const segments: MessageSponsorSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(SPONSOR_REGEX.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ sponsor: false, text: text.slice(lastIndex, match.index) });
    }
    segments.push({ sponsor: true, text: match[1] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ sponsor: false, text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ sponsor: false, text }];
}

export function isSelectionSponsorWrapped(value: string, start: number, end: number): boolean {
  return (
    value.slice(start - SPONSOR_MARKER.length, start) === SPONSOR_MARKER &&
    value.slice(end, end + SPONSOR_MARKER.length) === SPONSOR_MARKER
  );
}

/** Wrap selection in $$...$$ or unwrap if already wrapped. */
export function wrapSelectionWithSponsor(
  value: string,
  start: number,
  end: number
): BoldWrapResult {
  if (start === end) {
    const placeholder = "текст";
    const wrapped = `${SPONSOR_MARKER}${placeholder}${SPONSOR_MARKER}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    const innerStart = start + SPONSOR_MARKER.length;
    const innerEnd = innerStart + placeholder.length;
    return { value: next, selectionStart: innerStart, selectionEnd: innerEnd };
  }

  if (isSelectionSponsorWrapped(value, start, end)) {
    const next =
      value.slice(0, start - SPONSOR_MARKER.length) +
      value.slice(start, end) +
      value.slice(end + SPONSOR_MARKER.length);
    const newStart = start - SPONSOR_MARKER.length;
    const newEnd = end - SPONSOR_MARKER.length;
    return { value: next, selectionStart: newStart, selectionEnd: newEnd };
  }

  const selected = value.slice(start, end);
  const next =
    value.slice(0, start) + SPONSOR_MARKER + selected + SPONSOR_MARKER + value.slice(end);
  const innerStart = start + SPONSOR_MARKER.length;
  const innerEnd = innerStart + selected.length;
  return { value: next, selectionStart: innerStart, selectionEnd: innerEnd };
}

/** Parse text containing [[SPONSOR]] placeholders (server-filtered content). */
export function parseSponsorPlaceholderSegments(text: string): MessageSponsorSegment[] {
  const parts = text.split(SPONSOR_PLACEHOLDER);
  const segments: MessageSponsorSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) segments.push({ sponsor: false, text: parts[i] });
    if (i < parts.length - 1) segments.push({ sponsor: true, text: "" });
  }
  return segments.length > 0 ? segments : [{ sponsor: false, text }];
}

export const SPONSOR_PLACEHOLDER_MARKER = SPONSOR_PLACEHOLDER;

/** Split text into plain and bold segments for rendering. */
export function parseMessageBoldSegments(text: string): MessageBoldSegment[] {
  const segments: MessageBoldSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(BOLD_REGEX.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ bold: false, text: text.slice(lastIndex, match.index) });
    }
    segments.push({ bold: true, text: match[1] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ bold: false, text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ bold: false, text }];
}

export function isSelectionBoldWrapped(value: string, start: number, end: number): boolean {
  return (
    value.slice(start - BOLD_MARKER.length, start) === BOLD_MARKER &&
    value.slice(end, end + BOLD_MARKER.length) === BOLD_MARKER
  );
}

export type BoldWrapResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

/** Wrap selection in **...** or unwrap if already wrapped. */
export function wrapSelectionWithBold(
  value: string,
  start: number,
  end: number
): BoldWrapResult {
  if (start === end) {
    const placeholder = "текст";
    const wrapped = `${BOLD_MARKER}${placeholder}${BOLD_MARKER}`;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    const innerStart = start + BOLD_MARKER.length;
    const innerEnd = innerStart + placeholder.length;
    return { value: next, selectionStart: innerStart, selectionEnd: innerEnd };
  }

  if (isSelectionBoldWrapped(value, start, end)) {
    const next =
      value.slice(0, start - BOLD_MARKER.length) +
      value.slice(start, end) +
      value.slice(end + BOLD_MARKER.length);
    const newStart = start - BOLD_MARKER.length;
    const newEnd = end - BOLD_MARKER.length;
    return { value: next, selectionStart: newStart, selectionEnd: newEnd };
  }

  const selected = value.slice(start, end);
  const next =
    value.slice(0, start) + BOLD_MARKER + selected + BOLD_MARKER + value.slice(end);
  const innerStart = start + BOLD_MARKER.length;
  const innerEnd = innerStart + selected.length;
  return { value: next, selectionStart: innerStart, selectionEnd: innerEnd };
}

/** Insert text at the current selection/caret position. */
export function insertTextAtCursor(
  value: string,
  insert: string,
  start: number,
  end: number
): BoldWrapResult {
  const next = value.slice(0, start) + insert + value.slice(end);
  const cursor = start + insert.length;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}
