import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { QuestionnaireTagSelector } from "@/components/QuestionnaireTagSelector";
import { QuestionnaireHintPopover, QuestionnaireHintText } from "@/components/QuestionnaireHintPopover";
import type {
  QuestionnaireInstanceData,
  QuestionnaireNode,
  QuestionnaireTagEntry,
  QuestionnaireTemplateStructure,
  PatientProfileBlock,
  QuestionnaireHintsMode,
} from "@shared/questionnaireTypes";
import { emptyQuestionnaireInstanceData, parseQuestionnaireHintsMode } from "@shared/questionnaireTypes";
import { cn } from "@/lib/utils";

const months = [
  { value: 1, label: t.january },
  { value: 2, label: t.february },
  { value: 3, label: t.march },
  { value: 4, label: t.april },
  { value: 5, label: t.may },
  { value: 6, label: t.june },
  { value: 7, label: t.july },
  { value: 8, label: t.august },
  { value: 9, label: t.september },
  { value: 10, label: t.october },
  { value: 11, label: t.november },
  { value: 12, label: t.december },
];

type InstanceResponse = {
  id: string;
  structureSnapshot: QuestionnaireTemplateStructure;
  data: QuestionnaireInstanceData;
  templateName: string;
  hintsModeSnapshot?: QuestionnaireHintsMode;
};

type Props = {
  /** Hide in-panel title when the parent already shows it (e.g. chat split header). */
  hideTitle?: boolean;
} & (
  | {
      mode: "instance";
      instanceId: string;
      readOnly?: boolean;
    }
  | {
      mode: "preview";
      structure: QuestionnaireTemplateStructure;
      templateName: string;
      templateId?: string;
      hintsMode?: QuestionnaireHintsMode;
      onCopy?: () => void;
      isCopying?: boolean;
    }
);

function getGenderLabel(gender: string | null) {
  if (gender === "male") return t.genderMale;
  if (gender === "female") return t.genderFemale;
  if (gender === "other") return t.genderOther;
  return "—";
}

function sectionHasSelectedTag(
  node: QuestionnaireNode,
  sections: QuestionnaireInstanceData["sections"]
): boolean {
  if ((sections[node.id]?.length ?? 0) > 0) return true;
  return (node.children ?? []).some((child) => sectionHasSelectedTag(child, sections));
}

