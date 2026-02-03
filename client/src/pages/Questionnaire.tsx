import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { HelpCircle, Loader2, Check, Settings } from "lucide-react";
import type { QuestionnaireData } from "@shared/schema";

type PhysicalSectionKey = 'head' | 'face' | 'neck' | 'chest' | 'heartBreathing' | 'stomach' | 'back' | 'arms' | 'legs' | 'joints' | 'muscles' | 'skin' | 'reproductive';
type PsychSectionKey = 'psyche' | 'sleep' | 'energy' | 'cognitive' | 'behavior' | 'character' | 'social' | 'general' | 'medicalHistory';

interface PhysicalSection {
  key: PhysicalSectionKey;
  label: string;
}

interface PsychSection {
  key: PsychSectionKey;
  label: string;
  hints: string;
}

const physicalSections: PhysicalSection[] = [
  { key: 'head', label: t.sectionHead },
  { key: 'face', label: t.sectionFace },
  { key: 'neck', label: t.sectionNeck },
  { key: 'chest', label: t.sectionChest },
  { key: 'heartBreathing', label: t.sectionHeartBreathing },
  { key: 'stomach', label: t.sectionStomach },
  { key: 'back', label: t.sectionBack },
  { key: 'arms', label: t.sectionArms },
  { key: 'legs', label: t.sectionLegs },
  { key: 'joints', label: t.sectionJoints },
  { key: 'muscles', label: t.sectionMuscles },
  { key: 'skin', label: t.sectionSkin },
  { key: 'reproductive', label: t.sectionReproductive },
];

const psychSections: PsychSection[] = [
  { key: 'psyche', label: t.sectionPsyche, hints: t.hintsPsyche },
  { key: 'sleep', label: t.sectionSleep, hints: t.hintsSleep },
  { key: 'energy', label: t.sectionEnergy, hints: t.hintsEnergy },
  { key: 'cognitive', label: t.sectionCognitive, hints: t.hintsCognitive },
  { key: 'behavior', label: t.sectionBehavior, hints: t.hintsBehavior },
  { key: 'character', label: t.sectionCharacter, hints: t.hintsCharacter },
  { key: 'social', label: t.sectionSocial, hints: t.hintsSocial },
  { key: 'general', label: t.sectionGeneral, hints: t.hintsGeneral },
  { key: 'medicalHistory', label: t.sectionMedicalHistory, hints: t.hintsMedicalHistory },
];

export default function Questionnaire() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<QuestionnaireData>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const formDataRef = useRef<QuestionnaireData>({});

  const { data: savedData, isLoading } = useQuery<QuestionnaireData>({
    queryKey: ['/api/questionnaire'],
    enabled: isAuthenticated && isAdmin,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (savedData) {
      setFormData(savedData);
      formDataRef.current = savedData;
    }
  }, [savedData]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    } else if (!authLoading && isAuthenticated && !isAdmin) {
      setLocation('/');
    }
  }, [authLoading, isAuthenticated, isAdmin, setLocation]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuestionnaireData) => {
      const res = await apiRequest("POST", "/api/questionnaire", data);
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

  const updatePhysicalField = (section: PhysicalSectionKey, field: 'problem' | 'better' | 'worse', value: string) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [field]: value,
      },
    }));
  };

  const updatePsychField = (section: PsychSectionKey, value: string) => {
    setFormData(prev => ({
      ...prev,
      [section]: value,
    }));
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl px-2 py-4 sm:px-6 sm:py-8 lg:px-8 pl-[16px] pr-[16px]">
      <div className="sm:rounded-lg sm:border sm:bg-card sm:shadow-sm">
        <div className="pb-2 sm:p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold" data-testid="text-questionnaire-title">{t.questionnaireTitle}</h2>
            <div className="flex items-center gap-2">
              {saveStatus !== 'idle' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {saveStatus === 'saving' && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t.saving}</span>
                    </>
                  )}
                  {saveStatus === 'saved' && (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{t.saved}</span>
                    </>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-questionnaire-settings"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t.questionnaireDescription}</p>
        </div>
        <div className="sm:px-6 sm:pb-6">
          <Accordion type="single" collapsible className="w-full">
            {physicalSections.map((section) => (
              <AccordionItem key={section.key} value={section.key}>
                <AccordionTrigger data-testid={`accordion-${section.key}`}>
                  {section.label}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${section.key}-problem`}>{t.describeProblem}</Label>
                      <Textarea
                        id={`${section.key}-problem`}
                        data-testid={`input-${section.key}-problem`}
                        value={(formData[section.key] as { problem?: string; better?: string; worse?: string } | undefined)?.problem || ''}
                        onChange={(e) => updatePhysicalField(section.key, 'problem', e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${section.key}-better`}>{t.whatMakesBetter}</Label>
                      <Textarea
                        id={`${section.key}-better`}
                        data-testid={`input-${section.key}-better`}
                        value={(formData[section.key] as { problem?: string; better?: string; worse?: string } | undefined)?.better || ''}
                        onChange={(e) => updatePhysicalField(section.key, 'better', e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${section.key}-worse`}>{t.whatMakesWorse}</Label>
                      <Textarea
                        id={`${section.key}-worse`}
                        data-testid={`input-${section.key}-worse`}
                        value={(formData[section.key] as { problem?: string; better?: string; worse?: string } | undefined)?.worse || ''}
                        onChange={(e) => updatePhysicalField(section.key, 'worse', e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[80px]"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}

            {psychSections.map((section) => (
              <AccordionItem key={section.key} value={section.key}>
                <AccordionTrigger data-testid={`accordion-${section.key}`}>
                  <div className="flex items-center gap-2">
                    {section.label}
                    <Popover>
                      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          data-testid={`hint-${section.key}`}
                        >
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[calc(100vw-2rem)] max-w-80" side="bottom" align="start">
                        <div className="space-y-2">
                          <h4 className="font-medium">{t.hintsTitle}</h4>
                          <p className="text-sm text-muted-foreground">{section.hints}</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-2">
                    <Textarea
                      id={`${section.key}-text`}
                      data-testid={`input-${section.key}`}
                      value={(formData[section.key] as string | undefined) || ''}
                      onChange={(e) => updatePsychField(section.key, e.target.value)}
                      onBlur={triggerAutoSave}
                      className="min-h-[120px]"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

        </div>
      </div>
    </div>
  );
}
