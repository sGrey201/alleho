import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { Loader2, Check, HelpCircle } from "lucide-react";
import type { QuestionnaireData } from "@shared/schema";

interface PatientQuestionnaireResponse {
  data: QuestionnaireData;
  patient: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    gender?: string;
    birthMonth?: number;
    birthYear?: number;
  };
  updatedAt: string;
}

interface QuestionnairePanelProps {
  patientUserId: string;
  isOwnQuestionnaire: boolean;
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

interface TagEntry {
  tagKey: string;
  description: string;
}

interface TagSelectorProps {
  tags: ReadonlyArray<{ readonly key: string; readonly label: string; readonly hint: string }>;
  subsectionHint: string;
  selectedEntries: TagEntry[];
  onToggleTag: (tagKey: string) => void;
  onUpdateDescription: (tagKey: string, description: string) => void;
  onBlur?: () => void;
}

function TagSelector({ tags, selectedEntries, onToggleTag, onUpdateDescription, onBlur, subsectionHint }: TagSelectorProps) {
  const selectedKeys = selectedEntries.map(e => e.tagKey);
  const [justSelected, setJustSelected] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-2">
      {tags.map((tag) => {
        const isSelected = selectedKeys.includes(tag.key);
        const entry = selectedEntries.find(e => e.tagKey === tag.key);
        const shouldPulse = justSelected.has(tag.key);
        return (
          <div key={tag.key}>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`tag-${tag.key}`}
                checked={isSelected}
                onCheckedChange={() => {
                  if (!isSelected) {
                    setJustSelected(prev => new Set(prev).add(tag.key));
                    setTimeout(() => {
                      setJustSelected(prev => {
                        const next = new Set(prev);
                        next.delete(tag.key);
                        return next;
                      });
                    }, 1000);
                  }
                  onToggleTag(tag.key);
                  if (onBlur) onBlur();
                }}
              />
              <label
                htmlFor={`tag-${tag.key}`}
                className="text-sm cursor-pointer flex-1"
              >
                {tag.label}
              </label>
              {isSelected && (tag.hint || subsectionHint) && (
                <Popover>
                  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className={`h-5 w-5 shrink-0 ${shouldPulse ? 'animate-hint-pulse' : ''}`}>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] max-w-72" side="bottom" align="start">
                    <div className="text-sm text-muted-foreground space-y-1">
                      {tag.hint && <p>{tag.hint}</p>}
                      {subsectionHint && <p>{subsectionHint}</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {isSelected && (
              <div className="mt-1 mb-2">
                <Textarea
                  data-testid={`panel-input-tag-${tag.key}`}
                  placeholder={t.describeSelectedTraits}
                  value={entry?.description || ''}
                  onChange={(e) => {
                    onUpdateDescription(tag.key, e.target.value);
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }}
                  onBlur={onBlur}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                    }
                  }}
                  className="min-h-[60px] text-sm resize-none overflow-hidden"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuestionnairePanel({ patientUserId, isOwnQuestionnaire }: QuestionnairePanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [formData, setFormData] = useState<QuestionnaireData>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const formDataRef = useRef<QuestionnaireData>({});
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const isPatientView = !isOwnQuestionnaire;

  const { data: savedDataResponse, isLoading } = useQuery<{ data: QuestionnaireData }>({
    queryKey: ['/api/questionnaire'],
    enabled: isOwnQuestionnaire,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: patientData, isLoading: isLoadingPatient } = useQuery<PatientQuestionnaireResponse>({
    queryKey: ['/api/patient', patientUserId, 'questionnaire'],
    queryFn: async () => {
      const res = await fetch(`/api/patient/${patientUserId}/questionnaire`);
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'access_denied' : 'not_found');
      }
      return res.json();
    },
    enabled: !isOwnQuestionnaire,
  });

  const migrateFormData = (data: QuestionnaireData): QuestionnaireData => {
    const migrated = { ...data };
    const subsectionKeys = ['moodAndEnergy', 'socialRelations', 'willControl', 'intellectImagination', 'fears', 'emotionalReactions', 'specialMentalStates', 'desiresAversions', 'reactionToSuffering'];
    for (const key of subsectionKeys) {
      const val = (migrated as any)[key];
      if (val && !Array.isArray(val) && val.tags) {
        (migrated as any)[key] = (val.tags as string[]).map((tagKey: string) => ({
          tagKey,
          description: val.description || '',
        }));
      }
    }
    return migrated;
  };

  useEffect(() => {
    if (savedDataResponse?.data && isOwnQuestionnaire) {
      const migrated = migrateFormData(savedDataResponse.data);
      setFormData(migrated);
      formDataRef.current = migrated;
    }
  }, [savedDataResponse, isOwnQuestionnaire]);

  useEffect(() => {
    if (patientData && !isOwnQuestionnaire) {
      const migrated = migrateFormData(patientData.data);
      setFormData(migrated);
      formDataRef.current = migrated;
    }
  }, [patientData, isOwnQuestionnaire]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuestionnaireData) => {
      const url = isPatientView ? `/api/patient/${patientUserId}/questionnaire` : "/api/questionnaire";
      const res = await apiRequest("POST", url, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      formDataRef.current = variables;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      toast({ title: t.questionnaireSaveError, variant: "destructive" });
      setSaveStatus('idle');
    },
  });

  const triggerAutoSave = useCallback(() => {
    if (JSON.stringify(formDataRef.current) !== JSON.stringify(formData)) {
      formDataRef.current = formData;
      setSaveStatus('saving');
      saveMutation.mutate(formData);
    }
  }, [formData, saveMutation]);

  // Auto-save every 30 seconds if there are changes
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (JSON.stringify(formDataRef.current) !== JSON.stringify(formData)) {
        formDataRef.current = formData;
        setSaveStatus('saving');
        saveMutation.mutate(formData);
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [formData, saveMutation]);

  const toggleSectionTag = (sectionKey: string, tagKey: string) => {
    setFormData(prev => {
      const entries: TagEntry[] = (prev as any)[sectionKey] || [];
      const exists = entries.some(e => e.tagKey === tagKey);
      const updated = exists
        ? entries.filter(e => e.tagKey !== tagKey)
        : [...entries, { tagKey, description: '' }];
      return { ...prev, [sectionKey]: updated };
    });
  };

  const updateTagDescription = (sectionKey: string, tagKey: string, description: string) => {
    setFormData(prev => {
      const entries: TagEntry[] = (prev as any)[sectionKey] || [];
      return {
        ...prev,
        [sectionKey]: entries.map(e => e.tagKey === tagKey ? { ...e, description } : e),
      };
    });
  };

  const updateHomeopathNotes = (value: string) => {
    setFormData(prev => ({
      ...prev,
      homeopathNotes: value,
    }));
  };

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case 'male': return t.genderMale;
      case 'female': return t.genderFemale;
      case 'other': return t.genderOther;
      default: return '';
    }
  };

  if (isLoading || isLoadingPatient) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="profile">
            <AccordionTrigger data-testid="panel-accordion-profile" className="data-[state=open]:font-bold">
              {t.sectionProfile}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>{t.patientName}</Label>
                  <div className="text-sm p-2 bg-muted rounded-md">
                    {isPatientView 
                      ? (patientData?.patient?.firstName && patientData?.patient?.lastName 
                          ? `${patientData.patient.firstName} ${patientData.patient.lastName}` 
                          : patientData?.patient?.email || '—')
                      : (user?.firstName && user?.lastName 
                          ? `${user.firstName} ${user.lastName}` 
                          : user?.email || '—')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t.birthMonth}</Label>
                    <div className="text-sm p-2 bg-muted rounded-md">
                      {isPatientView
                        ? (patientData?.patient?.birthMonth ? months.find(m => m.value === patientData.patient.birthMonth)?.label : '—')
                        : (user?.birthMonth ? months.find(m => m.value === user.birthMonth)?.label : '—')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.birthYear}</Label>
                    <div className="text-sm p-2 bg-muted rounded-md">
                      {isPatientView ? (patientData?.patient?.birthYear || '—') : (user?.birthYear || '—')}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t.gender}</Label>
                  <div className="text-sm p-2 bg-muted rounded-md">
                    {isPatientView 
                      ? (patientData?.patient?.gender ? getGenderLabel(patientData.patient.gender) : '—')
                      : (user?.gender ? getGenderLabel(user.gender) : '—')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t.height}</Label>
                    <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-height">
                      {isPatientView ? (patientData?.patient?.height || '—') : (user?.height || '—')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.weight}</Label>
                    <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-weight">
                      {isPatientView ? (patientData?.patient?.weight || '—') : (user?.weight || '—')}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t.city}</Label>
                  <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-city">
                    {isPatientView ? (patientData?.patient?.city || '—') : (user?.city || '—')}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {t.questionnaireSections.map((section) => (
            <AccordionItem key={section.key} value={section.key}>
              <AccordionTrigger data-testid={`panel-accordion-${section.key}`} className="data-[state=open]:font-bold">
                <div className="flex items-center gap-2">
                  {section.title}
                  {saveStatus === 'saving' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {saveStatus === 'saved' && <Check className="h-4 w-4 text-green-500" />}
                  <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                      >
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-2rem)] max-w-80" side="bottom" align="start">
                      <p className="text-sm text-muted-foreground">{section.hint}</p>
                    </PopoverContent>
                  </Popover>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Accordion type="single" collapsible className="w-full">
                  {section.subsections.map((sub) => (
                    <AccordionItem key={sub.key} value={sub.key} className="border-0">
                      <AccordionTrigger data-testid={`panel-accordion-${sub.key}`} className="py-2 data-[state=open]:font-bold">
                        {sub.title}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          <TagSelector
                            tags={sub.tags}
                            subsectionHint={sub.hint}
                            selectedEntries={(formData as any)[sub.key] || []}
                            onToggleTag={(tagKey) => toggleSectionTag(sub.key, tagKey)}
                            onUpdateDescription={(tagKey, desc) => updateTagDescription(sub.key, tagKey, desc)}
                            onBlur={triggerAutoSave}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}

          {isPatientView && (
            <AccordionItem value="homeopathNotes">
              <AccordionTrigger data-testid="panel-accordion-homeopath-notes" className="data-[state=open]:font-bold">
                {t.sectionHomeopathNotes}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  <p className="text-sm text-muted-foreground">{t.homeopathNotesDescription}</p>
                  <Textarea
                    id="panel-homeopath-notes"
                    data-testid="panel-input-homeopath-notes"
                    value={formData.homeopathNotes || ''}
                    onChange={(e) => updateHomeopathNotes(e.target.value)}
                    onBlur={triggerAutoSave}
                    className="min-h-[200px]"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
}
