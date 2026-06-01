import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, LogOut, Camera, ArrowLeft, ClipboardList, Eye } from "lucide-react";
import { format } from "date-fns";
import DynamicQuestionnaireForm from "@/components/DynamicQuestionnaireForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import type { QuestionnaireHintsMode } from "@shared/questionnaireTypes";
import { DEFAULT_QUESTIONNAIRE_HINTS_MODE } from "@shared/questionnaireTypes";
import { RouteSeo } from "@/components/RouteSeo";
import { pageMeta } from "@/lib/pageMeta";

export type ProfileProps = {
  onSaveSuccess?: () => void;
};

type AcceptedInviteCounts = { homeopath: number; patient: number };

type InviteProfileSummary = {
  inviter: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  acceptedInvites: AcceptedInviteCounts;
};

const EMPTY_ACCEPTED_INVITES: AcceptedInviteCounts = { homeopath: 0, patient: 0 };

function InviteCountCard({
  label,
  count,
  testId,
}: {
  label: string;
  count: number;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-base text-foreground" data-testid={testId}>
        {count}
      </p>
    </div>
  );
}

function AcceptedInvitesStats({ counts }: { counts: AcceptedInviteCounts }) {
  return (
    <>
      <InviteCountCard
        label="Приглашённые гомеопаты"
        count={counts.homeopath}
        testId="invite-count-homeopath"
      />
      <InviteCountCard
        label="Приглашённые пациенты"
        count={counts.patient}
        testId="invite-count-patient"
      />
    </>
  );
}

const COUNTRIES_RU = [
  "Австралия",
  "Австрия",
  "Азербайджан",
  "Албания",
  "Алжир",
  "Ангола",
  "Андорра",
  "Антигуа и Барбуда",
  "Аргентина",
  "Армения",
  "Афганистан",
  "Багамы",
  "Бангладеш",
  "Барбадос",
  "Бахрейн",
  "Беларусь",
  "Белиз",
  "Бельгия",
  "Бенин",
  "Болгария",
  "Боливия",
  "Босния и Герцеговина",
  "Ботсвана",
  "Бразилия",
  "Бруней",
  "Буркина-Фасо",
  "Бурунди",
  'Бутан',
  "Вануату",
  "Ватикан",
  "Великобритания",
  "Венгрия",
  "Венесуэла",
  "Восточный Тимор",
  "Вьетнам",
  "Габон",
  "Гаити",
  "Гайана",
  "Гамбия",
  "Гана",
  "Гватемала",
  "Гвинея",
  "Гвинея-Бисау",
  "Германия",
  "Гондурас",
  "Гренада",
  "Греция",
  "Грузия",
  "Дания",
  "Джибути",
  "Доминика",
  "Доминиканская Республика",
  "Египет",
  "Замбия",
  "Зимбабве",
  "Израиль",
  "Индия",
  "Индонезия",
  "Иордания",
  "Ирак",
  "Иран",
  "Ирландия",
  "Исландия",
  "Испания",
  "Италия",
  "Йемен",
  "Кабо-Верде",
  "Казахстан",
  "Камбоджа",
  "Камерун",
  "Канада",
  "Катар",
  "Кения",
  "Кипр",
  "Киргизия",
  "Кирибати",
  "Китай",
  "Колумбия",
  "Коморы",
  "Конго",
  "Коста-Рика",
  "Кот-д'Ивуар",
  "Куба",
  "Кувейт",
  "Лаос",
  "Латвия",
  "Лесото",
  "Либерия",
  "Ливан",
  "Ливия",
  "Литва",
  "Лихтенштейн",
  "Люксембург",
  "Маврикий",
  "Мавритания",
  "Мадагаскар",
  "Малави",
  "Малайзия",
  "Мали",
  "Мальдивы",
  "Мальта",
  "Марокко",
  "Маршалловы Острова",
  "Мексика",
  "Мозамбик",
  "Молдова",
  "Монако",
  "Монголия",
  "Мьянма",
  "Намибия",
  "Науру",
  "Непал",
  "Нигер",
  "Нигерия",
  "Нидерланды",
  "Никарагуа",
  "Новая Зеландия",
  "Норвегия",
  "ОАЭ",
  "Оман",
  "Пакистан",
  "Палау",
  "Панама",
  "Папуа — Новая Гвинея",
  "Парагвай",
  "Перу",
  "Польша",
  "Португалия",
  "Россия",
  "Руанда",
  "Румыния",
  "Сальвадор",
  "Самоа",
  "Сан-Марино",
  "Сан-Томе и Принсипи",
  "Саудовская Аравия",
  "Северная Македония",
  "Сейшелы",
  "Сенегал",
  "Сент-Винсент и Гренадины",
  "Сент-Китс и Невис",
  "Сент-Люсия",
  "Сербия",
  "Сингапур",
  "Сирия",
  "Словакия",
  "Словения",
  "Соломоновы Острова",
  "Сомали",
  "Судан",
  "Суринам",
  "США",
  "Сьерра-Леоне",
  "Таджикистан",
  "Таиланд",
  "Танзания",
  "Того",
  "Тонга",
  "Тринидад и Тобаго",
  "Тувалу",
  "Тунис",
  "Туркменистан",
  "Турция",
  "Уганда",
  "Узбекистан",
  "Украина",
  "Уругвай",
  "Фиджи",
  "Филиппины",
  "Финляндия",
  "Франция",
  "Хорватия",
  "ЦАР",
  "Чад",
  "Черногория",
  "Чехия",
  "Чили",
  "Швейцария",
  "Швеция",
  "Шри-Ланка",
  "Эквадор",
  "Экваториальная Гвинея",
  "Эритрея",
  "Эсватини",
  "Эстония",
  "Эфиопия",
  "ЮАР",
  "Южный Судан",
  "Ямайка",
  "Япония",
];

