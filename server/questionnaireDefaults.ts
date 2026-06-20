import type { QuestionnaireTemplateStructure } from "@shared/questionnaireTypes";

export function deepCloneQuestionnaireStructure(
  structure: QuestionnaireTemplateStructure
): QuestionnaireTemplateStructure {
  return structuredClone(structure);
}
