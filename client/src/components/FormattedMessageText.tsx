import { parseMessageBoldSegments } from "@shared/messageFormatting";
import { cn } from "@/lib/utils";

type FormattedMessageTextProps = {
  text: string;
  className?: string;
};

export function FormattedMessageText({ text, className }: FormattedMessageTextProps) {
  const segments = parseMessageBoldSegments(text);

  return (
    <p className={cn("whitespace-pre-wrap break-words pb-0.5 text-sm leading-snug", className)}>
      {segments.map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
      )}
    </p>
  );
}
