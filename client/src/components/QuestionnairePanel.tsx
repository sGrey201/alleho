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

const moodAndEnergyTags = [
  { key: 'joyfulness', label: t.moodTagJoyfulness },
  { key: 'melancholy', label: t.moodTagMelancholy },
  { key: 'serenity', label: t.moodTagSerenity },
  { key: 'anxiety', label: t.moodTagAnxiety },
  { key: 'apathy', label: t.moodTagApathy },
  { key: 'excitement', label: t.moodTagExcitement },
  { key: 'suppression', label: t.moodTagSuppression },
  { key: 'lightness', label: t.moodTagLightness },
  { key: 'despair', label: t.moodTagDespair },
  { key: 'optimism', label: t.moodTagOptimism },
  { key: 'cyclicMoods', label: t.moodTagCyclicMoods },
  { key: 'glassWall', label: t.moodTagGlassWall },
  { key: 'novelty', label: t.moodTagNovelty },
  { key: 'fearOfChange', label: t.moodTagFearOfChange },
  { key: 'suicidal', label: t.moodTagSuicidal },
  { key: 'depression', label: t.moodTagDepression },
];

const socialRelationsTags = [
  { key: 'extroversion', label: t.socialTagExtroversion },
  { key: 'introversion', label: t.socialTagIntroversion },
  { key: 'needSympathy', label: t.socialTagNeedSympathy },
  { key: 'solitude', label: t.socialTagSolitude },
  { key: 'dependentOnOpinion', label: t.socialTagDependentOnOpinion },
  { key: 'indifferentToOpinion', label: t.socialTagIndifferentToOpinion },
  { key: 'shyness', label: t.socialTagShyness },
  { key: 'boldness', label: t.socialTagBoldness },
  { key: 'suspicion', label: t.socialTagSuspicion },
  { key: 'trust', label: t.socialTagTrust },
  { key: 'jealousy', label: t.socialTagJealousy },
  { key: 'generosity', label: t.socialTagGenerosity },
  { key: 'resentment', label: t.socialTagResentment },
  { key: 'notResentful', label: t.socialTagNotResentful },
  { key: 'attentionSeeking', label: t.socialTagAttentionSeeking },
  { key: 'unnoticed', label: t.socialTagUnnoticed },
  { key: 'competitiveness', label: t.socialTagCompetitiveness },
  { key: 'noAmbition', label: t.socialTagNoAmbition },
  { key: 'dominance', label: t.socialTagDominance },
  { key: 'submission', label: t.socialTagSubmission },
  { key: 'criticism', label: t.socialTagCriticism },
  { key: 'admiration', label: t.socialTagAdmiration },
  { key: 'intolerance', label: t.socialTagIntolerance },
  { key: 'acceptance', label: t.socialTagAcceptance },
  { key: 'fearOfJudgment', label: t.socialTagFearOfJudgment },
  { key: 'persecution', label: t.socialTagPersecution },
  { key: 'outcast', label: t.socialTagOutcast },
  { key: 'justice', label: t.socialTagJustice },
  { key: 'religiosity', label: t.socialTagReligiosity },
  { key: 'atheism', label: t.socialTagAtheism },
  { key: 'falling', label: t.socialTagFalling },
  { key: 'abstinence', label: t.socialTagAbstinence },
  { key: 'nostalgia', label: t.socialTagNostalgia },
  { key: 'riskTaking', label: t.socialTagRiskTaking },
  { key: 'fearfulness', label: t.socialTagFearfulness },
  { key: 'revenge', label: t.socialTagRevenge },
  { key: 'friendliness', label: t.socialTagFriendliness },
  { key: 'addictions', label: t.socialTagAddictions },
];

