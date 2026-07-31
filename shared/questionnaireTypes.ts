import { z } from "zod";

export const QUESTIONNAIRE_HINTS_MODES = ["always", "icon"] as const;
export type QuestionnaireHintsMode = (typeof QUESTIONNAIRE_HINTS_MODES)[number];
export const DEFAULT_QUESTIONNAIRE_HINTS_MODE: QuestionnaireHintsMode = "icon";

export function parseQuestionnaireHintsMode(value: unknown): QuestionnaireHintsMode {
  return value === "always" || value === "icon" ? value : DEFAULT_QUESTIONNAIRE_HINTS_MODE;
}

export const questionnaireHintsModeSchema = z.enum(QUESTIONNAIRE_HINTS_MODES);

export const MAX_QUESTIONNAIRE_DEPTH = 4;

export const questionnaireTagSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
});

export type QuestionnaireTag = z.infer<typeof questionnaireTagSchema>;

export type QuestionnaireNode = {
  id: string;
  title: string;
  hint?: string;
  children?: QuestionnaireNode[];
  tags?: QuestionnaireTag[];
};

export const questionnaireNodeSchema: z.ZodType<QuestionnaireNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    hint: z.string().optional(),
    children: z.array(questionnaireNodeSchema).optional(),
    tags: z.array(questionnaireTagSchema).optional(),
  })
);

export const questionnaireTemplateStructureSchema = z.object({
  root: z.array(questionnaireNodeSchema),
});

export type QuestionnaireTemplateStructure = z.infer<typeof questionnaireTemplateStructureSchema>;

export function getQuestionnaireNodeDepth(node: QuestionnaireNode, currentDepth = 1): number {
  let max = currentDepth;
  for (const child of node.children ?? []) {
    max = Math.max(max, getQuestionnaireNodeDepth(child, currentDepth + 1));
  }
  return max;
}

export function validateQuestionnaireStructureDepth(structure: QuestionnaireTemplateStructure): boolean {
  for (const node of structure.root) {
    if (getQuestionnaireNodeDepth(node) > MAX_QUESTIONNAIRE_DEPTH) return false;
  }
  return true;
}

export const patientProfileBlockSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthMonth: z.number().min(1).max(12).nullable(),
  birthYear: z.number().min(1900).max(2100).nullable(),
  gender: z.string().nullable(),
  height: z.number().nullable(),
  weight: z.number().nullable(),
  city: z.string().nullable(),
});

export type PatientProfileBlock = z.infer<typeof patientProfileBlockSchema>;

export const questionnaireTagEntrySchema = z.object({
  tagKey: z.string().min(1),
  description: z.string(),
});

export type QuestionnaireTagEntry = z.infer<typeof questionnaireTagEntrySchema>;

export const questionnaireInstanceDataSchema = z.object({
  patientProfile: patientProfileBlockSchema,
  sections: z.record(z.string(), z.array(questionnaireTagEntrySchema)),
  homeopathNotes: z.string().optional(),
  /** Bookmark keys as `${sectionNodeId}:${tagId}` for tags marked "return later". */
  flaggedTagKeys: z.array(z.string()).default([]),
  /** Section/subsection node ids marked "return later". */
  flaggedNodeIds: z.array(z.string()).default([]),
});

export type QuestionnaireInstanceData = z.infer<typeof questionnaireInstanceDataSchema>;

export function questionnaireFlagTagKey(sectionNodeId: string, tagId: string): string {
  return `${sectionNodeId}:${tagId}`;
}

export function emptyPatientProfile(): PatientProfileBlock {
  return {
    firstName: "",
    lastName: "",
    birthMonth: null,
    birthYear: null,
    gender: null,
    height: null,
    weight: null,
    city: null,
  };
}

export function emptyQuestionnaireInstanceData(): QuestionnaireInstanceData {
  return {
    patientProfile: emptyPatientProfile(),
    sections: {},
    flaggedTagKeys: [],
    flaggedNodeIds: [],
  };
}

export function normalizeQuestionnaireInstanceData(
  data: QuestionnaireInstanceData
): QuestionnaireInstanceData {
  return {
    ...data,
    flaggedTagKeys: data.flaggedTagKeys ?? [],
    flaggedNodeIds: data.flaggedNodeIds ?? [],
  };
}

export const questionnaireMessageContentSchema = z.object({
  instanceId: z.string().min(1),
  templateName: z.string().min(1),
});

export const questionnaireTemplateMessageContentSchema = z.object({
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  snapshot: questionnaireTemplateStructureSchema.optional(),
  hintsMode: questionnaireHintsModeSchema.optional(),
});

export type QuestionnaireMessageContent = z.infer<typeof questionnaireMessageContentSchema>;
export type QuestionnaireTemplateMessageContent = z.infer<typeof questionnaireTemplateMessageContentSchema>;

/** Convert legacy i18n section format to questionnaire tree nodes. */
export function convertI18nSectionsToStructure(
  sections: ReadonlyArray<{
    readonly key: string;
    readonly title: string;
    readonly hint: string;
    readonly subsections: ReadonlyArray<{
      readonly key: string;
      readonly title: string;
      readonly hint: string;
      readonly tags: ReadonlyArray<{ readonly key: string; readonly label: string; readonly hint: string }>;
    }>;
  }>
): QuestionnaireTemplateStructure {
  return {
    root: sections.map((section) => ({
      id: section.key,
      title: section.title,
      hint: section.hint || undefined,
      children: section.subsections.map((sub) => ({
        id: sub.key,
        title: sub.title,
        hint: sub.hint || undefined,
        tags: sub.tags.map((tag) => ({
          id: tag.key,
          label: tag.label,
          hint: tag.hint || undefined,
        })),
      })),
    })),
  };
}
