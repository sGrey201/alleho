import { ClipboardList, Lightbulb, Loader2, Plus, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { QUESTIONNAIRE_TEMPLATES_GROUP_PATH } from "@/lib/questionnaireTemplatesGroup";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  onCreate?: () => void;
  isCreating?: boolean;
};

export function QuestionnaireTemplatesEmptyState({ className, onCreate, isCreating }: Props) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center p-4 sm:p-6", className)}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ClipboardList className="h-8 w-8" strokeWidth={1.75} />
        </div>

        <h2 className="text-lg font-semibold text-foreground">{t.questionnaireTemplatesEmptyTitle}</h2>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t.questionnaireTemplatesEmptyPrefix}{" "}
          <Link
            href={QUESTIONNAIRE_TEMPLATES_GROUP_PATH}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.questionnaireTemplatesGroupName}
          </Link>
          .
        </p>

        <div className="mt-4 rounded-xl border border-dashed border-primary/20 bg-muted/50 px-4 py-3.5 text-left">
          <p className="flex items-start justify-between gap-2 text-sm leading-snug text-muted-foreground">
            <span>{t.questionnaireTemplatesEmptyTip}</span>
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          </p>
        </div>

        <Button asChild className="mt-4 w-full">
          <Link href={QUESTIONNAIRE_TEMPLATES_GROUP_PATH}>
            <Users className="mr-2 h-4 w-4" />
            {t.questionnaireTemplatesOpenGroup}
          </Link>
        </Button>

        {onCreate && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            onClick={onCreate}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {t.questionnaireTemplatesCreateNew}
          </Button>
        )}
      </div>
    </div>
  );
}
