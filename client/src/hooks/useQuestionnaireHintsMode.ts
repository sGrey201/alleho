import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_QUESTIONNAIRE_HINTS_MODE,
  type QuestionnaireHintsMode,
} from "@shared/questionnaireTypes";

export function useQuestionnaireHintsMode(): QuestionnaireHintsMode {
  const { user } = useAuth();
  return user?.questionnaireHintsMode === "always" || user?.questionnaireHintsMode === "icon"
    ? user.questionnaireHintsMode
    : DEFAULT_QUESTIONNAIRE_HINTS_MODE;
}
