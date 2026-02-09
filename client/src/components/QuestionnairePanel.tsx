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

interface TagSelectorProps {
  tags: ReadonlyArray<{ readonly key: string; readonly label: string; readonly hint: string }>;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onBlur?: () => void;
}

function TagSelector({ tags, selectedTags, onTagsChange, onBlur }: TagSelectorProps) {
  const toggleTag = (tagKey: string) => {
    const newTags = selectedTags.includes(tagKey)
      ? selectedTags.filter(t => t !== tagKey)
      : [...selectedTags, tagKey];
    onTagsChange(newTags);
  };

  return (
    <div 
      className="space-y-2"
      onBlur={onBlur}
    >
      {tags.map((tag) => (
        <div key={tag.key} className="flex items-center space-x-2">
          <Checkbox
            id={`tag-${tag.key}`}
            checked={selectedTags.includes(tag.key)}
            onCheckedChange={() => toggleTag(tag.key)}
          />
          <label
            htmlFor={`tag-${tag.key}`}
            className="text-sm cursor-pointer flex-1"
          >
            {tag.label}
          </label>
          {tag.hint && (
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-72" side="bottom" align="start">
                <p className="text-sm text-muted-foreground">{tag.hint}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      ))}
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

  useEffect(() => {
    if (savedDataResponse?.data && isOwnQuestionnaire) {
      setFormData(savedDataResponse.data);
      formDataRef.current = savedDataResponse.data;
    }
  }, [savedDataResponse, isOwnQuestionnaire]);

  useEffect(() => {
    if (patientData && !isOwnQuestionnaire) {
      setFormData(patientData.data);
      formDataRef.current = patientData.data;
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

  const updateSectionTags = (sectionKey: string, tags: string[]) => {
    setFormData(prev => ({
      ...prev,
      [sectionKey]: { ...(prev as any)[sectionKey], tags },
    }));
  };

  const updateSectionDescription = (sectionKey: string, description: string) => {
    setFormData(prev => ({
      ...prev,
      [sectionKey]: { ...(prev as any)[sectionKey], description },
    }));
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
                        <div className="space-y-4 pt-2">
                          <TagSelector
                            tags={sub.tags}
                            selectedTags={(formData as any)[sub.key]?.tags || []}
                            onTagsChange={(tags) => updateSectionTags(sub.key, tags)}
                            onBlur={triggerAutoSave}
                          />
                          <Textarea
                            data-testid={`panel-input-${sub.key}-description`}
                            placeholder={t.describeSelectedTraits}
                            value={(formData as any)[sub.key]?.description || ''}
                            onChange={(e) => updateSectionDescription(sub.key, e.target.value)}
                            onBlur={triggerAutoSave}
                            className="min-h-[200px]"
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
