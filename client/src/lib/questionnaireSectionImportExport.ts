import {
  MAX_QUESTIONNAIRE_DEPTH,
  getQuestionnaireNodeDepth,
  questionnaireNodeSchema,
  type QuestionnaireNode,
} from "@shared/questionnaireTypes";

function sanitizeFilename(title: string): string {
  const sanitized = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u0400-\u04FF\-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "section";
}

export function exportSectionToTextFile(node: QuestionnaireNode): void {
  const json = JSON.stringify(node, null, 2);
  const blob = new Blob([json], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(node.title)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseSectionFromText(text: string): QuestionnaireNode {
  const parsed: unknown = JSON.parse(text);
  return questionnaireNodeSchema.parse(parsed);
}

export function mergeImportedSection(
  existing: QuestionnaireNode,
  imported: QuestionnaireNode
): QuestionnaireNode {
  const merged: QuestionnaireNode = { ...existing };
  if (imported.children !== undefined) {
    merged.children = imported.children;
  } else {
    delete merged.children;
  }
  if (imported.tags !== undefined) {
    merged.tags = imported.tags;
  } else {
    delete merged.tags;
  }
  return merged;
}

export function validateMergedSectionDepth(pathLength: number, merged: QuestionnaireNode): boolean {
  return getQuestionnaireNodeDepth(merged) <= MAX_QUESTIONNAIRE_DEPTH - pathLength + 1;
}
