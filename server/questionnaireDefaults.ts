import defaultStructureJson from "@shared/defaultQuestionnaireStructure.json";
import type { QuestionnaireTemplateStructure } from "@shared/questionnaireTypes";
import { questionnaireTemplateStructureSchema } from "@shared/questionnaireTypes";

export const DEFAULT_QUESTIONNAIRE_TEMPLATE_NAME = "Стандартная анкета";

const parsed = questionnaireTemplateStructureSchema.parse(defaultStructureJson);

export function getDefaultQuestionnaireStructure(): QuestionnaireTemplateStructure {
  return structuredClone(parsed);
}

export function deepCloneQuestionnaireStructure(
  structure: QuestionnaireTemplateStructure
): QuestionnaireTemplateStructure {
  return structuredClone(structure);
}
