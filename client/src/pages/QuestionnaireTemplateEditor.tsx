import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Loader2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { QuestionnaireHintPopover, QuestionnaireHintText } from "@/components/QuestionnaireHintPopover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import type { QuestionnaireTemplate } from "@shared/schema";
import {
  MAX_QUESTIONNAIRE_DEPTH,
  DEFAULT_QUESTIONNAIRE_HINTS_MODE,
  parseQuestionnaireHintsMode,
  getQuestionnaireNodeDepth,
  type QuestionnaireHintsMode,
  type QuestionnaireNode,
  type QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";
import {
  getNodeAtPath,
  getParentListLength,
  getTagCountAtPath,
  moveNodeAtPath,
  moveTagAtPath,
  newStructureId,
  removeNodeAtPath,
  removeTagAtPath,
  updateNodeAtPath,
  updateTagAtPath,
} from "@/lib/questionnaireTreeOps";
import {
  exportSectionToTextFile,
  mergeImportedSection,
  parseSectionFromText,
  validateMergedSectionDepth,
} from "@/lib/questionnaireSectionImportExport";

type TemplateSavePayload = {
  name: string;
  structure: QuestionnaireTemplateStructure;
  hintsMode: QuestionnaireHintsMode;
};

const NAME_AUTOSAVE_MS = 500;

type EditTarget =
  | { kind: "node"; path: number[] }
  | { kind: "tag"; path: number[]; tagIndex: number }
  | null;

type DeleteTarget =
  | { kind: "node"; path: number[] }
  | { kind: "tag"; path: number[]; tagIndex: number }
  | null;

type StructureActions = {
  onEditNode: (path: number[]) => void;
  onEditTag: (path: number[], tagIndex: number) => void;
  onDeleteNode: (path: number[]) => void;
  onDeleteTag: (path: number[], tagIndex: number) => void;
  onAddTag: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
  onMoveNode: (path: number[], delta: number) => void;
  onMoveTag: (path: number[], tagIndex: number, delta: number) => void;
  canMoveNodeUp: (path: number[]) => boolean;
  canMoveNodeDown: (path: number[]) => boolean;
  canMoveTagUp: (path: number[], tagIndex: number) => boolean;
  canMoveTagDown: (path: number[], tagIndex: number) => boolean;
  onExportSection: (path: number[]) => void;
  onImportSection: (path: number[]) => void;
};

function stopAccordionToggle(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation();
}

function EditorAccordionHeader({
  children,
  menu,
  hintIcon,
  className,
}: {
  children: ReactNode;
  menu?: ReactNode;
  hintIcon?: ReactNode;
  className?: string;
}) {
  return (
    <AccordionPrimitive.Header className="flex w-full items-center">
      <AccordionPrimitive.Trigger
        className={cn(
          "flex flex-1 items-center py-3 text-sm font-medium transition-all hover:no-underline text-left",
          className
        )}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {hintIcon}
        </span>
      </AccordionPrimitive.Trigger>
      {menu}
    </AccordionPrimitive.Header>
  );
}

function NodeActionsMenu({
  path,
  depth,
  actions,
}: {
  path: number[];
  depth: number;
  actions: StructureActions;
}) {
  const canAddChild = depth < MAX_QUESTIONNAIRE_DEPTH;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={t.menu}
          onClick={stopAccordionToggle}
          onPointerDown={stopAccordionToggle}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem className="py-2.5" onSelect={() => actions.onEditNode(path)}>
          {t.edit}
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onSelect={() => actions.onAddTag(path)}>
          {t.addQuestion}
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" disabled={!canAddChild} onSelect={() => actions.onAddChild(path)}>
          {t.addSubsection}
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onSelect={() => actions.onExportSection(path)}>
          {t.exportSection}
        </DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onSelect={() => actions.onImportSection(path)}>
          {t.importSection}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="py-2.5"
          disabled={!actions.canMoveNodeUp(path)}
          onSelect={() => actions.onMoveNode(path, -1)}
        >
          {t.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="py-2.5"
          disabled={!actions.canMoveNodeDown(path)}
          onSelect={() => actions.onMoveNode(path, 1)}
        >
          {t.moveDown}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="py-2.5 text-destructive focus:text-destructive"
          onSelect={() => actions.onDeleteNode(path)}
        >
          {t.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TagActionsMenu({
  path,
  tagIndex,
  actions,
}: {
  path: number[];
  tagIndex: number;
  actions: StructureActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={t.menu}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem className="py-2.5" onSelect={() => actions.onEditTag(path, tagIndex)}>
          {t.edit}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="py-2.5"
          disabled={!actions.canMoveTagUp(path, tagIndex)}
          onSelect={() => actions.onMoveTag(path, tagIndex, -1)}
        >
          {t.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="py-2.5"
          disabled={!actions.canMoveTagDown(path, tagIndex)}
          onSelect={() => actions.onMoveTag(path, tagIndex, 1)}
        >
          {t.moveDown}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="py-2.5 text-destructive focus:text-destructive"
          onSelect={() => actions.onDeleteTag(path, tagIndex)}
        >
          {t.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TagPreviewRow({
  tag,
  path,
  tagIndex,
  actions,
  hintsMode,
}: {
  tag: { id: string; label: string; hint?: string };
  path: number[];
  tagIndex: number;
  actions: StructureActions;
  hintsMode: QuestionnaireHintsMode;
}) {
  const showHintsAsIcon = hintsMode === "icon";

  return (
    <div className="flex items-start gap-2 py-1">
      <Checkbox id={`preview-tag-${tag.id}`} disabled checked={false} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1">
          <label htmlFor={`preview-tag-${tag.id}`} className="cursor-default text-sm">
            {tag.label}
          </label>
          {showHintsAsIcon && tag.hint && <QuestionnaireHintPopover hints={[tag.hint]} />}
        </span>
        {!showHintsAsIcon && tag.hint && <QuestionnaireHintText hint={tag.hint} className="mt-0.5" />}
      </div>
      <TagActionsMenu path={path} tagIndex={tagIndex} actions={actions} />
    </div>
  );
}

function StructureNodeRow({
  node,
  path,
  depth,
  actions,
  hintsMode,
}: {
  node: QuestionnaireNode;
  path: number[];
  depth: number;
  actions: StructureActions;
  hintsMode: QuestionnaireHintsMode;
}): ReactNode {
  const hasTags = (node.tags?.length ?? 0) > 0;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const showHintsAsIcon = hintsMode === "icon";

  const headerRow = (
    <EditorAccordionHeader
      menu={<NodeActionsMenu path={path} depth={depth} actions={actions} />}
      hintIcon={showHintsAsIcon && node.hint ? <QuestionnaireHintPopover hints={[node.hint]} /> : undefined}
    >
      {node.title}
    </EditorAccordionHeader>
  );

  const sectionHint = !showHintsAsIcon && node.hint ? (
    <QuestionnaireHintText hint={node.hint} className="mb-2" />
  ) : null;

  const tagList = hasTags ? (
    <div className="space-y-0.5">
      {(node.tags ?? []).map((tag, tagIndex) => (
        <TagPreviewRow
          key={tag.id}
          tag={tag}
          path={path}
          tagIndex={tagIndex}
          actions={actions}
          hintsMode={hintsMode}
        />
      ))}
    </div>
  ) : null;

  if (hasTags && !hasChildren) {
    return (
      <AccordionItem key={node.id} value={node.id} className="border-b">
        {headerRow}
        <AccordionContent>
          {sectionHint}
          {tagList}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <AccordionItem key={node.id} value={node.id} className="border-b">
      {headerRow}
      <AccordionContent>
        {sectionHint}
        {tagList}
        {hasChildren && (
          <Accordion type="multiple" defaultValue={[]} className="pl-2">
            {(node.children ?? []).map((child, childIndex) => (
              <StructureNodeRow
                key={child.id}
                node={child}
                path={[...path, childIndex]}
                depth={depth + 1}
                actions={actions}
                hintsMode={hintsMode}
              />
            ))}
          </Accordion>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function EditStructureItemDialog({
  editTarget,
  structure,
  open,
  onOpenChange,
  onSave,
}: {
  editTarget: EditTarget;
  structure: QuestionnaireTemplateStructure;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: { title: string; hint: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!editTarget) return;
    if (editTarget.kind === "node") {
      const node = getNodeAtPath(structure.root, editTarget.path);
      setTitle(node?.title ?? "");
      setHint(node?.hint ?? "");
    } else {
      const node = getNodeAtPath(structure.root, editTarget.path);
      const tag = node?.tags?.[editTarget.tagIndex];
      setTitle(tag?.label ?? "");
      setHint(tag?.hint ?? "");
    }
  }, [editTarget, structure, open]);

  const isTag = editTarget?.kind === "tag";
  const titleLabel = isTag ? t.tagLabel : t.questionnaireTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.edit}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-2">
            <Label htmlFor="edit-structure-title">{titleLabel}</Label>
            <Input
              id="edit-structure-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-structure-hint">{t.sectionHintLabel}</Label>
            <Textarea
              id="edit-structure-hint"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button type="button" disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), hint: hint.trim() })}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuestionnaireTemplateEditor({
  templateId,
  embedded = false,
  showBackButton = false,
  onBack,
}: {
  templateId: string;
  embedded?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
}) {
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const importPathRef = useRef<number[] | null>(null);
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCreateRef = useRef<EditTarget>(null);
  const [name, setName] = useState("");
  const [hintsMode, setHintsMode] = useState<QuestionnaireHintsMode>(DEFAULT_QUESTIONNAIRE_HINTS_MODE);
  const [structure, setStructure] = useState<QuestionnaireTemplateStructure>({ root: [] });
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [importTargetPath, setImportTargetPath] = useState<number[] | null>(null);
  const [pendingImportedNode, setPendingImportedNode] = useState<QuestionnaireNode | null>(null);

  const stateRef = useRef<TemplateSavePayload>({
    name: "",
    structure: { root: [] },
    hintsMode: DEFAULT_QUESTIONNAIRE_HINTS_MODE,
  });
  stateRef.current = { name, structure, hintsMode };

  const { data, isLoading } = useQuery<QuestionnaireTemplate>({
    queryKey: ["/api/questionnaire-templates", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const res = await fetch(`/api/questionnaire-templates/${templateId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setHintsMode(parseQuestionnaireHintsMode(data.hintsMode));
    setStructure(data.structure as QuestionnaireTemplateStructure);
  }, [data?.id]);

  useEffect(() => {
    return () => {
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (payload: TemplateSavePayload) => {
      const trimmed = payload.name.trim();
      if (!trimmed) throw new Error("empty name");
      for (const node of payload.structure.root) {
        if (getQuestionnaireNodeDepth(node) > MAX_QUESTIONNAIRE_DEPTH) {
          throw new Error("depth");
        }
      }
      const res = await apiRequest("PATCH", `/api/questionnaire-templates/${templateId}`, {
        name: trimmed,
        structure: payload.structure,
        hintsMode: payload.hintsMode,
      });
      return res.json() as Promise<QuestionnaireTemplate>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["/api/questionnaire-templates", templateId], saved);
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
    },
    onError: (err: Error) => {
      toast({
        title: err.message === "depth" ? t.maxDepthReached : t.questionnaireSaveError,
        variant: "destructive",
      });
    },
  });

  const persist = (overrides?: Partial<TemplateSavePayload>) => {
    const payload: TemplateSavePayload = {
      name: overrides?.name ?? stateRef.current.name,
      structure: overrides?.structure ?? stateRef.current.structure,
      hintsMode: overrides?.hintsMode ?? stateRef.current.hintsMode,
    };
    if (!payload.name.trim()) return;
    saveMutation.mutate(payload);
  };

  const applyStructure = (next: QuestionnaireTemplateStructure) => {
    setStructure(next);
    stateRef.current = { ...stateRef.current, structure: next };
    persist({ structure: next });
  };

  const structureActions: StructureActions = {
    onEditNode: (path) => {
      pendingCreateRef.current = null;
      setEditTarget({ kind: "node", path });
    },
    onEditTag: (path, tagIndex) => {
      pendingCreateRef.current = null;
      setEditTarget({ kind: "tag", path, tagIndex });
    },
    onDeleteNode: (path) => setDeleteTarget({ kind: "node", path }),
    onDeleteTag: (path, tagIndex) => setDeleteTarget({ kind: "tag", path, tagIndex }),
    onAddTag: (path) => {
      const node = getNodeAtPath(structure.root, path);
      if (!node) return;
      const tagIndex = (node.tags ?? []).length;
      const target: EditTarget = { kind: "tag", path, tagIndex };
      pendingCreateRef.current = target;
      setStructure(
        updateNodeAtPath(structure, path, (n) => ({
          ...n,
          tags: [...(n.tags ?? []), { id: newStructureId("tag"), label: t.newQuestionItem }],
        }))
      );
      setEditTarget(target);
    },
    onAddChild: (path) => {
      const node = getNodeAtPath(structure.root, path);
      if (!node) return;
      const childIndex = (node.children ?? []).length;
      const target: EditTarget = { kind: "node", path: [...path, childIndex] };
      pendingCreateRef.current = target;
      setStructure(
        updateNodeAtPath(structure, path, (n) => ({
          ...n,
          children: [...(n.children ?? []), { id: newStructureId("sec"), title: "Новый подраздел" }],
        }))
      );
      setEditTarget(target);
    },
    onMoveNode: (path, delta) => {
      applyStructure(moveNodeAtPath(structure, path, delta));
    },
    onMoveTag: (path, tagIndex, delta) => {
      applyStructure(moveTagAtPath(structure, path, tagIndex, delta));
    },
    canMoveNodeUp: (path) => path[path.length - 1] > 0,
    canMoveNodeDown: (path) => path[path.length - 1] < getParentListLength(structure, path) - 1,
    canMoveTagUp: (_path, tagIndex) => tagIndex > 0,
    canMoveTagDown: (path, tagIndex) => tagIndex < getTagCountAtPath(structure, path) - 1,
    onExportSection: (path) => {
      const node = getNodeAtPath(structure.root, path);
      if (!node) return;
      exportSectionToTextFile(node);
    },
    onImportSection: (path) => {
      importPathRef.current = path;
      if (importInputRef.current) {
        importInputRef.current.value = "";
        importInputRef.current.click();
      }
    },
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const path = importPathRef.current;
    importPathRef.current = null;
    event.target.value = "";
    if (!path) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const imported = parseSectionFromText(text);
        const existing = getNodeAtPath(structure.root, path);
        if (!existing) return;
        const merged = mergeImportedSection(existing, imported);
        if (!validateMergedSectionDepth(path.length, merged)) {
          toast({ title: t.importSectionDepthError, variant: "destructive" });
          return;
        }
        setPendingImportedNode(imported);
        setImportTargetPath(path);
      } catch {
        toast({ title: t.importSectionInvalidFormat, variant: "destructive" });
      }
    };
    reader.onerror = () => {
      toast({ title: t.importSectionInvalidFormat, variant: "destructive" });
    };
    reader.readAsText(file, "utf-8");
  };

  const handleImportConfirm = () => {
    if (!importTargetPath || !pendingImportedNode) return;
    const existing = getNodeAtPath(structure.root, importTargetPath);
    if (!existing) {
      setImportTargetPath(null);
      setPendingImportedNode(null);
      return;
    }
    const merged = mergeImportedSection(existing, pendingImportedNode);
    if (!validateMergedSectionDepth(importTargetPath.length, merged)) {
      toast({ title: t.importSectionDepthError, variant: "destructive" });
      setImportTargetPath(null);
      setPendingImportedNode(null);
      return;
    }
    applyStructure(updateNodeAtPath(structure, importTargetPath, () => merged));
    setImportTargetPath(null);
    setPendingImportedNode(null);
    toast({ title: t.importSectionSuccess });
  };

  const handleAddRootSection = () => {
    const path = [structure.root.length];
    const target: EditTarget = { kind: "node", path };
    pendingCreateRef.current = target;
    setStructure({
      root: [...structure.root, { id: newStructureId("sec"), title: "Новый раздел" }],
    });
    setEditTarget(target);
  };

  const discardPendingCreate = () => {
    const pending = pendingCreateRef.current;
    pendingCreateRef.current = null;
    if (!pending) return;
    if (pending.kind === "tag") {
      setStructure((prev) => removeTagAtPath(prev, pending.path, pending.tagIndex));
    } else {
      setStructure((prev) => removeNodeAtPath(prev, pending.path));
    }
  };

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open) return;
    discardPendingCreate();
    setEditTarget(null);
  };

  const handleEditSave = (values: { title: string; hint: string }) => {
    if (!editTarget) return;
    const next =
      editTarget.kind === "node"
        ? updateNodeAtPath(structure, editTarget.path, (node) => ({
            ...node,
            title: values.title,
            hint: values.hint || undefined,
          }))
        : updateTagAtPath(structure, editTarget.path, editTarget.tagIndex, (tag) => ({
            ...tag,
            label: values.title,
            hint: values.hint || undefined,
          }));
    pendingCreateRef.current = null;
    setEditTarget(null);
    applyStructure(next);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const next =
      deleteTarget.kind === "node"
        ? removeNodeAtPath(structure, deleteTarget.path)
        : removeTagAtPath(structure, deleteTarget.path, deleteTarget.tagIndex);
    setDeleteTarget(null);
    applyStructure(next);
  };

  const showHintsAsIcon = hintsMode === "icon";

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 p-4 sm:p-6", embedded ? "min-h-0" : "mx-auto max-w-3xl")}>
      <div className="flex items-center gap-3">
        {showBackButton && (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label={t.backToHealthWall}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {!embedded && <h1 className="text-xl font-bold">{t.editQuestionnaireTemplate}</h1>}
        {embedded && showBackButton && (
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{name || t.editQuestionnaireTemplate}</h1>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t.saving}</span>
            </>
          ) : (
            <span className="text-sm text-green-600 dark:text-green-500">{t.statusSaved}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t.questionnaireTitle}</Label>
        <Input
          value={name}
          onChange={(e) => {
            const nextName = e.target.value;
            setName(nextName);
            stateRef.current = { ...stateRef.current, name: nextName };
            if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
            nameSaveTimerRef.current = setTimeout(() => {
              persist({ name: nextName });
            }, NAME_AUTOSAVE_MS);
          }}
          required
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <Label className="text-base font-medium">{t.questionnaireHintsSetting}</Label>
        <RadioGroup
          value={hintsMode}
          onValueChange={(value) => {
            const nextMode = value as QuestionnaireHintsMode;
            setHintsMode(nextMode);
            stateRef.current = { ...stateRef.current, hintsMode: nextMode };
            persist({ hintsMode: nextMode });
          }}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="always" id="template-hints-always" />
            <Label htmlFor="template-hints-always" className="cursor-pointer font-normal">
              {t.questionnaireHintsAlways}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="icon" id="template-hints-icon" />
            <Label htmlFor="template-hints-icon" className="cursor-pointer font-normal">
              {t.questionnaireHintsIcon}
            </Label>
          </div>
        </RadioGroup>
      </div>

      <Accordion type="multiple" defaultValue={[]} className="rounded-lg border px-4">
        <AccordionItem value="patient-profile" className="border-b">
          <EditorAccordionHeader
            hintIcon={
              showHintsAsIcon ? <QuestionnaireHintPopover hints={[t.questionnairePatientBlockHint]} /> : undefined
            }
          >
            {t.questionnairePatientBlockTitle}
          </EditorAccordionHeader>
          <AccordionContent>
            {!showHintsAsIcon && (
              <QuestionnaireHintText hint={t.questionnairePatientBlockHint} className="mb-3" />
            )}
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <span>{t.firstName}</span>
              <span>{t.birthMonth}</span>
              <span>{t.birthYear}</span>
              <span>{t.gender}</span>
              <span>{t.height}</span>
              <span>{t.weight}</span>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{t.questionnaireSectionsTitle}</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddRootSection}>
            <Plus className="mr-1 h-4 w-4" />
            {t.addSection}
          </Button>
        </div>

        {structure.root.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noDataAvailable}</p>
        ) : (
          <Accordion type="multiple" defaultValue={[]} className="rounded-lg border px-4">
            {structure.root.map((node, index) => (
              <StructureNodeRow
                key={node.id}
                node={node}
                path={[index]}
                depth={1}
                actions={structureActions}
                hintsMode={hintsMode}
              />
            ))}
          </Accordion>
        )}
      </div>

      <EditStructureItemDialog
        editTarget={editTarget}
        structure={structure}
        open={!!editTarget}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleEditSave}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delete}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "tag" ? t.deleteTagConfirm : t.deleteSectionConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!importTargetPath && !!pendingImportedNode}
        onOpenChange={(open) => {
          if (!open) {
            setImportTargetPath(null);
            setPendingImportedNode(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.importSectionConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.importSectionConfirmDescription.replace(
                "{title}",
                importTargetPath ? (getNodeAtPath(structure.root, importTargetPath)?.title ?? "") : ""
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm}>{t.importSection}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={importInputRef}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
    </div>
  );
}
