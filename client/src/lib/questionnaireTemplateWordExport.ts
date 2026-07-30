import { t } from "@/lib/i18n";
import type {
  PatientProfileBlock,
  QuestionnaireInstanceData,
  QuestionnaireNode,
  QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";
import { normalizeQuestionnaireInstanceData } from "@shared/questionnaireTypes";

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

function escapeHtmlMultiline(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
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

function downloadWordDoc(name: string, html: string): void {
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

function wordDocumentShell(name: string, bodyHtml: string): string {
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
    .field { margin: 0 0 4pt; }
    .entry-label { margin: 8pt 0 2pt 0; font-weight: 600; }
    .entry-desc { margin: 0 0 8pt 18pt; color: #444444; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

function buildQuestionnaireWordHtml(name: string, structure: QuestionnaireTemplateStructure): string {
  const patientBlock = [
    `<h2>${escapeHtml(t.questionnairePatientBlockTitle)}</h2>`,
    renderBlankField(t.firstName),
    renderBlankField(t.birthMonth),
    renderBlankField(t.birthYear),
    renderBlankField(t.gender),
    renderBlankField(t.height),
    renderBlankField(t.weight),
  ].join("\n");

  const sections = structure.root.map((node) => renderNode(node, 1)).join("\n");

  return wordDocumentShell(
    name,
    `<h1>${escapeHtml(name)}</h1>\n${patientBlock}\n${sections}`
  );
}

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

function getGenderLabel(gender: string | null): string | null {
  if (gender === "male") return t.genderMale;
  if (gender === "female") return t.genderFemale;
  if (gender === "other") return t.genderOther;
  return null;
}

function hasFilledProfile(profile: PatientProfileBlock): boolean {
  return !!(
    profile.firstName?.trim() ||
    profile.lastName?.trim() ||
    profile.birthMonth ||
    profile.birthYear ||
    profile.gender ||
    profile.height ||
    profile.weight ||
    profile.city?.trim()
  );
}

function sectionHasSelectedTag(
  node: QuestionnaireNode,
  sections: QuestionnaireInstanceData["sections"]
): boolean {
  if ((sections[node.id]?.length ?? 0) > 0) return true;
  return (node.children ?? []).some((child) => sectionHasSelectedTag(child, sections));
}

function renderFilledField(label: string, value: string): string {
  return `<p class="field"><strong>${escapeHtml(label)}:</strong> ${escapeHtmlMultiline(value)}</p>`;
}

function renderFilledNodes(
  nodes: QuestionnaireNode[],
  sections: QuestionnaireInstanceData["sections"],
  depth: number
): string[] {
  const out: string[] = [];

  for (const node of nodes) {
    if (!sectionHasSelectedTag(node, sections)) continue;

    const entries = sections[node.id] ?? [];
    const tagById = new Map((node.tags ?? []).map((tag) => [tag.id, tag]));

    out.push(`<${headingTag(depth)}>${escapeHtml(node.title)}</${headingTag(depth)}>`);

    for (const entry of entries) {
      const label = tagById.get(entry.tagKey)?.label ?? entry.tagKey;
      const description = entry.description.trim();
      out.push(`<p class="entry-label">• ${escapeHtml(label)}</p>`);
      if (description) {
        out.push(`<p class="entry-desc">${escapeHtmlMultiline(description)}</p>`);
      }
    }

    if (node.children?.length) {
      out.push(...renderFilledNodes(node.children, sections, depth + 1));
    }
  }

  return out;
}

function buildFilledQuestionnaireWordHtml(
  name: string,
  structure: QuestionnaireTemplateStructure,
  data: QuestionnaireInstanceData,
  options?: { includeHomeopathNotes?: boolean }
): string {
  const normalized = normalizeQuestionnaireInstanceData(data);
  const profile = normalized.patientProfile;
  const notes = (normalized.homeopathNotes ?? "").trim();
  const profileFilled = hasFilledProfile(profile);
  const sectionHtml = renderFilledNodes(structure.root, normalized.sections, 1);
  const includeNotes = !!options?.includeHomeopathNotes && !!notes;

  if (!profileFilled && sectionHtml.length === 0 && !includeNotes) {
    return wordDocumentShell(
      name,
      `<h1>${escapeHtml(name)}</h1>\n<p>${escapeHtml(t.questionnaireEmptySummary)}</p>`
    );
  }

  const parts: string[] = [`<h1>${escapeHtml(name)}</h1>`];

  if (profileFilled) {
    parts.push(`<h2>${escapeHtml(t.questionnairePatientBlockTitle)}</h2>`);
    if (profile.lastName?.trim()) {
      parts.push(renderFilledField(t.lastName, profile.lastName.trim()));
    }
    if (profile.firstName?.trim()) {
      parts.push(renderFilledField(t.firstName, profile.firstName.trim()));
    }
    if (profile.birthMonth) {
      const monthLabel = months.find((m) => m.value === profile.birthMonth)?.label;
      if (monthLabel) parts.push(renderFilledField(t.birthMonth, monthLabel));
    }
    if (profile.birthYear != null) {
      parts.push(renderFilledField(t.birthYear, String(profile.birthYear)));
    }
    const genderLabel = getGenderLabel(profile.gender);
    if (genderLabel) parts.push(renderFilledField(t.gender, genderLabel));
    if (profile.height != null) {
      parts.push(renderFilledField(t.height, String(profile.height)));
    }
    if (profile.weight != null) {
      parts.push(renderFilledField(t.weight, String(profile.weight)));
    }
    if (profile.city?.trim()) {
      parts.push(renderFilledField(t.city, profile.city.trim()));
    }
  }

  parts.push(...sectionHtml);

  if (includeNotes) {
    parts.push(`<h2>${escapeHtml(t.homeopathNotesDescription)}</h2>`);
    parts.push(`<p>${escapeHtmlMultiline(notes)}</p>`);
  }

  return wordDocumentShell(name, parts.join("\n"));
}

export function exportQuestionnaireTemplateToWord(
  name: string,
  structure: QuestionnaireTemplateStructure
): void {
  downloadWordDoc(name, buildQuestionnaireWordHtml(name, structure));
}

export function exportQuestionnaireFilledToWord(
  name: string,
  structure: QuestionnaireTemplateStructure,
  data: QuestionnaireInstanceData,
  options?: { includeHomeopathNotes?: boolean }
): void {
  downloadWordDoc(name, buildFilledQuestionnaireWordHtml(name, structure, data, options));
}
