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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/lib/i18n";
import { Loader2, Check, X, HelpCircle, Eye, Pencil } from "lucide-react";
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
    height?: number;
    weight?: number;
    city?: string;
  } | null;
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
  hideUnselected?: boolean;
}

function TagSelector({ tags, selectedEntries, onToggleTag, onUpdateDescription, onBlur, subsectionHint, hideUnselected }: TagSelectorProps) {
  const selectedKeys = selectedEntries.map(e => e.tagKey);
  const [justSelected, setJustSelected] = useState<Set<string>>(new Set());

  const visibleTags = hideUnselected ? tags.filter(tag => selectedKeys.includes(tag.key)) : tags;

  return (
    <div className="space-y-2">
      {visibleTags.map((tag) => {
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
                  if (!isSelected && (tag.hint || subsectionHint)) {
                    setJustSelected(prev => new Set(prev).add(tag.key));
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
                <Popover open={shouldPulse ? true : undefined} onOpenChange={(open) => {
                  if (!open && shouldPulse) {
                    setJustSelected(prev => {
                      const next = new Set(prev);
                      next.delete(tag.key);
                      return next;
                    });
                  }
                }}>
                  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className={`h-5 w-5 shrink-0 ${shouldPulse ? 'animate-hint-pulse' : ''}`}>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] max-w-72" side="top" align="start">
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
  const formDataRef = useRef<QuestionnaireData>({});
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'view'>('edit');

  type SubSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [subSaveStatus, setSubSaveStatus] = useState<Record<string, SubSaveStatus>>({});
  const [subTextVisible, setSubTextVisible] = useState<Record<string, boolean>>({});
  const textTimerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSaveKeyRef = useRef<string | null>(null);

  const setStatusForKey = useCallback((key: string, status: SubSaveStatus) => {
    setSubSaveStatus(prev => ({ ...prev, [key]: status }));
    setSubTextVisible(prev => ({ ...prev, [key]: true }));
    if (textTimerRefs.current[key]) clearTimeout(textTimerRefs.current[key]);
    if (status === 'saved' || status === 'saving') {
      textTimerRefs.current[key] = setTimeout(() => {
        setSubTextVisible(prev => ({ ...prev, [key]: false }));
      }, 3000);
    }
  }, []);

  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileBirthMonth, setProfileBirthMonth] = useState<string>('');
  const [profileBirthYear, setProfileBirthYear] = useState('');
  const [profileHeight, setProfileHeight] = useState('');
  const [profileWeight, setProfileWeight] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const profileSavedRef = useRef<Record<string, string>>({});
  const profileCurrentRef = useRef<Record<string, string>>({});
  const profileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileInitializedRef = useRef(false);

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
    const subsectionKeys = ['occupation', 'familyStatus', 'appearanceConstitution', 'mainComplaint', 'otherComplaints', 'familyDiseases', 'pastDiseasesAdult', 'childhoodHistory', 'thirstAndThermoregulation', 'thirst', 'thermoregulation', 'painOralTeeth', 'painHead', 'painEars', 'painThroat', 'painEyes', 'painAbdomen', 'painFemaleGenital', 'painMaleGenital', 'painChest', 'painGI', 'painRectum', 'painUrinary', 'painSkin', 'painArms', 'painLegs', 'painMuscles', 'painBones', 'painOther', 'unusualSensations', 'sleepPatterns', 'woundDischarges', 'eyeNoseEarMouthDischarges', 'genitalDischarges', 'sputumDischarges', 'moodAndEnergy', 'socialRelations', 'willControl', 'intellectImagination', 'fears', 'emotionalReactions', 'specialMentalStates', 'desiresAversions', 'reactionToSuffering', 'impTime', 'impPhysical', 'impWeather', 'impBodyPosition', 'impFood', 'impPhysiological', 'worTime', 'worPhysical', 'worWeather', 'worBodyPosition', 'worFood', 'worPhysiological', 'foodLove', 'foodAversion', 'laterality'];
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
      const key = pendingSaveKeyRef.current;
      if (key) setStatusForKey(key, 'saved');
      pendingSaveKeyRef.current = null;
    },
    onError: () => {
      const key = pendingSaveKeyRef.current;
      if (key) setStatusForKey(key, 'error');
      pendingSaveKeyRef.current = null;
    },
  });

  const triggerAutoSave = useCallback((subsectionKey?: string) => {
    if (JSON.stringify(formDataRef.current) !== JSON.stringify(formData)) {
      formDataRef.current = formData;
      const key = subsectionKey || 'global';
      pendingSaveKeyRef.current = key;
      setStatusForKey(key, 'saving');
      saveMutation.mutate(formData);
    }
  }, [formData, saveMutation, setStatusForKey]);

  const retrySave = useCallback((subsectionKey: string) => {
    pendingSaveKeyRef.current = subsectionKey;
    setStatusForKey(subsectionKey, 'saving');
    saveMutation.mutate(formDataRef.current);
  }, [saveMutation, setStatusForKey]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (JSON.stringify(formDataRef.current) !== JSON.stringify(formData)) {
        formDataRef.current = formData;
        pendingSaveKeyRef.current = 'global';
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

  useEffect(() => {
    if (user && isOwnQuestionnaire && !profileInitializedRef.current) {
      profileInitializedRef.current = true;
      const vals: Record<string, string> = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        gender: user.gender || '',
        birthMonth: user.birthMonth?.toString() || '',
        birthYear: user.birthYear?.toString() || '',
        height: user.height?.toString() || '',
        weight: user.weight?.toString() || '',
        city: user.city || '',
      };
      setProfileFirstName(vals.firstName);
      setProfileLastName(vals.lastName);
      setProfileGender(vals.gender);
      setProfileBirthMonth(vals.birthMonth);
      setProfileBirthYear(vals.birthYear);
      setProfileHeight(vals.height);
      setProfileWeight(vals.weight);
      setProfileCity(vals.city);
      profileSavedRef.current = vals;
      profileCurrentRef.current = vals;
    }
  }, [user, isOwnQuestionnaire]);

  const doProfileSave = useCallback(() => {
    const snapshot = { ...profileCurrentRef.current };
    if (JSON.stringify(profileSavedRef.current) === JSON.stringify(snapshot)) return;
    profileSavedRef.current = snapshot;
    setStatusForKey('profile', 'saving');
    apiRequest('PUT', '/api/user/profile', {
      firstName: snapshot.firstName || null,
      lastName: snapshot.lastName || null,
      gender: snapshot.gender || null,
      birthMonth: snapshot.birthMonth ? parseInt(snapshot.birthMonth) : null,
      birthYear: snapshot.birthYear ? parseInt(snapshot.birthYear) : null,
      height: snapshot.height ? parseInt(snapshot.height) : null,
      weight: snapshot.weight ? parseInt(snapshot.weight) : null,
      city: snapshot.city || null,
    }).then(() => {
      setStatusForKey('profile', 'saved');
    }).catch(() => {
      setStatusForKey('profile', 'error');
    });
  }, [setStatusForKey]);

  const scheduleProfileSave = useCallback(() => {
    if (profileDebounceRef.current) clearTimeout(profileDebounceRef.current);
    profileDebounceRef.current = setTimeout(() => {
      doProfileSave();
    }, 400);
  }, [doProfileSave]);

  useEffect(() => {
    return () => {
      if (profileDebounceRef.current) clearTimeout(profileDebounceRef.current);
      Object.values(textTimerRefs.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const updateProfileField = useCallback((field: string, value: string) => {
    profileCurrentRef.current = { ...profileCurrentRef.current, [field]: value };
    switch (field) {
      case 'firstName': setProfileFirstName(value); break;
      case 'lastName': setProfileLastName(value); break;
      case 'gender': setProfileGender(value); break;
      case 'birthMonth': setProfileBirthMonth(value); break;
      case 'birthYear': setProfileBirthYear(value); break;
      case 'height': setProfileHeight(value); break;
      case 'weight': setProfileWeight(value); break;
      case 'city': setProfileCity(value); break;
    }
    scheduleProfileSave();
  }, [scheduleProfileSave]);

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case 'male': return t.genderMale;
      case 'female': return t.genderFemale;
      case 'other': return t.genderOther;
      default: return '';
    }
  };

  const retryProfileSave = useCallback(() => {
    setStatusForKey('profile', 'saving');
    const snapshot = { ...profileCurrentRef.current };
    apiRequest('PUT', '/api/user/profile', {
      firstName: snapshot.firstName || null,
      lastName: snapshot.lastName || null,
      gender: snapshot.gender || null,
      birthMonth: snapshot.birthMonth ? parseInt(snapshot.birthMonth) : null,
      birthYear: snapshot.birthYear ? parseInt(snapshot.birthYear) : null,
      height: snapshot.height ? parseInt(snapshot.height) : null,
      weight: snapshot.weight ? parseInt(snapshot.weight) : null,
      city: snapshot.city || null,
    }).then(() => {
      setStatusForKey('profile', 'saved');
    }).catch(() => {
      setStatusForKey('profile', 'error');
    });
  }, [setStatusForKey]);

  const hasSubsectionData = useCallback((key: string): boolean => {
    const val = (formData as any)[key];
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim().length > 0;
    if (typeof val === 'object') {
      if (val.tags && val.tags.length > 0) return true;
      if (val.problem || val.better || val.worse) return true;
      if (val.description && val.description.trim().length > 0) return true;
    }
    return false;
  }, [formData]);

  const renderSaveStatus = (key: string) => {
    const status = subSaveStatus[key];
    if (!status || status === 'idle') {
      if (hasSubsectionData(key)) {
        return (
          <span className="inline-flex items-center" data-testid={`save-status-${key}`}>
            <Check className="h-3.5 w-3.5 text-green-500" />
          </span>
        );
      }
      return null;
    }
    const showText = subTextVisible[key];
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${status === 'error' ? 'cursor-pointer' : ''}`}
        onClick={status === 'error' ? (e) => { e.stopPropagation(); key === 'profile' ? retryProfileSave() : retrySave(key); } : undefined}
        data-testid={`save-status-${key}`}
      >
        {status === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />}
        {status === 'saved' && <Check className="h-3.5 w-3.5 text-green-500" />}
        {status === 'error' && <X className="h-3.5 w-3.5 text-red-500" />}
        {showText && (
          <span className={
            status === 'saving' ? 'text-yellow-500' :
            status === 'saved' ? 'text-green-500' :
            'text-red-500'
          }>
            {status === 'saving' ? t.statusSaving : status === 'saved' ? t.statusSaved : t.statusNotSaved}
          </span>
        )}
      </span>
    );
  };

  if (isLoading || isLoadingPatient) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isExpanded = viewMode === 'view';

  const profileContentBlock = (
    <div className="space-y-4 pt-2">
      {isPatientView ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.lastName}</Label>
              <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-last-name">
                {patientData?.patient?.lastName || '—'}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.firstName}</Label>
              <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-first-name">
                {patientData?.patient?.firstName || '—'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.birthMonth}</Label>
              <div className="text-sm p-2 bg-muted rounded-md">
                {patientData?.patient?.birthMonth ? months.find(m => m.value === patientData.patient!.birthMonth)?.label : '—'}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.birthYear}</Label>
              <div className="text-sm p-2 bg-muted rounded-md">
                {patientData?.patient?.birthYear || '—'}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.gender}</Label>
            <div className="text-sm p-2 bg-muted rounded-md">
              {patientData?.patient?.gender ? getGenderLabel(patientData.patient.gender) : '—'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.height}</Label>
              <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-height">
                {patientData?.patient?.height || '—'}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.weight}</Label>
              <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-weight">
                {patientData?.patient?.weight || '—'}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.city}</Label>
            <div className="text-sm p-2 bg-muted rounded-md" data-testid="text-profile-city">
              {patientData?.patient?.city || '—'}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.lastName}</Label>
              <Input
                value={profileLastName}
                onChange={(e) => updateProfileField('lastName', e.target.value)}
                placeholder={t.lastName}
                data-testid="panel-input-last-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.firstName}</Label>
              <Input
                value={profileFirstName}
                onChange={(e) => updateProfileField('firstName', e.target.value)}
                placeholder={t.firstName}
                data-testid="panel-input-first-name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.birthMonth}</Label>
              <Select value={profileBirthMonth} onValueChange={(v) => updateProfileField('birthMonth', v)}>
                <SelectTrigger data-testid="panel-select-birth-month">
                  <SelectValue placeholder={t.selectMonth} />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.birthYear}</Label>
              <Input
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                value={profileBirthYear}
                onChange={(e) => updateProfileField('birthYear', e.target.value)}
                placeholder={t.birthYear}
                data-testid="panel-input-birth-year"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.gender}</Label>
            <Select value={profileGender} onValueChange={(v) => updateProfileField('gender', v)}>
              <SelectTrigger data-testid="panel-select-gender">
                <SelectValue placeholder={t.selectGender} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">{t.genderMale}</SelectItem>
                <SelectItem value="female">{t.genderFemale}</SelectItem>
                <SelectItem value="other">{t.genderOther}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.height}</Label>
              <Input
                type="number"
                min="50"
                max="300"
                value={profileHeight}
                onChange={(e) => updateProfileField('height', e.target.value)}
                placeholder={t.height}
                data-testid="panel-input-height"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.weight}</Label>
              <Input
                type="number"
                min="1"
                max="500"
                value={profileWeight}
                onChange={(e) => updateProfileField('weight', e.target.value)}
                placeholder={t.weight}
                data-testid="panel-input-weight"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.city}</Label>
            <Input
              value={profileCity}
              onChange={(e) => updateProfileField('city', e.target.value)}
              placeholder={t.city}
              data-testid="panel-input-city"
            />
          </div>
        </>
      )}
    </div>
  );

  const renderSubsectionContent = (sub: typeof t.questionnaireSections[number]['subsections'][number]) => (
    <div className="space-y-2 pt-2">
      <TagSelector
        tags={sub.tags}
        subsectionHint={sub.hint}
        selectedEntries={(formData as any)[sub.key] || []}
        onToggleTag={(tagKey) => toggleSectionTag(sub.key, tagKey)}
        onUpdateDescription={(tagKey, desc) => updateTagDescription(sub.key, tagKey, desc)}
        onBlur={() => triggerAutoSave(sub.key)}
        hideUnselected={isExpanded}
      />
    </div>
  );

  const homeopathNotesBlock = isPatientView ? (
    <div className="space-y-2 pt-2">
      <p className="text-sm text-muted-foreground">{t.homeopathNotesDescription}</p>
      <Textarea
        id="panel-homeopath-notes"
        data-testid="panel-input-homeopath-notes"
        value={formData.homeopathNotes || ''}
        onChange={(e) => updateHomeopathNotes(e.target.value)}
        onBlur={() => triggerAutoSave('homeopathNotes')}
        className="min-h-[200px]"
      />
    </div>
  ) : null;

  if (isExpanded) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode('edit')}
              data-testid="button-switch-edit-mode"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Редактирование
            </Button>
            <Button
              variant="default"
              size="sm"
              data-testid="button-switch-view-mode"
              disabled
            >
              <Eye className="h-4 w-4 mr-1" />
              Просмотр
            </Button>
          </div>

          <div className="mb-6 border-b pb-4">
            <h3 className="font-bold text-base mb-2">{t.sectionProfile} {renderSaveStatus('profile')}</h3>
            {profileContentBlock}
          </div>

          {t.questionnaireSections.map((section) => (
            <div key={section.key} className="mb-6 border-b pb-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-base">{section.title}</h3>
                {section.hint && (
                  <Popover>
                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-2rem)] max-w-80" side="top" align="start">
                      <p className="text-sm text-muted-foreground">{section.hint}</p>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {section.subsections.map((sub) => (
                <div key={sub.key} className="mb-4 pl-2">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm">{sub.title}</h4>
                    {renderSaveStatus(sub.key)}
                  </div>
                  {renderSubsectionContent(sub)}
                </div>
              ))}
            </div>
          ))}

          {isPatientView && (
            <div className="mb-6">
              <h3 className="font-bold text-base mb-2">{t.sectionHomeopathNotes}</h3>
              {homeopathNotesBlock}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="default"
            size="sm"
            data-testid="button-switch-edit-mode"
            disabled
          >
            <Pencil className="h-4 w-4 mr-1" />
            Редактирование
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('view')}
            data-testid="button-switch-view-mode"
          >
            <Eye className="h-4 w-4 mr-1" />
            Просмотр
          </Button>
        </div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="profile">
            <AccordionTrigger data-testid="panel-accordion-profile" className="data-[state=open]:font-bold">
              <div className="flex items-center gap-2">
                {t.sectionProfile}
                {renderSaveStatus('profile')}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {profileContentBlock}
            </AccordionContent>
          </AccordionItem>

          {t.questionnaireSections.map((section) => (
            <AccordionItem key={section.key} value={section.key}>
              <AccordionTrigger data-testid={`panel-accordion-${section.key}`} className="data-[state=open]:font-bold">
                <div className="flex items-center gap-2">
                  {section.title}
                  {section.hint && (
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
                      <PopoverContent className="w-[calc(100vw-2rem)] max-w-80" side="top" align="start">
                        <p className="text-sm text-muted-foreground">{section.hint}</p>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Accordion type="single" collapsible className="w-full">
                  {section.subsections.map((sub) => (
                    <AccordionItem key={sub.key} value={sub.key} className="border-0">
                      <AccordionTrigger data-testid={`panel-accordion-${sub.key}`} className="py-2 data-[state=open]:font-bold">
                        <div className="flex items-center gap-2 text-left">
                          {sub.title}
                          {renderSaveStatus(sub.key)}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {renderSubsectionContent(sub)}
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
                {homeopathNotesBlock}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
}
