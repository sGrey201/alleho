import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  hints: Array<string | undefined>;
  className?: string;
  pulse?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function QuestionnaireHintPopover({ hints, className, pulse, onOpenChange }: Props) {
  const text = hints.filter((h): h is string => !!h);
  if (text.length === 0) return null;

  return (
    <Popover
      open={pulse ? true : undefined}
      onOpenChange={(open) => {
        onOpenChange?.(open);
      }}
    >
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-5 w-5 shrink-0", pulse && "animate-hint-pulse", className)}
          aria-label="Подсказка"
        >
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] max-w-72" side="top" align="start">
        <div className="space-y-1 text-sm text-muted-foreground">
          {text.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function QuestionnaireHintText({ hint, className }: { hint?: string; className?: string }) {
  if (!hint) return null;
  return <p className={cn("text-xs text-muted-foreground", className)}>{hint}</p>;
}
