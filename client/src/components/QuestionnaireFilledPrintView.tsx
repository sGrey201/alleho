import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import type {
  PatientProfileBlock,
  QuestionnaireInstanceData,
  QuestionnaireNode,
  QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";
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

function getGenderLabel(gender: string | null) {
  if (gender === "male") return t.genderMale;
  if (gender === "female") return t.genderFemale;
  if (gender === "other") return t.genderOther;
  return null;
}

function sectionHasSelectedTag(
  node: QuestionnaireNode,
  sections: QuestionnaireInstanceData["sections"]
): boolean {
  if ((sections[node.id]?.length ?? 0) > 0) return true;
  return (node.children ?? []).some((child) => sectionHasSelectedTag(child, sections));
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

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-foreground">
      <span className="font-semibold">{label}:</span>{" "}
      <span className="whitespace-pre-wrap">{value}</span>
    </p>
  );
}

function SectionHeading({ title, depth }: { title: string; depth: number }) {
  return (
    <h3
      className={cn(
        "font-semibold tracking-tight text-foreground",
        depth === 1 && "mt-5 mb-2 text-base border-b border-border/70 pb-1",
        depth === 2 && "mt-3 mb-1.5 text-[15px]",
        depth >= 3 && "mt-2 mb-1 text-sm"
      )}
    >
      {title}
    </h3>
  );
}

function renderFilledNodes(
  nodes: QuestionnaireNode[],
  sections: QuestionnaireInstanceData["sections"],
  depth: number
): ReactNode[] {
  const out: ReactNode[] = [];

  for (const node of nodes) {
    if (!sectionHasSelectedTag(node, sections)) continue;

    const entries = sections[node.id] ?? [];
    const tagById = new Map((node.tags ?? []).map((tag) => [tag.id, tag]));

    out.push(
      <section key={node.id} className={depth > 1 ? "pl-3" : undefined}>
        <SectionHeading title={node.title} depth={depth} />
        {entries.length > 0 && (
          <ul className="mb-2 space-y-2">
            {entries.map((entry) => {
              const label = tagById.get(entry.tagKey)?.label ?? entry.tagKey;
              const description = entry.description.trim();
              return (
                <li key={`${node.id}-${entry.tagKey}`} className="text-[15px] leading-relaxed">
                  <p className="font-medium text-foreground">• {label}</p>
                  {description ? (
                    <p className="mt-0.5 whitespace-pre-wrap pl-4 text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {node.children?.length
          ? renderFilledNodes(node.children, sections, depth + 1)
          : null}
      </section>
    );
  }

  return out;
}

type Props = {
  templateName?: string;
  structure: QuestionnaireTemplateStructure;
  data: QuestionnaireInstanceData;
  showHomeopathNotes?: boolean;
  hideTitle?: boolean;
};

export function QuestionnaireFilledPrintView({
  templateName,
  structure,
  data,
  showHomeopathNotes = false,
  hideTitle = false,
}: Props) {
  const profile = data.patientProfile;
  const notes = (data.homeopathNotes ?? "").trim();
  const profileFilled = hasFilledProfile(profile);
  const sectionNodes = renderFilledNodes(structure.root, data.sections, 1);
  const hasContent = profileFilled || sectionNodes.length > 0 || (showHomeopathNotes && !!notes);

  if (!hasContent) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t.questionnaireEmptySummary}</p>
      </div>
    );
  }

  const monthLabel = profile.birthMonth
    ? months.find((m) => m.value === profile.birthMonth)?.label
    : null;
  const genderLabel = getGenderLabel(profile.gender);

  return (
    <article className="questionnaire-print-view mx-auto max-w-2xl space-y-5 p-6 text-foreground">
      {!hideTitle && templateName ? (
        <header>
          <h2 className="text-xl font-semibold tracking-tight">{templateName}</h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {t.questionnairePrintFormLabel}
          </p>
        </header>
      ) : (
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t.questionnairePrintFormLabel}
        </p>
      )}

      {profileFilled && (
        <section>
          <h3 className="mb-2 border-b border-border/70 pb-1 text-base font-semibold">
            {t.questionnairePatientBlockTitle}
          </h3>
          <div className="space-y-1">
            {profile.lastName?.trim() ? (
              <FieldRow label={t.lastName} value={profile.lastName.trim()} />
            ) : null}
            {profile.firstName?.trim() ? (
              <FieldRow label={t.firstName} value={profile.firstName.trim()} />
            ) : null}
            {monthLabel ? <FieldRow label={t.birthMonth} value={monthLabel} /> : null}
            {profile.birthYear != null ? (
              <FieldRow label={t.birthYear} value={String(profile.birthYear)} />
            ) : null}
            {genderLabel ? <FieldRow label={t.gender} value={genderLabel} /> : null}
            {profile.height != null ? (
              <FieldRow label={t.height} value={String(profile.height)} />
            ) : null}
            {profile.weight != null ? (
              <FieldRow label={t.weight} value={String(profile.weight)} />
            ) : null}
            {profile.city?.trim() ? (
              <FieldRow label={t.city} value={profile.city.trim()} />
            ) : null}
          </div>
        </section>
      )}

      {sectionNodes}

      {showHomeopathNotes && notes ? (
        <section>
          <h3 className="mb-2 border-b border-border/70 pb-1 text-base font-semibold">
            {t.homeopathNotesDescription}
          </h3>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{notes}</p>
        </section>
      ) : null}
    </article>
  );
}
