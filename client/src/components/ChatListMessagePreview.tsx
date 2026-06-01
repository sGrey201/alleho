import { cn } from "@/lib/utils";
import { normalizeMessengerListPreview } from "@shared/messengerMessagePreview";

type Props = {
  preview: string;
  className?: string;
  multiline?: boolean;
};

export default function ChatListMessagePreview({ preview, className, multiline = false }: Props) {
  const text = normalizeMessengerListPreview(preview) ?? preview;

  return (
    <p
      className={cn(
        "text-[13px] text-muted-foreground mt-0.5",
        multiline ? "line-clamp-2 break-words leading-snug" : "truncate",
        className
      )}
    >
      {text}
    </p>
  );
}
