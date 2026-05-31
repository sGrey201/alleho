import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { t } from "@/lib/i18n";
import type { QuestionnaireHintsMode, QuestionnaireTagEntry } from "@shared/questionnaireTypes";
import { QuestionnaireHintPopover, QuestionnaireHintText } from "@/components/QuestionnaireHintPopover";

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
}: Props) {
  const selectedKeys = selectedEntries.map((e) => e.tagKey);
  const [justSelected, setJustSelected] = useState<Set<string>>(new Set());
  const visibleTags = hideUnselected ? tags.filter((tag) => selectedKeys.includes(tag.id)) : tags;
  const showHintsAsIcon = hintsMode === "icon";

  return (
    <div className="space-y-2">
      {visibleTags.map((tag) => {
        const isSelected = selectedKeys.includes(tag.id);
        const entry = selectedEntries.find((e) => e.tagKey === tag.id);
        const shouldPulse = justSelected.has(tag.id);
        return (
          <div key={tag.id}>
            <div className="flex items-start gap-2">
              <Checkbox
                id={`tag-${tag.id}`}
                checked={isSelected}
                disabled={readOnly}
                className="mt-0.5"
                onCheckedChange={() => {
                  if (readOnly) return;
                  if (!isSelected && showHintsAsIcon && tag.hint) {
                    setJustSelected((prev) => new Set(prev).add(tag.id));
                  }
                  onToggleTag(tag.id);
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
    </div>
  );
}
