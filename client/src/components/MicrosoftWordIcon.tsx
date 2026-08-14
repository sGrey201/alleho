import { cn } from "@/lib/utils";

type MicrosoftWordIconProps = {
  className?: string;
};

/** Microsoft Word file icon (Office 2007/2010 style). */
export function MicrosoftWordIcon({ className }: MicrosoftWordIconProps) {
  return (
    <img
      src="/ms-word-icon.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("size-6 object-contain", className)}
    />
  );
}