const willControlTags = [
  { key: 'strongWill', label: t.willTagStrongWill },
  { key: 'weakWill', label: t.willTagWeakWill },
  { key: 'stubbornness', label: t.willTagStubbornness },
  { key: 'compliance', label: t.willTagCompliance },
  { key: 'impulsiveness', label: t.willTagImpulsiveness },
  { key: 'caution', label: t.willTagCaution },
  { key: 'hastiness', label: t.willTagHastiness },
  { key: 'slowness', label: t.willTagSlowness },
  { key: 'workaholism', label: t.willTagWorkaholism },
  { key: 'laziness', label: t.willTagLaziness },
  { key: 'pedantry', label: t.willTagPedantry },
  { key: 'disorder', label: t.willTagDisorder },
  { key: 'obsession', label: t.willTagObsession },
  { key: 'superficiality', label: t.willTagSuperficiality },
  { key: 'selfControl', label: t.willTagSelfControl },
  { key: 'lackOfRestraint', label: t.willTagLackOfRestraint },
  { key: 'perfectionism', label: t.willTagPerfectionism },
  { key: 'negligence', label: t.willTagNegligence },
  { key: 'controlDesire', label: t.willTagControlDesire },
  { key: 'noInitiative', label: t.willTagNoInitiative },
];

const intellectImaginationTags = [
  { key: 'clarityOfThinking', label: t.intellectTagClarityOfThinking },
  { key: 'confusion', label: t.intellectTagConfusion },
  { key: 'focusOnDetails', label: t.intellectTagFocusOnDetails },
  { key: 'absentMindedness', label: t.intellectTagAbsentMindedness },
  { key: 'quickMind', label: t.intellectTagQuickMind },
  { key: 'slowThinking', label: t.intellectTagSlowThinking },
  { key: 'creativeInspiration', label: t.intellectTagCreativeInspiration },
  { key: 'mentalStupor', label: t.intellectTagMentalStupor },
  { key: 'vividImagination', label: t.intellectTagVividImagination },
  { key: 'pragmatism', label: t.intellectTagPragmatism },
  { key: 'fixationOnPast', label: t.intellectTagFixationOnPast },
  { key: 'fixationOnFuture', label: t.intellectTagFixationOnFuture },
  { key: 'obsessiveThoughts', label: t.intellectTagObsessiveThoughts },
  { key: 'brainOverload', label: t.intellectTagBrainOverload },
  { key: 'wordFindingDifficulty', label: t.intellectTagWordFindingDifficulty },
];

const fearsTags = [
  { key: 'fearOfDeath', label: t.fearTagFearOfDeath },
  { key: 'disregardForDeath', label: t.fearTagDisregardForDeath },
  { key: 'fearOfLoneliness', label: t.fearTagFearOfLoneliness },
  { key: 'fearOfCrowds', label: t.fearTagFearOfCrowds },
  { key: 'fearOfDarkness', label: t.fearTagFearOfDarkness },
  { key: 'fearOfBrightLight', label: t.fearTagFearOfBrightLight },
  { key: 'fearOfFuture', label: t.fearTagFearOfFuture },
  { key: 'fearOfPastRepeat', label: t.fearTagFearOfPastRepeat },
  { key: 'fearOfFailure', label: t.fearTagFearOfFailure },
  { key: 'fearOfSuccess', label: t.fearTagFearOfSuccess },
  { key: 'fearOfInsanity', label: t.fearTagFearOfInsanity },
  { key: 'claustrophobia', label: t.fearTagClaustrophobia },
  { key: 'fearOfHeights', label: t.fearTagFearOfHeights },
  { key: 'fearOfAnimals', label: t.fearTagFearOfAnimals },
  { key: 'hypochondria', label: t.fearTagHypochondria },
  { key: 'panicAttacks', label: t.fearTagPanicAttacks },
];

