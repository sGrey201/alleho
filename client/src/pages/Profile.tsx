import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, LogOut, Camera, ArrowLeft, ClipboardList, Eye, MessageCircle, Flag } from "lucide-react";
import { format } from "date-fns";
import DynamicQuestionnaireForm from "@/components/DynamicQuestionnaireForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocation, useRoute, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { clearOfflineCache } from "@/lib/clearOfflineCache";
import { useUpload } from "@/hooks/use-upload";
import { parseQuestionnaireHintsMode } from "@shared/questionnaireTypes";
import type { AccountReportCategory } from "@shared/schema";
import { RouteSeo } from "@/components/RouteSeo";
import { pageMeta } from "@/lib/pageMeta";
import { getMessengerProfileFromSearch } from "@/lib/messengerPaths";
import { normalizeImageFile } from "@/lib/normalizeImageFile";
import { profileAvatarSrc } from "@/lib/utils";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { APP_HOME_PATH } from "@shared/brand";

export type ProfileProps = {
  onSaveSuccess?: () => void;
  /** Render inside messenger right panel (desktop split layout). */
  embedded?: boolean;
  onBack?: () => void;
  profileUserId?: string;
};

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

export default function Profile({
  onSaveSuccess,
  embedded = false,
  onBack,
  profileUserId: profileUserIdProp,
}: ProfileProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const profileSearch = useSearch();
  const profileReturnTo = getMessengerProfileFromSearch(profileSearch);
  const [, profileParams] = useRoute("/profile/:userId");
  const [, messengerProfileParams] = useRoute("/messenger/profile/:userId");
  const targetUserId = profileUserIdProp ?? profileParams?.userId ?? messengerProfileParams?.userId;
  const handleBack = () => (onBack ? onBack() : window.history.back());
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
  const hasPassword = (user as { hasPassword?: boolean } | undefined)?.hasPassword !== false;
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
  }>({
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
  const [openingChat, setOpeningChat] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<AccountReportCategory>("spam");
  const [reportDetails, setReportDetails] = useState("");

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
      toast({ title: t.questionnaireTemplateCopied });
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
    },
    onError: () => {
      toast({ title: t.questionnaireTemplateCopyError, variant: "destructive" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (payload: { category: AccountReportCategory; details?: string }) => {
      const res = await apiRequest("POST", `/api/users/${targetUserId}/report`, payload);
      return res.json();
    },
    onSuccess: () => {
      setReportDialogOpen(false);
      setReportCategory("spam");
      setReportDetails("");
      toast({ title: t.reportSubmitted });
    },
    onError: (error: Error) => {
      const statusMatch = /^(\d+):/.exec(error.message);
      const status = statusMatch ? Number(statusMatch[1]) : null;
      let title = t.reportSubmitError;
      if (status === 409) {
        title = t.reportAlreadySubmitted;
      } else if (error.message.includes("Details required")) {
        title = t.reportDetailsRequired;
      }
      toast({ title, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (profileUser) {
      setFirstName(profileUser.firstName || "");
      setLastName(profileUser.lastName || "");
      setCountry(profileUser.country || "");
      setCity(profileUser.city || "");
      setProfileImageUrl(profileUser.profileImageUrl || "");
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
    await clearOfflineCache();
    window.location.href = APP_HOME_PATH;
  };

  const handleClearOfflineCache = async () => {
    await clearOfflineCache();
    toast({ title: t.offlineCacheCleared });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const normalizedFile = await normalizeImageFile(file);
    const uploadResponse = await uploadFile(normalizedFile);
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

  const openDirectChat = async (partnerUserId: string) => {
    setOpeningChat(true);
    try {
      const res = await fetch(`/api/messenger/direct/${partnerUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { conversationId?: string };
      if (!data.conversationId) throw new Error("Нет id чата");
      setLocation(`/messenger/direct/${data.conversationId}`);
    } catch {
      toast({ title: t.error, description: "Не удалось открыть чат", variant: "destructive" });
    } finally {
      setOpeningChat(false);
    }
  };

  const canStartChat =
    !isOwnProfile && !!user?.isAdmin && !!profileUser?.isAdmin && !!profileUserId;

  const canReportUser =
    !isOwnProfile && !!profileUser?.isAdmin && !!profileUserId;

  const handleSubmitReport = () => {
    if (reportCategory === "other" && reportDetails.trim().length < 3) {
      toast({ title: t.reportDetailsRequired, variant: "destructive" });
      return;
    }
    reportMutation.mutate({
      category: reportCategory,
      details: reportDetails.trim() || undefined,
    });
  };

  const sharedQuestionnairesSection =
    showSharedQuestionnaires && sharedQuestionnaireTemplates.length > 0 ? (
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
    ) : null;

  const questionnairePreviewSheet = (
    <Sheet open={!!previewTemplateId} onOpenChange={(open) => !open && setPreviewTemplateId(null)}>
      <SheetContent
        side="right"
        hideCloseButton
        className="app-sheet-keyboard-aware flex w-full flex-col p-0 sm:max-w-lg"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{previewTemplateMeta?.name ?? t.questionnaireTitle}</SheetTitle>
        </SheetHeader>
        <div className="app-sheet-panel-header flex shrink-0 items-center gap-2 border-b">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setPreviewTemplateId(null)}
            aria-label={t.backToHealthWall}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {previewTemplateMeta?.name ?? t.questionnaireTitle}
          </h2>
        </div>
        <div className="app-sheet-panel-body min-h-0 flex-1 overflow-y-auto">
          {previewTemplate?.structure && (
            <DynamicQuestionnaireForm
              hideTitle
              mode="preview"
              structure={previewTemplate.structure}
              templateName={previewTemplate.name}
              templateId={previewTemplate.id}
              hintsMode={parseQuestionnaireHintsMode(previewTemplate.hintsMode)}
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
  );

  if (!isOwnProfile) {
    return (
      <>
        <RouteSeo {...pageMeta.profile} />
      <div className={embedded ? "flex h-full min-h-0 flex-col bg-background" : "bg-background"}>
        <div
          className={
            embedded
              ? "relative h-48 w-full shrink-0 bg-muted md:h-56"
              : "relative h-[50vh] min-h-[280px] max-h-[520px] w-full bg-muted"
          }
        >
          {profileImageUrl ? (
            <img src={profileImageUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-6xl font-semibold text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
            <Button
              type="button"
              variant="ghost"
              className="h-12 w-12 shrink-0 rounded-full bg-black/35 text-white hover:bg-black/50"
              onClick={handleBack}
              aria-label="Назад"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <h1 className="text-white text-2xl font-semibold leading-tight">{displayName}</h1>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {canStartChat && (
            <Button
              type="button"
              className="w-full"
              disabled={openingChat}
              onClick={() => void openDirectChat(profileUserId!)}
            >
              {openingChat ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-4 w-4" />
              )}
              {t.startChat}
            </Button>
          )}
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Страна, город</p>
            <p className="text-base text-foreground">{locationLabel}</p>
          </div>
          {sharedQuestionnairesSection}
          {canReportUser && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setReportDialogOpen(true)}
            >
              <Flag className="mr-2 h-4 w-4" />
              {t.reportUser}
            </Button>
          )}
        </div>

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.reportUser}</DialogTitle>
              <DialogDescription>{t.reportUserDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.reportCategoryLabel}</Label>
              <RadioGroup
                value={reportCategory}
                onValueChange={(value) => setReportCategory(value as AccountReportCategory)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="spam" id="report-spam" />
                  <Label htmlFor="report-spam" className="font-normal cursor-pointer">
                    {t.reportCategorySpam}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="profanity" id="report-profanity" />
                  <Label htmlFor="report-profanity" className="font-normal cursor-pointer">
                    {t.reportCategoryProfanity}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="other" id="report-other" />
                  <Label htmlFor="report-other" className="font-normal cursor-pointer">
                    {t.reportCategoryOther}
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-details" className="text-sm font-medium">
                {t.reportDetailsLabel}
                {reportCategory === "other" ? " *" : ""}
              </Label>
              <Textarea
                id="report-details"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder={t.reportDetailsPlaceholder}
                rows={3}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)}>
                {t.cancel}
              </Button>
              <Button
                type="button"
                disabled={reportMutation.isPending}
                onClick={handleSubmitReport}
              >
                {reportMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t.reportSubmit}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {questionnairePreviewSheet}
      </div>
      </>
    );
  }

  return (
    <>
      <RouteSeo {...pageMeta.profile} />
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-y-auto px-4 py-4 pb-8"
          : "px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top,0px))]"
      }
    >
      <div className="space-y-6">
        {!embedded && (
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            className="h-12 w-12 shrink-0 -ml-2 rounded-full"
            onClick={handleBack}
            aria-label="Назад"
            data-testid="button-profile-back"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </div>
        )}
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            className="rounded-full"
            onClick={() => profileImageUrl && setAvatarPreviewOpen(true)}
            disabled={!profileImageUrl}
            aria-label="Открыть аватар"
          >
            <Avatar className="h-20 w-20">
              {profileImageUrl ? (
                <AvatarImage src={profileAvatarSrc(profileImageUrl, "avatar")} alt="avatar" />
              ) : null}
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

        {isOwnProfile && (
          <div>
            {!showChangePasswordForm ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {hasPassword && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => setShowChangePasswordForm(true)}
                    data-testid="link-show-change-password"
                  >
                    {t.changePassword}
                  </button>
                )}
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => void handleClearOfflineCache()}
                  data-testid="button-clear-offline-cache"
                >
                  {t.clearOfflineCache}
                </button>
              </div>
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

        {sharedQuestionnairesSection}

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

      <ImageViewerDialog
        open={avatarPreviewOpen}
        imageUrl={profileImageUrl || null}
        hasMultiple={false}
        onClose={() => setAvatarPreviewOpen(false)}
        onPrevious={() => {}}
        onNext={() => {}}
      />

      {questionnairePreviewSheet}
    </div>
    </>
  );
}
