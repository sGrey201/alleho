import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Lock, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { profileAvatarSrc } from "@/lib/utils";
import { RouteSeo } from "@/components/RouteSeo";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { pageMeta } from "@/lib/pageMeta";
import { APP_HOME_PATH } from "@shared/brand";
import { t } from "@/lib/i18n";

const acceptInviteSchema = z.object({
  email: z.string().email("Некорректный email"),
  firstName: z.string().optional(),
  patientName: z.string().optional(),
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;
type InvitePreview = {
  inviteType: "patient" | "homeopath" | "open" | "group_member";
  precreatedPatientChat?: boolean;
  groupName?: string | null;
  inviter: {
    id: string | null;
    name: string;
    email: string | null;
  };
};

type Step = "account" | "email" | "password" | "roleSelection" | "patientNames";

function userDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  const name = [lastName, firstName].filter(Boolean).join(" ").trim();
  return name || email || "Пользователь";
}

function userInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  const fromName = `${firstName?.trim()?.[0] ?? ""}${lastName?.trim()?.[0] ?? ""}`.toUpperCase();
  if (fromName) return fromName;
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

export default function InviteAccept() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step | null>(null);
  const [isHomeopath, setIsHomeopath] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get("email") || "", []);

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: initialEmail, firstName: "", patientName: "" },
  });

  const { data: invitePreview, isLoading: previewLoading } = useQuery<InvitePreview>({
    queryKey: ["/api/invites/preview", token],
    queryFn: async () => {
      const res = await fetch(`/api/invites/preview?token=${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const isOpenInvite = invitePreview?.inviteType === "open";
  const isTypedPatientInvite = invitePreview?.inviteType === "patient";
  const isGroupInvite = invitePreview?.inviteType === "group_member";

  useEffect(() => {
    if (authLoading) return;
    setStep((current) => {
      if (current !== null) return current;
      return isAuthenticated ? "account" : "email";
    });
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (user?.email) {
      form.setValue("email", user.email);
    }
  }, [user?.email, form]);

  const checkInviteEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const params = new URLSearchParams({
        token,
        email: email.trim().toLowerCase(),
      });
      const res = await fetch(`/api/invites/check-email?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ exists: boolean }>;
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Письмо отправлено",
        description: "Проверьте вашу почту",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password: loginPassword }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", {
        email: email.trim().toLowerCase(),
        password: loginPassword,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      setPassword("");
      setStep("account");
    },
    onError: () => {
      toast({ title: "Неверный email или пароль", variant: "destructive" });
    },
  });

  const groupInviteAcceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/group-invites/accept", { token });
      return res.json() as Promise<{ conversationId: string }>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.groupInviteJoined });
      setLocation(data.conversationId ? `/messenger/group/${data.conversationId}` : APP_HOME_PATH);
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      let title = t.inviteError;
      if (msg.includes("invite_expired")) title = "Ссылка-приглашение истекла";
      else if (msg.includes("invite_inactive")) title = "Ссылка уже использована или отозвана";
      else if (msg.includes("invalid_invite")) title = "Недействительная ссылка-приглашение";
      toast({ title, variant: "destructive" });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (data: AcceptInviteFormData & { isHomeopath?: boolean }) => {
      const payload: Record<string, unknown> = {
        email: data.email.trim().toLowerCase(),
        token,
        firstName: data.firstName?.trim() ?? "",
        patientName: data.patientName?.trim() ?? "",
      };
      if (isOpenInvite) {
        if (typeof data.isHomeopath !== "boolean") {
          throw new Error("role_selection_required");
        }
        payload.isHomeopath = data.isHomeopath;
      }
      const res = await apiRequest("POST", "/api/invites/accept", payload);
      return res.json();
    },
    onSuccess: async (data: { joinedAsExistingUser?: boolean; conversationId?: string | null }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: data?.joinedAsExistingUser ? "Присоединение завершено" : "Регистрация завершена",
        description: data?.joinedAsExistingUser
          ? "Вы добавлены в новый чат с гомеопатом"
          : "Пароль отправлен на вашу почту",
      });
      setLocation(data.conversationId ? `/messenger/chat/${data.conversationId}` : APP_HOME_PATH);
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      let title = "Не удалось завершить регистрацию";
      if (msg.includes("invite_expired")) title = "Ссылка-приглашение истекла";
      else if (msg.includes("invite_inactive")) title = "Ссылка уже использована или отозвана";
      else if (msg.includes("invalid_invite")) title = "Недействительная ссылка-приглашение";
      else if (msg.includes("invalid_invite_email")) title = "Этот email не подходит для данной ссылки";
      else if (msg.includes("user_exists")) title = "Пользователь с таким email уже зарегистрирован";
      else if (msg.includes("first_name_required")) title = "Укажите имя пользователя";
      else if (msg.includes("first_name_and_last_name_required")) title = "Укажите имя пользователя";
      else if (msg.includes("role_selection_required")) title = "Укажите, являетесь ли вы гомеопатом";
      toast({ title, variant: "destructive" });
    },
  });

  const submitAccept = (payload: AcceptInviteFormData, options?: { isHomeopath?: boolean }) => {
    acceptInviteMutation.mutate({
      email: payload.email,
      firstName: payload.firstName?.trim() ?? "",
      patientName: payload.patientName?.trim() ?? "",
      isHomeopath: options?.isHomeopath,
    });
  };

  const validatePatientNames = (): boolean => {
    if (isAuthenticated && user) {
      const resolvedFirstName =
        user.firstName?.trim() ||
        userDisplayName(user.firstName, user.lastName, user.email);
      form.setValue("firstName", resolvedFirstName);
      return true;
    }
    const firstName = form.getValues("firstName")?.trim();
    if (!firstName) {
      form.setError("firstName", { message: "Укажите имя пользователя" });
      return false;
    }
    return true;
  };

  const handleSwitchAccount = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    form.setValue("email", initialEmail);
    form.setValue("firstName", "");
    form.setValue("patientName", "");
    setPassword("");
    setIsHomeopath(null);
    setStep("email");
  };

  const goAfterAccountOrEmail = () => {
    if (isGroupInvite) {
      setStep("account");
      return;
    }
    if (isOpenInvite) {
      setStep("roleSelection");
      return;
    }
    if (isTypedPatientInvite) {
      setStep("patientNames");
      return;
    }
    submitAccept(form.getValues());
  };

  const handleAccountNext = () => {
    if (!user?.email) return;
    form.setValue("email", user.email);
    if (isGroupInvite) {
      if (!user.isAdmin) {
        toast({ title: t.groupInvitePatientsNotAllowed, variant: "destructive" });
        return;
      }
      groupInviteAcceptMutation.mutate();
      return;
    }
    if (isTypedPatientInvite) {
      const resolvedFirstName =
        user.firstName?.trim() ||
        userDisplayName(user.firstName, user.lastName, user.email);
      form.setValue("firstName", resolvedFirstName);
      submitAccept(form.getValues());
      return;
    }
    goAfterAccountOrEmail();
  };

  const handleEmailNext = async () => {
    const valid = await form.trigger("email");
    if (!valid) return;
    const email = form.getValues("email").trim().toLowerCase();
    form.setValue("email", email);
    try {
      const { exists } = await checkInviteEmailMutation.mutateAsync(email);
      if (isGroupInvite && !exists) {
        toast({
          title: t.groupInvitePatientsNotAllowed,
          description: "Войдите с email зарегистрированного гомеопата.",
          variant: "destructive",
        });
        return;
      }
      if (exists) {
        setPassword("");
        setStep("password");
        return;
      }
    } catch {
      toast({ title: t.error, variant: "destructive" });
      return;
    }
    goAfterAccountOrEmail();
  };

  const handlePasswordNext = () => {
    const email = form.getValues("email").trim().toLowerCase();
    if (!email) {
      form.setError("email", { message: "Укажите email" });
      setStep("email");
      return;
    }
    if (!password.trim()) {
      toast({ title: "Введите пароль", variant: "destructive" });
      return;
    }
    loginMutation.mutate({ email, password });
  };

  const handleSelectHomeopath = () => {
    setIsHomeopath(true);
    const email = form.getValues("email");
    if (!email?.trim()) {
      form.setError("email", { message: "Укажите email" });
      return;
    }
    submitAccept(form.getValues(), { isHomeopath: true });
  };

  const handleSelectPatient = () => {
    setIsHomeopath(false);
    setStep("patientNames");
  };

  const handlePatientNamesSubmit = () => {
    if (!validatePatientNames()) return;
    const email = form.getValues("email");
    if (!email?.trim()) {
      form.setError("email", { message: "Укажите email" });
      return;
    }
    submitAccept(form.getValues(), isOpenInvite ? { isHomeopath: false } : undefined);
  };

  const inviteSeo = <RouteSeo {...pageMeta.inviteAccept} />;

  if (!token) {
    return (
      <>
        {inviteSeo}
      <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <AuthLogoLink />
            <CardTitle className="text-2xl pt-4">Недействительная ссылка</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            В ссылке отсутствует токен приглашения.
          </CardContent>
        </Card>
      </div>
      </>
    );
  }

  const isPageLoading = authLoading || previewLoading || step === null;

  return (
    <>
      {inviteSeo}
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <AuthLogoLink />
        </CardHeader>
        <CardContent>
          {isPageLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Form {...form}>
              {step === "account" && user && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3 px-4 py-5">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={profileAvatarSrc(user.profileImageUrl, "avatar")} alt="" />
                      <AvatarFallback className="text-lg">
                        {userInitials(user.firstName, user.lastName, user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-center min-w-0 w-full">
                      <p className="font-semibold text-foreground truncate">
                        {userDisplayName(user.firstName, user.lastName, user.email)}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    {isGroupInvite
                      ? t.groupInviteAcceptJoin(invitePreview?.groupName ?? "")
                      : t.inviteAcceptJoinPrecreatedChat(
                          invitePreview?.inviter?.name || "ваш гомеопат"
                        )}
                  </p>
                  {isTypedPatientInvite && (
                    <FormField
                      control={form.control}
                      name="patientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.inviteAcceptPatientNameLabel}</FormLabel>
                          <FormControl>
                            <Input {...field} autoFocus />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleAccountNext}
                      disabled={acceptInviteMutation.isPending || groupInviteAcceptMutation.isPending}
                    >
                      {acceptInviteMutation.isPending || groupInviteAcceptMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Завершение...
                        </>
                      ) : isGroupInvite ? (
                        t.groupInviteAcceptJoin(invitePreview?.groupName ?? "")
                      ) : isTypedPatientInvite ? (
                        "Завершить регистрацию"
                      ) : (
                        "Далее"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleSwitchAccount()}
                      disabled={acceptInviteMutation.isPending || groupInviteAcceptMutation.isPending}
                    >
                      Сменить аккаунт
                    </Button>
                  </div>
                </div>
              )}

              {step === "email" && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.inviteAcceptEmailLabel}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input {...field} type="email" className="pl-10" autoComplete="email" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void handleEmailNext()}
                    disabled={checkInviteEmailMutation.isPending || acceptInviteMutation.isPending}
                  >
                    {checkInviteEmailMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Проверка...
                      </>
                    ) : (
                      "Далее"
                    )}
                  </Button>
                </div>
              )}

              {step === "password" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Аккаунт с email <span className="font-medium text-foreground">{form.watch("email")}</span> уже
                    зарегистрирован. Введите пароль, чтобы войти.
                  </p>
                  <div className="space-y-2">
                    <Label>{t.inviteAcceptPasswordLabel}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        className="pl-10"
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handlePasswordNext();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const email = form.getValues("email").trim().toLowerCase();
                        if (!email) return;
                        forgotPasswordMutation.mutate(email);
                      }}
                      disabled={forgotPasswordMutation.isPending || loginMutation.isPending}
                      className="text-sm text-primary hover:underline"
                    >
                      {forgotPasswordMutation.isPending ? "Отправка..." : t.forgotPasswordLink}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handlePasswordNext}
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Вход...
                        </>
                      ) : (
                        t.login
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setStep("email")}
                      disabled={loginMutation.isPending}
                    >
                      Назад
                    </Button>
                  </div>
                </div>
              )}

              {step === "roleSelection" && (
                <div className="space-y-4">
                  <p className="text-center text-base font-medium">{t.registrationAreYouHomeopath}</p>
                  <p className="text-center text-sm text-muted-foreground">
                    Этот шаг обязателен для завершения регистрации
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSelectHomeopath}
                    disabled={acceptInviteMutation.isPending}
                  >
                    {acceptInviteMutation.isPending && isHomeopath === true ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Завершение...
                      </>
                    ) : (
                      t.registrationYesHomeopath
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleSelectPatient}
                    disabled={acceptInviteMutation.isPending}
                  >
                    {t.registrationNoPatient}
                  </Button>
                </div>
              )}

              {step === "patientNames" && !isAuthenticated && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.inviteAcceptUserNameLabel}</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="given-name" autoFocus />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="patientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.inviteAcceptPatientNameLabel}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handlePatientNamesSubmit}
                      disabled={acceptInviteMutation.isPending}
                    >
                      {acceptInviteMutation.isPending ? "Завершение регистрации..." : "Завершить регистрацию"}
                    </Button>
                    {!isOpenInvite && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setStep("email")}
                        disabled={acceptInviteMutation.isPending}
                      >
                        Назад
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {step === "patientNames" && isAuthenticated && isOpenInvite && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="patientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.inviteAcceptPatientNameLabel}</FormLabel>
                        <FormControl>
                          <Input {...field} autoFocus />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handlePatientNamesSubmit}
                      disabled={acceptInviteMutation.isPending}
                    >
                      {acceptInviteMutation.isPending ? "Завершение регистрации..." : "Завершить регистрацию"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setStep("roleSelection")}
                      disabled={acceptInviteMutation.isPending}
                    >
                      Назад
                    </Button>
                  </div>
                </div>
              )}
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
