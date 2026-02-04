import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { QuestionnaireData } from "@shared/schema";

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

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [birthMonth, setBirthMonth] = useState<number | undefined>();
  const [birthYear, setBirthYear] = useState<string>("");

  const { data: questionnaire, isLoading: questionnaireLoading } = useQuery<{ data: QuestionnaireData }>({
    queryKey: ['/api/questionnaire'],
    enabled: !!user,
  });

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
    }
  }, [user]);

  useEffect(() => {
    if (questionnaire?.data) {
      setGender(questionnaire.data.gender || "");
      setBirthMonth(questionnaire.data.birthMonth);
      setBirthYear(questionnaire.data.birthYear?.toString() || "");
    }
  }, [questionnaire]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      return apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
  });

  const updateQuestionnaireMutation = useMutation({
    mutationFn: async (data: Partial<QuestionnaireData>) => {
      return apiRequest('POST', '/api/questionnaire', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire'] });
    },
  });

  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        firstName,
        lastName,
      });

      await updateQuestionnaireMutation.mutateAsync({
        gender: gender as 'male' | 'female' | 'other' | undefined,
        birthMonth,
        birthYear: birthYear ? parseInt(birthYear) : undefined,
      });

      toast({
        title: t.profileSaved,
      });
    } catch (error) {
      toast({
        title: t.profileSaveError,
        variant: "destructive",
      });
    }
  };

  if (authLoading || questionnaireLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isSaving = updateProfileMutation.isPending || updateQuestionnaireMutation.isPending;

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t.firstName}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t.firstName}
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t.lastName}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t.lastName}
                data-testid="input-last-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t.gender}</Label>
            <Select value={gender} onValueChange={setGender}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.birthMonth}</Label>
              <Select 
                value={birthMonth?.toString() || ""} 
                onValueChange={(v) => setBirthMonth(v ? parseInt(v) : undefined)}
              >
                <SelectTrigger data-testid="select-birth-month">
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
              <Label htmlFor="birthYear">{t.birthYear}</Label>
              <Input
                id="birthYear"
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder={t.birthYear}
                data-testid="input-birth-year"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full"
            data-testid="button-save-profile"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.loading}
              </>
            ) : (
              t.save
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
