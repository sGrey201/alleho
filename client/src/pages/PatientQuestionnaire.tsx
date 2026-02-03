import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
  { key: 'psyche', label: t.sectionPsyche },
  { key: 'sleep', label: t.sectionSleep },
  { key: 'energy', label: t.sectionEnergy },
  { key: 'cognitive', label: t.sectionCognitive },
  { key: 'behavior', label: t.sectionBehavior },
  { key: 'character', label: t.sectionCharacter },
  { key: 'social', label: t.sectionSocial },
  { key: 'general', label: t.sectionGeneral },
  { key: 'medicalHistory', label: t.sectionMedicalHistory },
];

interface PatientQuestionnaireResponse {
  data: QuestionnaireData;
  patient: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  updatedAt: string;
}

export default function PatientQuestionnaire() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/patient/:userId");
  const userId = params?.userId;

  const { data, isLoading, error } = useQuery<PatientQuestionnaireResponse>({
    queryKey: ['/api/patient', userId, 'questionnaire'],
    queryFn: async () => {
      const res = await fetch(`/api/patient/${userId}/questionnaire`);
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'access_denied' : 'not_found');
      }
      return res.json();
    },
    enabled: isAuthenticated && isAdmin && !!userId,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    } else if (!authLoading && isAuthenticated && !isAdmin) {
      setLocation('/');
    }
  }, [authLoading, isAuthenticated, isAdmin, setLocation]);

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

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          onClick={() => setLocation('/my-patients')}
          className="mb-4"
          data-testid="button-back-to-patients"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t.backToPatients}
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">
            {(error as Error).message === 'access_denied' ? t.accessDenied : t.questionnaireNotFound}
          </h2>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const formData = data.data;
  const patientName = formData.patientName || data.patient.firstName || data.patient.email;

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case 'male': return t.genderMale;
      case 'female': return t.genderFemale;
      case 'other': return t.genderOther;
      default: return '';
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-2 py-4 sm:px-6 sm:py-8 lg:px-8 pl-[16px] pr-[16px]">
      <Button
        variant="ghost"
        onClick={() => setLocation('/my-patients')}
        className="mb-4"
        data-testid="button-back-to-patients"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t.backToPatients}
      </Button>

      <div className="sm:rounded-lg sm:border sm:bg-card sm:shadow-sm">
        <div className="pb-2 sm:p-6">
          <h2 className="text-xl font-semibold mb-1" data-testid="text-patient-questionnaire-title">
            {t.patientQuestionnaire}: {patientName}
          </h2>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-2">
            {formData.birthMonth && formData.birthYear && (
              <span>{formData.birthMonth.toString().padStart(2, '0')}.{formData.birthYear}</span>
            )}
            {formData.gender && <span>• {getGenderLabel(formData.gender)}</span>}
            <span>• {data.patient.email}</span>
            <span>• {t.lastUpdated}: {format(new Date(data.updatedAt), 'dd.MM.yyyy')}</span>
          </div>
        </div>

        <div className="sm:px-6 sm:pb-6">
          <Accordion type="single" collapsible className="w-full">
            {physicalSections.map((section) => {
              const sectionData = formData[section.key] as { problem?: string; better?: string; worse?: string } | undefined;
              const hasContent = sectionData?.problem || sectionData?.better || sectionData?.worse;
              
              return (
                <AccordionItem key={section.key} value={section.key}>
                  <AccordionTrigger data-testid={`accordion-${section.key}`}>
                    <span className={hasContent ? 'font-medium' : 'text-muted-foreground'}>
                      {section.label}
                      {hasContent && <span className="ml-2 text-primary">•</span>}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {sectionData?.problem && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">{t.describeProblem}</p>
                          <p className="whitespace-pre-wrap">{sectionData.problem}</p>
                        </div>
                      )}
                      {sectionData?.better && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">{t.whatMakesBetter}</p>
                          <p className="whitespace-pre-wrap">{sectionData.better}</p>
                        </div>
                      )}
                      {sectionData?.worse && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">{t.whatMakesWorse}</p>
                          <p className="whitespace-pre-wrap">{sectionData.worse}</p>
                        </div>
                      )}
                      {!hasContent && (
                        <p className="text-muted-foreground italic">{t.noDataAvailable || 'Нет данных'}</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            {psychSections.map((section) => {
              const sectionData = formData[section.key] as string | undefined;
              const hasContent = !!sectionData;
              
              return (
                <AccordionItem key={section.key} value={section.key}>
                  <AccordionTrigger data-testid={`accordion-${section.key}`}>
                    <span className={hasContent ? 'font-medium' : 'text-muted-foreground'}>
                      {section.label}
                      {hasContent && <span className="ml-2 text-primary">•</span>}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2">
                      {sectionData ? (
                        <p className="whitespace-pre-wrap">{sectionData}</p>
                      ) : (
                        <p className="text-muted-foreground italic">{t.noDataAvailable || 'Нет данных'}</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
