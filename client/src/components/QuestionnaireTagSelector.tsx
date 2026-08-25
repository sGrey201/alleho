import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { t } from "@/lib/i18n";
import type { QuestionnaireHintsMode, QuestionnaireTagEntry } from "@shared/questionnaireTypes";
import { QuestionnaireHintPopover, QuestionnaireHintText } from "@/components/QuestionnaireHintPopover";
import { cn } from "@/lib/utils";

type TagDef = { id: string; label: string; hint?: string };

type Props = {
  tags: TagDef[];
  selectedEntries: QuestionnaireTagEntry[];
  onToggleTag: (tagKey: string) => void;
  onUpdateDescription: (tagKey: string, description: string) => void;
  onBlur?: () => void;
  hideUnselected?: boolean;
  readOnly?: boolean;
  hintsMode?: QuestionnaireHintsMode;
  flaggedTagIds?: string[];
  onToggleFlag?: (tagKey: string) => void;
};

export function QuestionnaireTagSelector({
  tags,
  selectedEntries,
  onToggleTag,
  onUpdateDescription,
  onBlur,
  hideUnselected,
  readOnly,
  hintsMode = "icon",
  flaggedTagIds = [],
  onToggleFlag,
}: Props) {
  const selectedKeys = selectedEntries.map((e) => e.tagKey);
  const [justSelected, setJustSelected] = useState<Set<string>>(new Set());
  const [pendingUncheckTagId, setPendingUncheckTagId] = useState<string | null>(null);
  const visibleTags = hideUnselected ? tags.filter((tag) => selectedKeys.includes(tag.id)) : tags;
  const showHintsAsIcon = hintsMode === "icon";
  const showFlags = typeof onToggleFlag === "function";
  const pendingUncheckTag = pendingUncheckTagId
    ? tags.find((tag) => tag.id === pendingUncheckTagId)
    : undefined;

  const requestToggleTag = (tagId: string, isSelected: boolean, description: string) => {
    if (readOnly) return;
    if (isSelected && description.trim().length > 0) {
      setPendingUncheckTagId(tagId);
      return;
    }
    if (!isSelected && showHintsAsIcon) {
      const tag = tags.find((item) => item.id === tagId);
      if (tag?.hint) {
        setJustSelected((prev) => new Set(prev).add(tagId));
      }
    }
    onToggleTag(tagId);
  };

  return (
    <div className="space-y-2">
      {visibleTags.map((tag) => {
        const isSelected = selectedKeys.includes(tag.id);
        const entry = selectedEntries.find((e) => e.tagKey === tag.id);
        const shouldPulse = justSelected.has(tag.id);
        const isFlagged = flaggedTagIds.includes(tag.id);
        return (
          <div key={tag.id}>
            <div className="flex items-start gap-2">
              <Checkbox
                id={`tag-${tag.id}`}
                checked={isSelected}
                disabled={readOnly}
                className="mt-0.5"
                onCheckedChange={() => {
                  requestToggleTag(tag.id, isSelected, entry?.description ?? "");
                }}
              />
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1">
                  <label htmlFor={`tag-${tag.id}`} className="cursor-pointer text-sm">
                    {tag.label}
                  </label>
                  {showHintsAsIcon && tag.hint && (
                    <QuestionnaireHintPopover
                      hints={[tag.hint]}
                      pulse={shouldPulse}
                      onOpenChange={(open) => {
                        if (!open && shouldPulse) {
                          setJustSelected((prev) => {
                            const next = new Set(prev);
                            next.delete(tag.id);
                            return next;
                          });
                        }
                      }}
                    />
                  )}
                </span>
                {!showHintsAsIcon && tag.hint && (
                  <div className="mt-0.5">
                    <QuestionnaireHintText hint={tag.hint} />
                  </div>
                )}
              </div>
              {showFlags && (
                <button
                  type="button"
                  className={cn(
                    "mt-0.5 shrink-0 rounded p-0.5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    readOnly && "pointer-events-none",
                    isFlagged
                      ? "text-red-500 hover:text-red-600"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                  aria-label={isFlagged ? t.questionnaireUnbookmark : t.questionnaireBookmark}
                  aria-pressed={isFlagged}
                  disabled={readOnly}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!readOnly) onToggleFlag(tag.id);
                  }}
                >
                  <Bookmark className={cn("h-4 w-4", isFlagged && "fill-current")} />
                </button>
              )}
            </div>
            {isSelected && (
              <div className="mb-2 mt-1 pl-6">
                {readOnly ? (
                  <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{entry?.description || "—"}</p>
                ) : (
                  <Textarea
                    placeholder={t.describeSelectedTraits}
                    value={entry?.description || ""}
                    onChange={(e) => {
                      onUpdateDescription(tag.id, e.target.value);
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                    onBlur={onBlur}
                    className="min-h-[60px] resize-none overflow-hidden text-sm"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      <AlertDialog
        open={!!pendingUncheckTagId}
        onOpenChange={(open) => {
          if (!open) setPendingUncheckTagId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.questionnaireUncheckTagTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.questionnaireUncheckTagDescription}
              {pendingUncheckTag?.label ? ` «${pendingUncheckTag.label}»` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingUncheckTagId) onToggleTag(pendingUncheckTagId);
                setPendingUncheckTagId(null);
              }}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