const emotionalReactionsTags = [
  { key: 'irritability', label: t.emotionTagIrritability },
  { key: 'phlegmatic', label: t.emotionTagPhlegmatic },
  { key: 'rage', label: t.emotionTagRage },
  { key: 'annoyance', label: t.emotionTagAnnoyance },
  { key: 'irritabilityFromTrifles', label: t.emotionTagIrritabilityFromTrifles },
  { key: 'patience', label: t.emotionTagPatience },
  { key: 'tearfulness', label: t.emotionTagTearfulness },
  { key: 'inabilityToCry', label: t.emotionTagInabilityToCry },
  { key: 'sentimentality', label: t.emotionTagSentimentality },
  { key: 'coldness', label: t.emotionTagColdness },
  { key: 'jealousy', label: t.emotionTagJealousy },
  { key: 'indifference', label: t.emotionTagIndifference },
  { key: 'envy', label: t.emotionTagEnvy },
  { key: 'compassion', label: t.emotionTagCompassion },
  { key: 'selfPity', label: t.emotionTagSelfPity },
  { key: 'selfSeverity', label: t.emotionTagSelfSeverity },
  { key: 'guilt', label: t.emotionTagGuilt },
  { key: 'blamingOthers', label: t.emotionTagBlamingOthers },
  { key: 'shyness', label: t.emotionTagShyness },
  { key: 'shamelessness', label: t.emotionTagShamelessness },
  { key: 'pride', label: t.emotionTagPride },
  { key: 'worthlessness', label: t.emotionTagWorthlessness },
  { key: 'impatience', label: t.emotionTagImpatience },
  { key: 'longSuffering', label: t.emotionTagLongSuffering },
  { key: 'hysteria', label: t.emotionTagHysteria },
  { key: 'innerTrembling', label: t.emotionTagInnerTrembling },
  { key: 'frenzy', label: t.emotionTagFrenzy },
  { key: 'loveOfAnimals', label: t.emotionTagLoveOfAnimals },
];

const specialMentalStatesTags = [
  { key: 'splitPersonality', label: t.specialTagSplitPersonality },
  { key: 'unrealityFeeling', label: t.specialTagUnrealityFeeling },
  { key: 'depersonalization', label: t.specialTagDepersonalization },
  { key: 'suddenInsights', label: t.specialTagSuddenInsights },
  { key: 'sensOfMission', label: t.specialTagSensOfMission },
  { key: 'persecutionMania', label: t.specialTagPersecutionMania },
  { key: 'delusionalIdeas', label: t.specialTagDelusionalIdeas },
  { key: 'hallucinations', label: t.specialTagHallucinations },
  { key: 'obsessiveRituals', label: t.specialTagObsessiveRituals },
  { key: 'timeLoss', label: t.specialTagTimeLoss },
  { key: 'obsessiveWashing', label: t.specialTagObsessiveWashing },
];

const desiresAversionsTags = [
  { key: 'desireForComfort', label: t.desireTagDesireForComfort },
  { key: 'desireToBeAlone', label: t.desireTagDesireToBeAlone },
  { key: 'desireToTravel', label: t.desireTagDesireToTravel },
  { key: 'desireForHome', label: t.desireTagDesireForHome },
  { key: 'desireForAlcohol', label: t.desireTagDesireForAlcohol },
  { key: 'aversionToAlcohol', label: t.desireTagAversionToAlcohol },
  { key: 'desireForMusic', label: t.desireTagDesireForMusic },
  { key: 'aversionToMusic', label: t.desireTagAversionToMusic },
  { key: 'desireForBusiness', label: t.desireTagDesireForBusiness },
  { key: 'desireForRoutine', label: t.desireTagDesireForRoutine },
  { key: 'desireToDramatize', label: t.desireTagDesireToDramatize },
  { key: 'desireToHideFeelings', label: t.desireTagDesireToHideFeelings },
  { key: 'deathWish', label: t.desireTagDeathWish },
  { key: 'thirstForLife', label: t.desireTagThirstForLife },
  { key: 'aversionToStimuli', label: t.desireTagAversionToStimuli },
  { key: 'talkativeness', label: t.desireTagTalkativeness },
  { key: 'silence', label: t.desireTagSilence },
];

const reactionToSufferingTags = [
  { key: 'stoicism', label: t.sufferingTagStoicism },
  { key: 'painIntolerance', label: t.sufferingTagPainIntolerance },
  { key: 'exaggeration', label: t.sufferingTagExaggeration },
  { key: 'minimization', label: t.sufferingTagMinimization },
  { key: 'fearOfDyingFromIllness', label: t.sufferingTagFearOfDyingFromIllness },
  { key: 'beliefIncurable', label: t.sufferingTagBeliefIncurable },
  { key: 'irritabilityFromPain', label: t.sufferingTagIrritabilityFromPain },
  { key: 'apathyInPain', label: t.sufferingTagApathyInPain },
  { key: 'demandAttention', label: t.sufferingTagDemandAttention },
  { key: 'desireSolitudeInIllness', label: t.sufferingTagDesireSolitudeInIllness },
  { key: 'worseFromSympathy', label: t.sufferingTagWorseFromSympathy },
  { key: 'betterFromSympathy', label: t.sufferingTagBetterFromSympathy },
  { key: 'fearOfDoctors', label: t.sufferingTagFearOfDoctors },
];

