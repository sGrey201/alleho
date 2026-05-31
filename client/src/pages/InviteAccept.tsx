import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { profileAvatarSrc } from "@/lib/utils";

const acceptInviteSchema = z.object({
  email: z.string().email("Некорректный email"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;
type InvitePreview = {
  inviteType: "patient" | "homeopath";
  inviter: {
    id: string | null;
    name: string;
    email: string | null;
  };
};

type Step = "account" | "email" | "patientNames";

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

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get("email") || "", []);

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: initialEmail, firstName: "", lastName: "" },
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

  const isPatientInvite = invitePreview?.inviteType === "patient";

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

  const acceptInviteMutation = useMutation({
    mutationFn: async (data: AcceptInviteFormData) => {
      const res = await apiRequest("POST", "/api/invites/accept", {
        email: data.email.trim().toLowerCase(),
        token,
        firstName: data.firstName?.trim() ?? "",
        lastName: data.lastName?.trim() ?? "",
      });
      return res.json();
    },
    onSuccess: async (data: { joinedAsExistingUser?: boolean }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: data?.joinedAsExistingUser ? "Присоединение завершено" : "Регистрация завершена",
        description: data?.joinedAsExistingUser
          ? "Вы добавлены в новый чат с гомеопатом"
          : "Пароль отправлен на вашу почту",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      let title = "Не удалось завершить регистрацию";
      if (msg.includes("invite_expired")) title = "Ссылка-приглашение истекла";
      else if (msg.includes("invite_inactive")) title = "Ссылка уже использована или отозвана";
      else if (msg.includes("invalid_invite")) title = "Недействительная ссылка-приглашение";
      else if (msg.includes("invalid_invite_email")) title = "Этот email не подходит для данной ссылки";
      else if (msg.includes("user_exists")) title = "Пользователь с таким email уже зарегистрирован";
      else if (msg.includes("first_name_and_last_name_required")) title = "Укажите имя и фамилию пациента";
      toast({ title, variant: "destructive" });
    },
  });

  const submitAccept = (payload: AcceptInviteFormData) => {
    acceptInviteMutation.mutate({
      email: payload.email,
      firstName: payload.firstName?.trim() ?? "",
      lastName: payload.lastName?.trim() ?? "",
    });
  };

  const validatePatientNames = (): boolean => {
    const firstName = form.getValues("firstName")?.trim();
    const lastName = form.getValues("lastName")?.trim();
    let ok = true;
    if (!firstName) {
      form.setError("firstName", { message: "Укажите имя" });
      ok = false;
    }
    if (!lastName) {
      form.setError("lastName", { message: "Укажите фамилию" });
      ok = false;
    }
    return ok;
  };

  const handleSwitchAccount = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    form.setValue("email", initialEmail);
    form.setValue("firstName", "");
    form.setValue("lastName", "");
    setStep("email");
  };

  const handleAccountNext = () => {
    if (!user?.email) return;
    form.setValue("email", user.email);
    if (isPatientInvite) {
      setStep("patientNames");
      return;
    }
    submitAccept({ email: user.email, firstName: "", lastName: "" });
  };

  const handleEmailNext = async () => {
    const valid = await form.trigger("email");
    if (!valid) return;
    if (isPatientInvite) {
      setStep("patientNames");
      return;
    }
    submitAccept(form.getValues());
  };

  const handlePatientNamesSubmit = () => {
    if (!validatePatientNames()) return;
    const email = form.getValues("email");
    if (!email?.trim()) {
      form.setError("email", { message: "Укажите email" });
      return;
    }
    submitAccept(form.getValues());
  };

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <img
              src="/auth-logo.png"
              alt="hovial"
              className="mx-auto h-auto w-full max-w-[280px] object-contain"
              loading="eager"
              decoding="async"
            />
            <CardTitle className="text-2xl pt-4">Недействительная ссылка</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            В ссылке отсутствует токен приглашения.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPageLoading = authLoading || previewLoading || step === null;

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <img
            src="/auth-logo.png"
            alt="hovial"
            className="mx-auto h-auto w-full max-w-[280px] object-contain"
            loading="eager"
            decoding="async"
          />
          <CardTitle className="text-2xl pt-4">Регистрация по приглашению</CardTitle>
          {invitePreview?.inviter?.name && (
            <p className="text-sm text-muted-foreground pt-2">
              Вас пригласил: <span className="font-medium text-foreground">{invitePreview.inviter.name}</span>
            </p>
          )}
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
                  <p className="text-center text-sm text-muted-foreground">
                    Новый чат будет создан в аккаунте
                  </p>
                  <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 px-4 py-5">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={profileAvatarSrc(user.profileImageUrl)} alt="" />
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
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleAccountNext}
                      disabled={acceptInviteMutation.isPending}
                    >
                      {acceptInviteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Завершение...
                        </>
                      ) : (
                        "Далее"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleSwitchAccount()}
                      disabled={acceptInviteMutation.isPending}
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
                        <FormLabel>Укажите ваш email, чтобы завершить регистрацию</FormLabel>
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
                    disabled={acceptInviteMutation.isPending}
                  >
                    Далее
                  </Button>
                </div>
              )}

              {step === "patientNames" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Укажите ФИО пациента для названия нового чата
                  </p>
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Фамилия</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="family-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Имя</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="given-name" />
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
                    {!isAuthenticated && (
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
                    {isAuthenticated && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setStep("account")}
                        disabled={acceptInviteMutation.isPending}
                      >
                        Назад
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