export default function Profile({ onSaveSuccess }: ProfileProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [, profileParams] = useRoute("/profile/:userId");
  const targetUserId = profileParams?.userId;
  const isOwnProfile = !targetUserId || targetUserId === user?.id;
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string>("");
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [questionnaireHintsMode, setQuestionnaireHintsMode] = useState<QuestionnaireHintsMode>(
    DEFAULT_QUESTIONNAIRE_HINTS_MODE
  );
  const hasPassword = (user as { hasPassword?: boolean } | undefined)?.hasPassword !== false;
  const { data: ownInviteSummary } = useQuery<InviteProfileSummary>({
    queryKey: ["/api/invites/profile-summary"],
    queryFn: async () => {
      const res = await fetch("/api/invites/profile-summary", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isOwnProfile,
    retry: false,
  });
  const { data: viewedProfile, isLoading: viewedProfileLoading, error: viewedProfileError } = useQuery<{
    user: {
      id: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      profileImageUrl?: string | null;
      country?: string | null;
      city?: string | null;
      isAdmin: boolean;
    };
  } & InviteProfileSummary>({
    queryKey: ["/api/users/profile", targetUserId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${targetUserId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!targetUserId && !isOwnProfile,
    retry: false,
  });
  const profileUser = isOwnProfile ? user : viewedProfile?.user;
  const profileUserId = profileUser?.id ?? targetUserId;
  const showSharedQuestionnaires = !!profileUser?.isAdmin && !!profileUserId;

  const { data: sharedQuestionnaireTemplates = [] } = useQuery<
    Array<{
      id: string;
      name: string;
      copyCount: number;
      patientSendCount: number;
      updatedAt: string | null;
    }>
  >({
    queryKey: ["/api/users", profileUserId, "questionnaire-templates"],
    enabled: showSharedQuestionnaires,
    queryFn: async () => {
      const res = await fetch(`/api/users/${profileUserId}/questionnaire-templates`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewTemplateMeta, setPreviewTemplateMeta] = useState<{ name: string } | null>(null);

  const { data: previewTemplate } = useQuery({
    queryKey: ["/api/questionnaire-templates", previewTemplateId],
    enabled: !!previewTemplateId,
    queryFn: async () => {
      const res = await fetch(`/api/questionnaire-templates/${previewTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const copyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/questionnaire-templates/${templateId}/copy`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.questionnaireSaved });
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
    },
  });
  const inviteSummary: InviteProfileSummary | undefined = isOwnProfile
    ? ownInviteSummary
    : viewedProfile
      ? {
          inviter: viewedProfile.inviter ?? null,
          acceptedInvites: viewedProfile.acceptedInvites ?? EMPTY_ACCEPTED_INVITES,
        }
      : undefined;
  const acceptedInvites = inviteSummary?.acceptedInvites ?? EMPTY_ACCEPTED_INVITES;

  useEffect(() => {
    if (profileUser) {
      setFirstName(profileUser.firstName || "");
      setLastName(profileUser.lastName || "");
      setCountry(profileUser.country || "");
      setCity(profileUser.city || "");
      setProfileImageUrl(profileUser.profileImageUrl || "");
      setQuestionnaireHintsMode(
        (profileUser as { questionnaireHintsMode?: QuestionnaireHintsMode }).questionnaireHintsMode ??
          DEFAULT_QUESTIONNAIRE_HINTS_MODE
      );
    }
  }, [profileUser]);

  const { uploadFile, isUploading } = useUpload({
    onError: (error) => {
      toast({
        title: error.message || "Не удалось загрузить аватар",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (payload: {
      currentPassword: string;
      password: string;
      confirmPassword: string;
    }) => {
      const res = await apiRequest("POST", "/api/auth/change-password", payload);
      return res.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowChangePasswordForm(false);
      toast({ title: t.passwordChanged });
    },
    onError: (error: Error) => {
      toast({
        title: error.message || t.passwordChangeError,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      firstName: string;
      lastName: string;
      gender: string | null;
      birthMonth: number | null;
      birthYear: number | null;
      height: number | null;
      weight: number | null;
      country: string | null;
      city: string | null;
      profileImageUrl: string | null;
      questionnaireHintsMode?: QuestionnaireHintsMode;
    }) => {
      return apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: "active" });
    },
  });

  const handleSave = async () => {
    if (!isOwnProfile) return;
    try {
      await updateProfileMutation.mutateAsync({
        firstName,
        lastName,
        gender: user?.gender || null,
        birthMonth: user?.birthMonth ?? null,
        birthYear: user?.birthYear ?? null,
        height: user?.height ?? null,
        weight: user?.weight ?? null,
        country: country || null,
        city: city || null,
        profileImageUrl: profileImageUrl || null,
        questionnaireHintsMode,
      });

      toast({
        title: t.profileSaved,
      });
      onSaveSuccess?.();
    } catch (error) {
      toast({
        title: t.profileSaveError,
        variant: "destructive",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast({ title: t.passwordChangeError, description: "Заполните все поля", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t.passwordMinLength, variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: t.passwordsDoNotMatch, variant: "destructive" });
      return;
    }
    await changePasswordMutation.mutateAsync({
      currentPassword,
      password: newPassword,
      confirmPassword: confirmNewPassword,
    });
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.clear();
    window.location.href = "/";
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadResponse = await uploadFile(file);
    if (uploadResponse?.objectPath) {
      const newAvatarPath = uploadResponse.objectPath;
      setProfileImageUrl(newAvatarPath);
      try {
        await updateProfileMutation.mutateAsync({
          firstName,
          lastName,
          gender: user?.gender || null,
          birthMonth: user?.birthMonth ?? null,
          birthYear: user?.birthYear ?? null,
          height: user?.height ?? null,
          weight: user?.weight ?? null,
          country: country || null,
          city: city || null,
          profileImageUrl: newAvatarPath,
          questionnaireHintsMode,
        });
        toast({ title: "Аватар сохранен" });
      } catch {
        toast({
          title: "Не удалось сохранить аватар",
          variant: "destructive",
        });
      }
    }
    e.target.value = "";
  };

  if (authLoading || (!isOwnProfile && viewedProfileLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profileUser) {
    const errorText = viewedProfileError instanceof Error ? viewedProfileError.message : "";
    const isUnauthorized = errorText.includes("401") || errorText.toLowerCase().includes("unauthorized");
    return (
      <div className="container max-w-2xl mx-auto py-8 px-4 text-center text-muted-foreground">
        {isUnauthorized
          ? "Сессия истекла. Войдите снова, чтобы открыть профиль."
          : "Профиль пользователя не найден или недоступен."}
      </div>
    );
  }

  const isSaving = updateProfileMutation.isPending;
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.trim() || "U";
  const displayName = [lastName, firstName].filter(Boolean).join(" ").trim() || profileUser.email || "Профиль";
  const locationLabel =
    country && city ? `${country}, ${city}` : country || city || "Не указано";
  const inviterName =
    [inviteSummary?.inviter?.firstName, inviteSummary?.inviter?.lastName].filter(Boolean).join(" ") ||
    inviteSummary?.inviter?.email ||
    "Нет данных";

  const openInviterChat = async () => {
    const inviterId = inviteSummary?.inviter?.id;
    if (!inviterId) return;
    try {
      const res = await fetch(`/api/messenger/direct/${inviterId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { conversationId?: string };
      if (!data.conversationId) throw new Error("Нет id чата");
      setLocation(`/messenger/direct/${data.conversationId}`);
    } catch {
      toast({ title: t.error, description: "Не удалось открыть чат", variant: "destructive" });
    }
  };

  if (!isOwnProfile) {
    return (
      <>
        <RouteSeo {...pageMeta.profile} />
      <div className="min-h-screen bg-background">
        <div className="relative h-[50vh] min-h-[280px] max-h-[520px] w-full bg-muted">
          {profileImageUrl ? (
            <img src={profileImageUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-6xl font-semibold text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="absolute inset-x-0 top-0 p-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full bg-black/35 text-white hover:bg-black/50"
              onClick={() => window.history.back()}
              aria-label="Назад"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <h1 className="text-white text-2xl font-semibold leading-tight">{displayName}</h1>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Страна, город</p>
            <p className="text-base text-foreground">{locationLabel}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Приглашен</p>
            <p className="text-base text-foreground">
              {inviteSummary?.inviter ? (
                inviteSummary.inviter.id ? (
                  <button
                    type="button"
                    onClick={() => void openInviterChat()}
                    className="text-primary hover:underline"
                  >
                    {inviterName}
                  </button>
                ) : (
                  inviterName
                )
              ) : (
                "Нет данных"
              )}
            </p>
          </div>
          <AcceptedInvitesStats counts={acceptedInvites} />
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <RouteSeo {...pageMeta.profile} />
    <div className="container max-w-2xl mx-auto py-4 px-4 pb-8">
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 rounded-full"
            onClick={() => window.history.back()}
            aria-label="Назад"
            data-testid="button-profile-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            className="rounded-full"
            onClick={() => profileImageUrl && setAvatarPreviewOpen(true)}
            disabled={!profileImageUrl}
            aria-label="Открыть аватар"
          >
            <Avatar className="h-20 w-20">
              {profileImageUrl ? <AvatarImage src={`${profileImageUrl}?size=thumb`} alt="avatar" /> : null}
              <AvatarFallback>{initials.toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            {isOwnProfile && (
              <button
                type="button"
                className="text-sm text-primary hover:underline inline-flex items-center"
                onClick={() => document.getElementById("avatar-upload")?.click()}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                {isUploading ? t.loading : "Изменить фото"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">{t.firstName}</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t.firstName}
              disabled={!isOwnProfile}
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
              disabled={!isOwnProfile}
              data-testid="input-last-name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={profileUser.email ?? ""}
            readOnly
            disabled
            data-testid="input-email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Откуда вы</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={!isOwnProfile}
            className="w-full min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Выберите страну</option>
            {COUNTRIES_RU.map((countryName) => (
              <option key={countryName} value={countryName}>
                {countryName}
              </option>
            ))}
          </select>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            disabled={!isOwnProfile}
            data-testid="input-city"
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <Label className="text-base font-medium">{t.questionnaireHintsSetting}</Label>
          <RadioGroup
            value={questionnaireHintsMode}
            onValueChange={(value) => setQuestionnaireHintsMode(value as QuestionnaireHintsMode)}
            disabled={!isOwnProfile}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="always" id="questionnaire-hints-always" />
              <Label htmlFor="questionnaire-hints-always" className="cursor-pointer font-normal">
                {t.questionnaireHintsAlways}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="icon" id="questionnaire-hints-icon" />
              <Label htmlFor="questionnaire-hints-icon" className="cursor-pointer font-normal">
                {t.questionnaireHintsIcon}
              </Label>
            </div>
          </RadioGroup>
        </div>

        {hasPassword && (
          <div>
            {!showChangePasswordForm ? (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setShowChangePasswordForm(true)}
                data-testid="link-show-change-password"
              >
                {t.changePassword}
              </button>
            ) : (
              <div className="space-y-4 rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{t.changePassword}</p>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline shrink-0"
                    onClick={() => {
                      setShowChangePasswordForm(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmNewPassword("");
                    }}
                    data-testid="link-hide-change-password"
                  >
                    {t.hideChangePassword}
                  </button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t.currentPassword}</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    data-testid="input-current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t.newPassword}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">{t.confirmNewPassword}</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    data-testid="input-confirm-new-password"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleChangePassword()}
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t.loading}
                    </>
                  ) : (
                    t.changePassword
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">
            Приглашен:{" "}
            <span className="font-normal text-muted-foreground">
              {inviteSummary?.inviter ? (
                inviteSummary.inviter.id ? (
                  <Link
                    href={`/profile/${inviteSummary.inviter.id}`}
                    className="text-primary hover:underline"
                  >
                    {[inviteSummary.inviter.firstName, inviteSummary.inviter.lastName].filter(Boolean).join(" ") ||
                      inviteSummary.inviter.email ||
                      "Неизвестно"}
                  </Link>
                ) : (
                  [inviteSummary.inviter.firstName, inviteSummary.inviter.lastName].filter(Boolean).join(" ") ||
                  inviteSummary.inviter.email ||
                  "Неизвестно"
                )
              ) : (
                "Нет данных"
              )}
            </span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AcceptedInvitesStats counts={acceptedInvites} />
        </div>

        {showSharedQuestionnaires && sharedQuestionnaireTemplates.length > 0 && (
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-5 w-5" />
              {t.questionnaires}
            </h3>
            <div className="space-y-2">
              {sharedQuestionnaireTemplates.map((tpl) => (
                <div key={tpl.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.patientSendCount}: {tpl.patientSendCount} · {t.copyCount}: {tpl.copyCount}
                      {tpl.updatedAt ? ` · ${format(new Date(tpl.updatedAt), "dd.MM.yyyy")}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewTemplateId(tpl.id);
                        setPreviewTemplateMeta({ name: tpl.name });
                      }}
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      {t.viewQuestionnaire}
                    </Button>
                    {user?.isAdmin && !isOwnProfile && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={copyTemplateMutation.isPending}
                        onClick={() => copyTemplateMutation.mutate(tpl.id)}
                      >
                        {t.copyQuestionnaireTemplate}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isOwnProfile && (
          <Button
            onClick={handleSave}
            disabled={isSaving || isUploading}
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
        )}

        {isOwnProfile && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="button-logout-profile"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t.logout}
          </Button>
        )}
      </div>

      <Dialog open={avatarPreviewOpen} onOpenChange={setAvatarPreviewOpen}>
        <DialogContent className="max-w-[100vw] w-screen h-screen p-0 border-none bg-black">
          <div className="w-full h-full flex items-center justify-center">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="avatar-fullscreen" className="max-w-full max-h-full object-contain" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!previewTemplateId} onOpenChange={(open) => !open && setPreviewTemplateId(null)}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="sr-only">
            <SheetTitle>{previewTemplateMeta?.name ?? t.questionnaireTitle}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {previewTemplate?.structure && (
              <DynamicQuestionnaireForm
                hideTitle
                mode="preview"
                structure={previewTemplate.structure}
                templateName={previewTemplate.name}
                templateId={previewTemplate.id}
                onCopy={
                  user?.isAdmin && !isOwnProfile
                    ? () => previewTemplateId && copyTemplateMutation.mutate(previewTemplateId)
                    : undefined
                }
                isCopying={copyTemplateMutation.isPending}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </>
  );
}
