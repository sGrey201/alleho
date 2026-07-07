import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocation, useRoute } from "wouter";
import {
  Plus,
  Copy,
  Trash2,
  Share2,
  Loader2,
  ArrowLeft,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { QuestionnaireTemplate } from "@shared/schema";
import { QuestionnaireTemplateEditor } from "@/pages/QuestionnaireTemplateEditor";
import { QuestionnaireTemplatesEmptyState } from "@/components/QuestionnaireTemplatesEmptyState";
import { RouteSeo } from "@/components/RouteSeo";
import { pageMeta } from "@/lib/pageMeta";

function generateDeleteConfirmationCode(): number {
  return Math.floor(100 + Math.random() * 900);
}

export default function QuestionnaireTemplates() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [, editParams] = useRoute("/questionnaires/:id/edit");
  const selectedId = editParams?.id ?? null;
  const [deleteDialog, setDeleteDialog] = useState<{
    id: string;
    name: string;
    code: number;
  } | null>(null);
  const [deleteCodeInput, setDeleteCodeInput] = useState("");

  const { data: templates = [], isLoading } = useQuery<QuestionnaireTemplate[]>({
    queryKey: ["/api/questionnaire-templates"],
  });

  useEffect(() => {
    if (isLoading || templates.length === 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return;
    if (!selectedId) {
      setLocation(`/questionnaires/${templates[0].id}/edit`, { replace: true });
    }
  }, [isLoading, templates, selectedId, setLocation]);

  const navigateAfterDelete = (deletedId: string) => {
    const remaining = templates.filter((tpl) => tpl.id !== deletedId);
    if (isMobile || remaining.length === 0) {
      setLocation("/questionnaires");
      return;
    }
    setLocation(`/questionnaires/${remaining[0].id}/edit`, { replace: true });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/questionnaire-templates", {
        name: t.newQuestionnaireTemplate,
        structure: { root: [] },
      });
      return res.json() as Promise<QuestionnaireTemplate>;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
      setLocation(`/questionnaires/${created.id}/edit`);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/questionnaire-templates/${id}/duplicate`);
      return res.json() as Promise<QuestionnaireTemplate>;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
      if (created?.id) {
        setLocation(`/questionnaires/${created.id}/edit`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/questionnaire-templates/${id}`);
      return id;
    },
    onSuccess: (deletedId) => {
      setDeleteDialog(null);
      setDeleteCodeInput("");
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
      navigateAfterDelete(deletedId);
    },
  });

  const openDeleteDialog = (tpl: QuestionnaireTemplate) => {
    setDeleteDialog({
      id: tpl.id,
      name: tpl.name,
      code: generateDeleteConfirmationCode(),
    });
    setDeleteCodeInput("");
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open) {
      setDeleteDialog(null);
      setDeleteCodeInput("");
    }
  };

  const deleteCodeMatches =
    deleteDialog !== null && deleteCodeInput.trim() === String(deleteDialog.code);

  const shareMutation = useMutation({
    mutationFn: async ({ id, isShared }: { id: string; isShared: boolean }) => {
      const res = await apiRequest("PATCH", `/api/questionnaire-templates/${id}`, { isShared });
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] }),
  });

  const showList = isMobile ? !selectedId : true;
  const showEditor = !!selectedId;
  const isMobileEditorOpen = isMobile && showEditor;
  const isEmpty = !isLoading && templates.length === 0;

  const handleBackFromSection = () => {
    setLocation("/messenger");
  };

  const listPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={handleBackFromSection}
          aria-label={t.backToHealthWall}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{t.questionnaires}</h1>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          aria-label={t.create}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        isMobile ? (
          <QuestionnaireTemplatesEmptyState />
        ) : (
          <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {t.questionnaireTemplatesEmptyTitle}
          </p>
        )
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="py-1">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className={cn(
                  "flex items-stretch border-b last:border-b-0",
                  selectedId === tpl.id && "bg-muted/60"
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-3 text-left hover:bg-muted/40"
                  onClick={() => setLocation(`/questionnaires/${tpl.id}/edit`)}
                >
                  <p className="truncate font-medium">{tpl.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.lastUpdated}: {tpl.updatedAt ? format(new Date(tpl.updatedAt), "dd.MM.yyyy HH:mm") : "—"}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="my-1 mr-1 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      className="flex items-center justify-between gap-3"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Share2 className="h-4 w-4" />
                        {t.shareQuestionnaire}
                      </span>
                      <Switch
                        checked={tpl.isShared}
                        onCheckedChange={(checked) => shareMutation.mutate({ id: tpl.id, isShared: checked })}
                      />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={duplicateMutation.isPending}
                      onSelect={() => duplicateMutation.mutate(tpl.id)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {t.duplicateQuestionnaire}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={deleteMutation.isPending}
                      onSelect={() => openDeleteDialog(tpl)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const editorPanel =
    showEditor && selectedId ? (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
        <QuestionnaireTemplateEditor
          key={selectedId}
          templateId={selectedId}
          embedded
          showBackButton={isMobileEditorOpen}
          onBack={() => setLocation("/questionnaires")}
        />
      </div>
    ) : !isMobile ? (
      <div className="flex min-h-0 flex-1 flex-col bg-muted/15">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isEmpty ? (
          <QuestionnaireTemplatesEmptyState />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {t.selectQuestionnaireToSend}
          </div>
        )}
      </div>
    ) : null;

  return (
    <>
      <RouteSeo {...(selectedId ? pageMeta.questionnaireEdit : pageMeta.questionnaires)} />
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        {showList && (
          <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-b md:w-80 md:max-w-sm md:border-b-0 md:border-r">
            {listPanel}
          </aside>
        )}
        {!isMobile && <div className="flex min-h-0 min-w-0 flex-1 flex-col">{editorPanel}</div>}
        {isMobileEditorOpen && <div className="flex min-h-0 flex-1 flex-col">{editorPanel}</div>}
      </div>

      <AlertDialog open={!!deleteDialog} onOpenChange={handleDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteQuestionnaireTemplateConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog
                ? t.deleteQuestionnaireTemplateConfirmDescription(deleteDialog.name)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteDialog && (
            <div className="space-y-2">
              <Label htmlFor="delete-questionnaire-code">
                {t.deleteConfirmationCodePrompt(deleteDialog.code)}
              </Label>
              <Input
                id="delete-questionnaire-code"
                inputMode="numeric"
                autoComplete="off"
                value={deleteCodeInput}
                onChange={(e) => setDeleteCodeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="000"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteCodeMatches || deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteDialog || !deleteCodeMatches) return;
                deleteMutation.mutate(deleteDialog.id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.deleteQuestionnaireTemplate}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
