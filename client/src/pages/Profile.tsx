import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, LogOut, Camera, MessageCircle, Search, User, ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";

export type ProfileProps = {
  onSaveSuccess?: () => void;
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

export default function Profile({ onSaveSuccess }: ProfileProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
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
  const { data: ownInviteSummary } = useQuery<{
    inviter: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
    invitedCount: number;
  }>({
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
    inviter: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
    invitedCount: number;
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
  const inviteSummary = isOwnProfile
    ? ownInviteSummary
    : {
        inviter: viewedProfile?.inviter ?? null,
        invitedCount: viewedProfile?.invitedCount ?? 0,
      };

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

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; gender: string | null; birthMonth: number | null; birthYear: number | null; height: number | null; weight: number | null; country: string | null; city: string | null; profileImageUrl: string | null }) => {
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

  if (!isOwnProfile) {
    return (
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
            <p className="text-xs text-muted-foreground mb-1">Город</p>
            <p className="text-base text-foreground">{city || "Не указан"}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Страна</p>
            <p className="text-base text-foreground">{country || "Не указана"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 pb-24">
      <div className="space-y-6">
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

      {user?.isAdmin && (
        <nav className="fixed bottom-0 left-0 right-0 md:hidden z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-1">
          <div className="rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border/50 flex items-center justify-center gap-0 py-1">
            <Link href="/profile" className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-primary">
              <span className="relative flex items-center justify-center size-8 rounded-full bg-primary/10">
                <User className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-medium">{t.profile}</span>
            </Link>
            <Link href="/messenger" className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-muted-foreground">
              <span className="relative flex items-center justify-center size-8 rounded-full">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-medium">{t.chatsTab}</span>
            </Link>
            <Link href="/messenger" className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-muted-foreground">
              <span className="relative flex items-center justify-center size-8 rounded-full">
                <Search className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-medium">{t.search}</span>
            </Link>
          </div>
        </nav>
      )}

      <Dialog open={avatarPreviewOpen} onOpenChange={setAvatarPreviewOpen}>
        <DialogContent className="max-w-[100vw] w-screen h-screen p-0 border-none bg-black">
          <div className="w-full h-full flex items-center justify-center">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="avatar-fullscreen" className="max-w-full max-h-full object-contain" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
