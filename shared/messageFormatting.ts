export const BOLD_MARKER = "**";

const BOLD_REGEX = /\*\*([^*\n]+)\*\*/g;

export type MessageBoldSegment = {
  bold: boolean;
  text: string;
};

/** Remove paired **...** markers, leaving inner text. Unmatched ** are left as-is. */
export function stripMessageFormatting(text: string): string {
  return text.replace(BOLD_REGEX, "$1");
}

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