export default function DynamicQuestionnaireForm(props: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [formData, setFormData] = useState<QuestionnaireInstanceData>(emptyQuestionnaireInstanceData());
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  type SubSaveStatus = "idle" | "saving" | "saved" | "error";
  const [subSaveStatus, setSubSaveStatus] = useState<Record<string, SubSaveStatus>>({});

  const instanceQuery = useQuery<InstanceResponse>({
    queryKey: ["/api/questionnaire-instances", props.mode === "instance" ? props.instanceId : null],
    enabled: props.mode === "instance",
    queryFn: async () => {
      if (props.mode !== "instance") throw new Error("invalid mode");
      const res = await fetch(`/api/questionnaire-instances/${props.instanceId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const structure =
    props.mode === "instance"
      ? instanceQuery.data?.structureSnapshot ?? { root: [] }
      : props.structure;
  const templateName = props.mode === "instance" ? instanceQuery.data?.templateName ?? "" : props.templateName;
  const readOnly = props.mode === "preview" ? true : !!props.readOnly;
  const canEditNotes = props.mode === "instance" && !readOnly && !!user?.isAdmin;
  const hintsMode =
    props.mode === "instance"
      ? parseQuestionnaireHintsMode(instanceQuery.data?.hintsModeSnapshot)
      : parseQuestionnaireHintsMode(props.hintsMode);
  const showHintsAsIcon = hintsMode === "icon";

  const renderSectionHint = (hint?: string) => {
    if (!hint) return null;
    if (showHintsAsIcon) return null;
    return <QuestionnaireHintText hint={hint} className="mb-2" />;
  };

  const renderSectionHintIcon = (hint?: string) => {
    if (!hint || !showHintsAsIcon) return null;
    return <QuestionnaireHintPopover hints={[hint]} />;
  };

  useEffect(() => {
    if (props.mode === "instance" && instanceQuery.data?.data) {
      setFormData(instanceQuery.data.data);
    }
  }, [props.mode, instanceQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuestionnaireInstanceData) => {
      if (props.mode !== "instance") return;
      const res = await apiRequest("PATCH", `/api/questionnaire-instances/${props.instanceId}`, { data });
      return res.json();
    },
    onSuccess: () => {
      if (props.mode === "instance") {
        void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-instances", props.instanceId] });
      }
    },
    onError: () => {
      toast({ title: t.questionnaireSaveError, variant: "destructive" });
    },
  });

  const scheduleSave = useCallback(
    (statusKey: string) => {
      if (readOnly || props.mode !== "instance") return;
      setSubSaveStatus((s) => ({ ...s, [statusKey]: "saving" }));
      saveMutation.mutate(formDataRef.current, {
        onSuccess: () => setSubSaveStatus((s) => ({ ...s, [statusKey]: "saved" })),
        onError: () => setSubSaveStatus((s) => ({ ...s, [statusKey]: "error" })),
      });
    },
    [readOnly, props, saveMutation]
  );

  const updateProfile = (patch: Partial<PatientProfileBlock>) => {
    setFormData((prev) => {
      const next = { ...prev, patientProfile: { ...prev.patientProfile, ...patch } };
      formDataRef.current = next;
      return next;
    });
  };

  const toggleTag = (nodeId: string, tagKey: string) => {
    setFormData((prev) => {
      const entries = prev.sections[nodeId] ?? [];
      const exists = entries.some((e) => e.tagKey === tagKey);
      const nextEntries: QuestionnaireTagEntry[] = exists
        ? entries.filter((e) => e.tagKey !== tagKey)
        : [...entries, { tagKey, description: "" }];
      const next = { ...prev, sections: { ...prev.sections, [nodeId]: nextEntries } };
      formDataRef.current = next;
      return next;
    });
    scheduleSave(nodeId);
  };

  const updateTagDescription = (nodeId: string, tagKey: string, description: string) => {
    setFormData((prev) => {
      const entries = (prev.sections[nodeId] ?? []).map((e) =>
        e.tagKey === tagKey ? { ...e, description } : e
      );
      const next = { ...prev, sections: { ...prev.sections, [nodeId]: entries } };
      formDataRef.current = next;
      return next;
    });
  };

  const renderSaveStatus = (key: string) => {
    const status = subSaveStatus[key];
    if (!status || status === "idle") return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />}
        {status === "saved" && <Check className="h-3.5 w-3.5 text-green-500" />}
        {status === "error" && <X className="h-3.5 w-3.5 text-red-500" />}
      </span>
    );
  };

  const renderNodeSections = (nodes: QuestionnaireNode[], depth = 1): ReactNode =>
    nodes.map((node) => {
      const hasTags = (node.tags?.length ?? 0) > 0;
      const hasChildren = (node.children?.length ?? 0) > 0;
      const hasFilledTag = sectionHasSelectedTag(node, formData.sections);
      const triggerClassName = cn("text-sm", hasFilledTag ? "font-bold" : "font-medium");

      if (hasTags && !hasChildren) {
        return (
          <AccordionItem key={node.id} value={node.id}>
            <AccordionTrigger className={triggerClassName}>
              <span className="flex flex-1 items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  {node.title}
                  {renderSectionHintIcon(node.hint)}
                </span>
                {renderSaveStatus(node.id)}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {renderSectionHint(node.hint)}
              <QuestionnaireTagSelector
                tags={(node.tags ?? []).map((tag) => ({ id: tag.id, label: tag.label, hint: tag.hint }))}
                selectedEntries={formData.sections[node.id] ?? []}
                onToggleTag={(tagKey) => toggleTag(node.id, tagKey)}
                onUpdateDescription={(tagKey, desc) => updateTagDescription(node.id, tagKey, desc)}
                onBlur={() => scheduleSave(node.id)}
                readOnly={readOnly}
                hintsMode={hintsMode}
              />
            </AccordionContent>
          </AccordionItem>
        );
      }
      return (
        <AccordionItem key={node.id} value={node.id}>
          <AccordionTrigger className={triggerClassName}>
            <span className="inline-flex items-center gap-1">
              {node.title}
              {renderSectionHintIcon(node.hint)}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {renderSectionHint(node.hint)}
            {hasTags && (
              <div className="mb-3">
                <QuestionnaireTagSelector
                  tags={(node.tags ?? []).map((tag) => ({ id: tag.id, label: tag.label, hint: tag.hint }))}
                  selectedEntries={formData.sections[node.id] ?? []}
                  onToggleTag={(tagKey) => toggleTag(node.id, tagKey)}
                  onUpdateDescription={(tagKey, desc) => updateTagDescription(node.id, tagKey, desc)}
                  onBlur={() => scheduleSave(node.id)}
                  readOnly={readOnly}
                  hintsMode={hintsMode}
                />
              </div>
            )}
            {hasChildren && (
              <Accordion type="multiple" className="pl-2">
                {renderNodeSections(node.children!, depth + 1)}
              </Accordion>
            )}
          </AccordionContent>
        </AccordionItem>
      );
    });

  if (props.mode === "instance" && instanceQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const profile = formData.patientProfile;

  return (
    <div className="space-y-4 p-4">
      {templateName && !props.hideTitle && (
        <h2 className="text-lg font-semibold">{templateName}</h2>
      )}
      {props.mode === "preview" && props.onCopy && user?.isAdmin && (
        <Button type="button" onClick={props.onCopy} disabled={props.isCopying}>
          {props.isCopying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.copyQuestionnaireTemplate}
        </Button>
      )}

      <Accordion type="multiple" defaultValue={["patient-profile"]}>
        <AccordionItem value="patient-profile">
          <AccordionTrigger className="text-sm font-medium">
            <span className="flex flex-1 items-center gap-2">
              {t.questionnairePatientBlockTitle}
              {renderSaveStatus("profile")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.lastName}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">{profile.lastName || "—"}</div>
                ) : (
                  <Input
                    value={profile.lastName}
                    onChange={(e) => updateProfile({ lastName: e.target.value })}
                    onBlur={() => scheduleSave("profile")}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>{t.firstName}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">{profile.firstName || "—"}</div>
                ) : (
                  <Input
                    value={profile.firstName}
                    onChange={(e) => updateProfile({ firstName: e.target.value })}
                    onBlur={() => scheduleSave("profile")}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.birthMonth}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">
                    {profile.birthMonth ? months.find((m) => m.value === profile.birthMonth)?.label : "—"}
                  </div>
                ) : (
                  <Select
                    value={profile.birthMonth?.toString() ?? ""}
                    onValueChange={(v) => {
                      updateProfile({ birthMonth: v ? Number(v) : null });
                      scheduleSave("profile");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectMonth} />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t.birthYear}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">{profile.birthYear ?? "—"}</div>
                ) : (
                  <Input
                    type="number"
                    value={profile.birthYear ?? ""}
                    onChange={(e) =>
                      updateProfile({ birthYear: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={() => scheduleSave("profile")}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label>{t.gender}</Label>
              {readOnly ? (
                <div className="rounded-md bg-muted p-2 text-sm">{getGenderLabel(profile.gender)}</div>
              ) : (
                <Select
                  value={profile.gender ?? ""}
                  onValueChange={(v) => {
                    updateProfile({ gender: v || null });
                    scheduleSave("profile");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectGender} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t.genderMale}</SelectItem>
                    <SelectItem value="female">{t.genderFemale}</SelectItem>
                    <SelectItem value="other">{t.genderOther}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.height}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">{profile.height ?? "—"}</div>
                ) : (
                  <Input
                    type="number"
                    value={profile.height ?? ""}
                    onChange={(e) =>
                      updateProfile({ height: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={() => scheduleSave("profile")}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>{t.weight}</Label>
                {readOnly ? (
                  <div className="rounded-md bg-muted p-2 text-sm">{profile.weight ?? "—"}</div>
                ) : (
                  <Input
                    type="number"
                    value={profile.weight ?? ""}
                    onChange={(e) =>
                      updateProfile({ weight: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={() => scheduleSave("profile")}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label>{t.city}</Label>
              {readOnly ? (
                <div className="rounded-md bg-muted p-2 text-sm">{profile.city || "—"}</div>
              ) : (
                <Input
                  value={profile.city ?? ""}
                  onChange={(e) => updateProfile({ city: e.target.value || null })}
                  onBlur={() => scheduleSave("profile")}
                />
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="multiple">{renderNodeSections(structure.root)}</Accordion>

      {canEditNotes && (
        <div className="space-y-2 border-t pt-4">
          <Label>{t.homeopathNotesDescription}</Label>
          <Textarea
            value={formData.homeopathNotes ?? ""}
            onChange={(e) => {
              setFormData((prev) => {
                const next = { ...prev, homeopathNotes: e.target.value };
                formDataRef.current = next;
                return next;
              });
            }}
            onBlur={() => scheduleSave("notes")}
            className="min-h-[100px]"
          />
        </div>
      )}
    </div>
  );
}
