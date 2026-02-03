import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { HelpCircle, Loader2, Check, X, Plus, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import type { QuestionnaireData } from "@shared/schema";

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
  const [newDoctorEmail, setNewDoctorEmail] = useState('');

  const [, patientParams] = useRoute("/patient/:userId");
  const patientId = patientParams?.userId;
  const isPatientView = !!patientId;

  const { data: savedData, isLoading } = useQuery<QuestionnaireData>({
    queryKey: ['/api/questionnaire'],
    enabled: isAuthenticated && isAdmin && !isPatientView,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: patientData, isLoading: isLoadingPatient } = useQuery<PatientQuestionnaireResponse>({
    queryKey: ['/api/patient', patientId, 'questionnaire'],
    queryFn: async () => {
      const res = await fetch(`/api/patient/${patientId}/questionnaire`);
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'access_denied' : 'not_found');
      }
      return res.json();
    },
    enabled: isAuthenticated && isAdmin && isPatientView,
  });

  useEffect(() => {
    if (savedData && !isPatientView) {
      setFormData(savedData);
      formDataRef.current = savedData;
    }
  }, [savedData, isPatientView]);

  useEffect(() => {
    if (patientData && isPatientView) {
      setFormData(patientData.data);
      formDataRef.current = patientData.data;
    }
  }, [patientData, isPatientView]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    } else if (!authLoading && isAuthenticated && !isAdmin) {
      setLocation('/');
    }
  }, [authLoading, isAuthenticated, isAdmin, setLocation]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuestionnaireData) => {
      const url = isPatientView ? `/api/patient/${patientId}/questionnaire` : "/api/questionnaire";
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

  const updateSettings = (field: string, value: string | number | undefined) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      return updated;
    });
  };

  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const addDoctorEmail = async () => {
    if (!newDoctorEmail || !newDoctorEmail.includes('@')) {
      toast({ title: t.invalidEmail, variant: 'destructive' });
      return;
    }
    const currentEmails = formData.sharedWithEmails || [];
    if (currentEmails.includes(newDoctorEmail)) {
      toast({ title: t.emailAlreadyAdded, variant: 'destructive' });
      return;
    }

    setIsCheckingEmail(true);
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(newDoctorEmail)}`);
      const data = await res.json();
      
      if (!data.exists) {
        toast({ title: t.userNotFound, variant: 'destructive' });
        return;
      }

      setFormData(prev => ({
        ...prev,
        sharedWithEmails: [...(prev.sharedWithEmails || []), newDoctorEmail],
      }));
      setNewDoctorEmail('');
      setTimeout(triggerAutoSave, 100);
    } catch (error) {
      toast({ title: t.emailCheckError, variant: 'destructive' });
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const removeDoctorEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      sharedWithEmails: (prev.sharedWithEmails || []).filter(e => e !== email),
    }));
  };

  const updateHomeopathNotes = (value: string) => {
    setFormData(prev => ({
      ...prev,
      homeopathNotes: value,
    }));
  };

  if (authLoading || isLoading || isLoadingPatient) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case 'male': return t.genderMale;
      case 'female': return t.genderFemale;
      case 'other': return t.genderOther;
      default: return '';
    }
  };

  const patientName = isPatientView 
    ? (formData.patientName || patientData?.patient.firstName || patientData?.patient.email)
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-2 py-4 sm:px-6 sm:py-8 lg:px-8 pl-[16px] pr-[16px]">
        <div className="sm:rounded-lg sm:border sm:bg-card sm:shadow-sm">
          <div className="flex items-start justify-between gap-4 pb-2 sm:p-6">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation(isPatientView ? `/health-wall/${patientId}` : '/health-wall')}
                data-testid="button-back-to-health-wall"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-col" data-testid="text-patient-info">
                <h1 className="text-lg font-bold">
                  {formData.patientName || t.questionnaire}
                </h1>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-2">
                  {formData.birthMonth && formData.birthYear && (
                    <span>{formData.birthMonth.toString().padStart(2, '0')}.{formData.birthYear}</span>
                  )}
                  {formData.gender && <span>• {getGenderLabel(formData.gender)}</span>}
                  {isPatientView && patientData?.patient.email && <span>• {patientData.patient.email}</span>}
                  {isPatientView && patientData?.updatedAt && <span>• {t.lastUpdated}: {format(new Date(patientData.updatedAt), 'dd.MM.yyyy')}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
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
            </div>
          </div>
          <div className="sm:px-6 sm:pb-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="basicInfo">
              <AccordionTrigger data-testid="accordion-basic-info">
                {t.sectionBasicInfo}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-6 pt-2">
                  {isPatientView ? (
                    <>
                      <div className="space-y-2">
                        <Label>{t.patientName}</Label>
                        <div className="text-sm p-2 bg-muted rounded-md">{formData.patientName || '—'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.birthMonth}</Label>
                          <div className="text-sm p-2 bg-muted rounded-md">
                            {formData.birthMonth ? months.find(m => m.value === formData.birthMonth)?.label : '—'}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>{t.birthYear}</Label>
                          <div className="text-sm p-2 bg-muted rounded-md">{formData.birthYear || '—'}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t.gender}</Label>
                        <div className="text-sm p-2 bg-muted rounded-md">{formData.gender ? getGenderLabel(formData.gender) : '—'}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="patientName">{t.patientName}</Label>
                        <Input
                          id="patientName"
                          value={formData.patientName || ''}
                          onChange={(e) => updateSettings('patientName', e.target.value)}
                          onBlur={triggerAutoSave}
                          data-testid="input-patient-name"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.birthMonth}</Label>
                          <Select
                            value={formData.birthMonth?.toString() || ''}
                            onValueChange={(v) => {
                              updateSettings('birthMonth', v ? parseInt(v) : undefined);
                              setTimeout(triggerAutoSave, 100);
                            }}
                          >
                            <SelectTrigger data-testid="select-birth-month">
                              <SelectValue placeholder={t.selectMonth} />
                            </SelectTrigger>
                            <SelectContent>
                              {months.map((m) => (
                                <SelectItem key={m.value} value={m.value.toString()}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="birthYear">{t.birthYear}</Label>
                          <Input
                            id="birthYear"
                            type="number"
                            min={1900}
                            max={new Date().getFullYear()}
                            value={formData.birthYear || ''}
                            onChange={(e) => updateSettings('birthYear', e.target.value ? parseInt(e.target.value) : undefined)}
                            onBlur={triggerAutoSave}
                            data-testid="input-birth-year"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t.gender}</Label>
                        <Select
                          value={formData.gender || ''}
                          onValueChange={(v) => {
                            updateSettings('gender', v as 'male' | 'female' | 'other');
                            setTimeout(triggerAutoSave, 100);
                          }}
                        >
                          <SelectTrigger data-testid="select-gender">
                            <SelectValue placeholder={t.selectGender} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t.genderMale}</SelectItem>
                            <SelectItem value="female">{t.genderFemale}</SelectItem>
                            <SelectItem value="other">{t.genderOther}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{t.doctorAccess}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder={t.enterEmail}
                            value={newDoctorEmail}
                            onChange={(e) => setNewDoctorEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addDoctorEmail()}
                            data-testid="input-doctor-email"
                          />
                          <Button onClick={addDoctorEmail} size="icon" disabled={isCheckingEmail} data-testid="button-add-doctor">
                            {isCheckingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        </div>
                        {formData.sharedWithEmails && formData.sharedWithEmails.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {formData.sharedWithEmails.map((email) => (
                              <div key={email} className="flex items-center justify-between rounded-md border p-2">
                                <span className="text-sm">{email}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    removeDoctorEmail(email);
                                    setTimeout(triggerAutoSave, 100);
                                  }}
                                  data-testid={`button-remove-doctor-${email}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

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

            {isPatientView && (
              <AccordionItem value="homeopathNotes">
                <AccordionTrigger data-testid="accordion-homeopath-notes">
                  {t.sectionHomeopathNotes}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-2">
                    <p className="text-sm text-muted-foreground">{t.homeopathNotesDescription}</p>
                    <Textarea
                      id="homeopath-notes"
                      data-testid="input-homeopath-notes"
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
      </div>
    </div>
  );
}
