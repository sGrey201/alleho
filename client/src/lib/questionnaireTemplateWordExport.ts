import { t } from "@/lib/i18n";
import type { QuestionnaireNode, QuestionnaireTemplateStructure } from "@shared/questionnaireTypes";

function sanitizeFilename(title: string): string {
  const sanitized = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u0400-\u04FF\-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "questionnaire";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function headingTag(depth: number): string {
  return `h${Math.min(depth + 1, 6)}`;
}

function renderBlankField(label: string): string {
  return `<p><strong>${escapeHtml(label)}:</strong></p><p class="answer">&nbsp;</p>`;
}

function renderNode(node: QuestionnaireNode, depth: number): string {
  const parts: string[] = [];
  parts.push(`<${headingTag(depth)}>${escapeHtml(node.title)}</${headingTag(depth)}>`);

  if (node.hint?.trim()) {
    parts.push(`<p class="hint">${escapeHtml(node.hint)}</p>`);
  }

  for (const tag of node.tags ?? []) {
    parts.push(`<p class="tag">&#9744; ${escapeHtml(tag.label)}</p>`);
    if (tag.hint?.trim()) {
      parts.push(`<p class="tag-hint">${escapeHtml(tag.hint)}</p>`);
    }
    parts.push(`<p class="answer">&nbsp;</p>`);
  }

  for (const child of node.children ?? []) {
    parts.push(renderNode(child, depth + 1));
  }

  return parts.join("\n");
}

function buildQuestionnaireWordHtml(name: string, structure: QuestionnaireTemplateStructure): string {
  const patientBlock = [
    `<h2>${escapeHtml(t.questionnairePatientBlockTitle)}</h2>`,
    renderBlankField(t.lastName),
    renderBlankField(t.firstName),
    renderBlankField(t.birthMonth),
    renderBlankField(t.birthYear),
    renderBlankField(t.gender),
    renderBlankField(t.height),
    renderBlankField(t.weight),
    renderBlankField(t.city),
  ].join("\n");

  const sections = structure.root.map((node) => renderNode(node, 1)).join("\n");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(name)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.35; }
    h1 { font-size: 18pt; margin: 0 0 12pt; }
    h2 { font-size: 14pt; margin: 16pt 0 8pt; }
    h3 { font-size: 12pt; margin: 12pt 0 6pt; }
    h4 { font-size: 11pt; margin: 10pt 0 4pt; }
    p { margin: 0 0 6pt; }
    .hint, .tag-hint { color: #555555; font-style: italic; font-size: 10pt; }
    .tag { margin: 8pt 0 2pt 12pt; }
    .answer { border-bottom: 1px solid #999999; min-height: 14pt; margin: 0 0 10pt 24pt; }
  </style>
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  ${patientBlock}
  ${sections}
</body>
</html>`;
}

export function exportQuestionnaireTemplateToWord(
  name: string,
  structure: QuestionnaireTemplateStructure
): void {
  const html = buildQuestionnaireWordHtml(name, structure);
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(name)}.doc`;
  anchor.click();
  URL.revokeObjectURL(url);
}