interface TagSelectorProps {
  tags: { key: string; label: string }[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  hint: string;
  onBlur?: () => void;
}

function TagSelector({ tags, selectedTags, onTagsChange, hint, onBlur }: TagSelectorProps) {
  const toggleTag = (tagKey: string) => {
    const newTags = selectedTags.includes(tagKey)
      ? selectedTags.filter(t => t !== tagKey)
      : [...selectedTags, tagKey];
    onTagsChange(newTags);
  };

  return (
    <div 
      className="border rounded-md p-3 space-y-2"
      onBlur={onBlur}
    >
      <span className="text-sm text-muted-foreground">
        {t.selectedCount}: {selectedTags.length}
      </span>
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

  const updateMoodTags = (tags: string[]) => {
    setFormData(prev => ({
      ...prev,
      moodAndEnergy: {
        ...prev.moodAndEnergy,
        tags,
      },
    }));
  };

  const updateMoodDescription = (description: string) => {
    setFormData(prev => ({
      ...prev,
      moodAndEnergy: {
        ...prev.moodAndEnergy,
        description,
      },
    }));
  };

  const updateSocialTags = (tags: string[]) => {
    setFormData(prev => ({
      ...prev,
      socialRelations: {
        ...prev.socialRelations,
        tags,
      },
    }));
  };

  const updateSocialDescription = (description: string) => {
    setFormData(prev => ({
      ...prev,
      socialRelations: {
        ...prev.socialRelations,
        description,
      },
    }));
  };

  const updateWillControlTags = (tags: string[]) => {
    setFormData(prev => ({
      ...prev,
      willControl: {
        ...prev.willControl,
        tags,
      },
    }));
  };

  const updateWillControlDescription = (description: string) => {
    setFormData(prev => ({
      ...prev,
      willControl: {
        ...prev.willControl,
        description,
      },
    }));
  };

  const updateIntellectImaginationTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, intellectImagination: { ...prev.intellectImagination, tags } }));
  };
  const updateIntellectImaginationDescription = (description: string) => {
    setFormData(prev => ({ ...prev, intellectImagination: { ...prev.intellectImagination, description } }));
  };

  const updateFearsTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, fears: { ...prev.fears, tags } }));
  };
  const updateFearsDescription = (description: string) => {
    setFormData(prev => ({ ...prev, fears: { ...prev.fears, description } }));
  };

  const updateEmotionalReactionsTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, emotionalReactions: { ...prev.emotionalReactions, tags } }));
  };
  const updateEmotionalReactionsDescription = (description: string) => {
    setFormData(prev => ({ ...prev, emotionalReactions: { ...prev.emotionalReactions, description } }));
  };

  const updateSpecialMentalStatesTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, specialMentalStates: { ...prev.specialMentalStates, tags } }));
  };
  const updateSpecialMentalStatesDescription = (description: string) => {
    setFormData(prev => ({ ...prev, specialMentalStates: { ...prev.specialMentalStates, description } }));
  };

  const updateDesiresAversionsTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, desiresAversions: { ...prev.desiresAversions, tags } }));
  };
  const updateDesiresAversionsDescription = (description: string) => {
    setFormData(prev => ({ ...prev, desiresAversions: { ...prev.desiresAversions, description } }));
  };

  const updateReactionToSufferingTags = (tags: string[]) => {
    setFormData(prev => ({ ...prev, reactionToSuffering: { ...prev.reactionToSuffering, tags } }));
  };
  const updateReactionToSufferingDescription = (description: string) => {
    setFormData(prev => ({ ...prev, reactionToSuffering: { ...prev.reactionToSuffering, description } }));
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

          <AccordionItem value="psycheMental">
            <AccordionTrigger data-testid="panel-accordion-psyche-mental" className="data-[state=open]:font-bold">
              <div className="flex items-center gap-2">
                {t.sectionPsycheMental}
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
                    <p className="text-sm text-muted-foreground">{t.hintsPsycheMental}</p>
                  </PopoverContent>
                </Popover>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="moodEnergy" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-mood-energy" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionMoodEnergy}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={moodAndEnergyTags}
                        selectedTags={formData.moodAndEnergy?.tags || []}
                        onTagsChange={updateMoodTags}
                        hint={t.hintsMoodEnergy}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-mood-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.moodAndEnergy?.description || ''}
                        onChange={(e) => updateMoodDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="socialRelations" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-social-relations" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionSocialRelations}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={socialRelationsTags}
                        selectedTags={formData.socialRelations?.tags || []}
                        onTagsChange={updateSocialTags}
                        hint={t.hintsSocialRelations}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-social-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.socialRelations?.description || ''}
                        onChange={(e) => updateSocialDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="willControl" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-will-control" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionWillControl}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={willControlTags}
                        selectedTags={formData.willControl?.tags || []}
                        onTagsChange={updateWillControlTags}
                        hint={t.hintsWillControl}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-will-control-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.willControl?.description || ''}
                        onChange={(e) => updateWillControlDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="intellectImagination" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-intellect-imagination" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionIntellectImagination}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={intellectImaginationTags}
                        selectedTags={formData.intellectImagination?.tags || []}
                        onTagsChange={updateIntellectImaginationTags}
                        hint={t.hintsIntellectImagination}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-intellect-imagination-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.intellectImagination?.description || ''}
                        onChange={(e) => updateIntellectImaginationDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="fears" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-fears" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionFears}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={fearsTags}
                        selectedTags={formData.fears?.tags || []}
                        onTagsChange={updateFearsTags}
                        hint={t.hintsFears}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-fears-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.fears?.description || ''}
                        onChange={(e) => updateFearsDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="emotionalReactions" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-emotional-reactions" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionEmotionalReactions}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={emotionalReactionsTags}
                        selectedTags={formData.emotionalReactions?.tags || []}
                        onTagsChange={updateEmotionalReactionsTags}
                        hint={t.hintsEmotionalReactions}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-emotional-reactions-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.emotionalReactions?.description || ''}
                        onChange={(e) => updateEmotionalReactionsDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="specialMentalStates" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-special-mental-states" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionSpecialMentalStates}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={specialMentalStatesTags}
                        selectedTags={formData.specialMentalStates?.tags || []}
                        onTagsChange={updateSpecialMentalStatesTags}
                        hint={t.hintsSpecialMentalStates}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-special-mental-states-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.specialMentalStates?.description || ''}
                        onChange={(e) => updateSpecialMentalStatesDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="desiresAversions" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-desires-aversions" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionDesiresAversions}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={desiresAversionsTags}
                        selectedTags={formData.desiresAversions?.tags || []}
                        onTagsChange={updateDesiresAversionsTags}
                        hint={t.hintsDesiresAversions}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-desires-aversions-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.desiresAversions?.description || ''}
                        onChange={(e) => updateDesiresAversionsDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="reactionToSuffering" className="border-0">
                  <AccordionTrigger data-testid="panel-accordion-reaction-to-suffering" className="py-2 data-[state=open]:font-bold">
                    {t.subsectionReactionToSuffering}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <TagSelector
                        tags={reactionToSufferingTags}
                        selectedTags={formData.reactionToSuffering?.tags || []}
                        onTagsChange={updateReactionToSufferingTags}
                        hint={t.hintsReactionToSuffering}
                        onBlur={triggerAutoSave}
                      />
                      <Textarea
                        data-testid="panel-input-reaction-to-suffering-description"
                        placeholder={t.describeSelectedTraits}
                        value={formData.reactionToSuffering?.description || ''}
                        onChange={(e) => updateReactionToSufferingDescription(e.target.value)}
                        onBlur={triggerAutoSave}
                        className="min-h-[200px]"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </AccordionContent>
          </AccordionItem>

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
