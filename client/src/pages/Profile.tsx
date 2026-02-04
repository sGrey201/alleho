import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Camera, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
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

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.charAt(0) || '';
  const last = lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || 'U';
}

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
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
      setProfileImageUrl(user.profileImageUrl || null);
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
    mutationFn: async (data: { firstName: string; lastName: string; profileImageUrl: string | null }) => {
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
        profileImageUrl,
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    if (result) {
      const publicUrl = `https://objectstorage.replit.app/${result.objectPath}`;
      setProfileImageUrl(publicUrl);
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
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profileImageUrl || undefined} alt={`${firstName} ${lastName}`} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                  {getInitials(firstName, lastName)}
                </AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isUploading}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t.changeAvatar}</p>
          </div>

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
