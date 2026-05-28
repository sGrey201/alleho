import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const acceptInviteSchema = z.object({
  email: z.string().email("Некорректный email"),
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

export default function InviteAccept() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get("email") || "", []);

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: initialEmail },
  });

  const { data: invitePreview } = useQuery<InvitePreview>({
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

  const acceptInviteMutation = useMutation({
    mutationFn: async (data: AcceptInviteFormData) => {
      const res = await apiRequest("POST", "/api/invites/accept", {
        email: data.email,
        token,
      });
      return res.json();
    },
    onSuccess: async (data: { joinedAsExistingUser?: boolean }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: data?.joinedAsExistingUser ? "Присоединение завершено" : "Регистрация завершена",
        description: data?.joinedAsExistingUser ? "Вы добавлены в новый чат с гомеопатом" : "Пароль отправлен на вашу почту",
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
      toast({ title, variant: "destructive" });
    },
  });

  const formEmail = form.watch("email")?.trim().toLowerCase() ?? "";
  const shouldConfirmExistingUserJoin =
    !!user &&
    !!user.email &&
    formEmail.length > 0 &&
    user.email.toLowerCase() === formEmail &&
    invitePreview?.inviteType === "patient";

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

  return (
    <>
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
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => {
                if (shouldConfirmExistingUserJoin) {
                  setConfirmOpen(true);
                  return;
                }
                acceptInviteMutation.mutate(data);
              })}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Укажите ваш email чтобы завершить регистрацию</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input {...field} type="email" className="pl-10" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={acceptInviteMutation.isPending}>
                {acceptInviteMutation.isPending ? "Завершение регистрации..." : "Завершить регистрацию"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подтверждение присоединения</DialogTitle>
          <DialogDescription>
            Вы присоединяетесь к новому чату с гомеопатом {invitePreview?.inviter?.name ?? "по приглашению"}.
            Продолжить?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => {
              setConfirmOpen(false);
              acceptInviteMutation.mutate({ email: form.getValues("email") });
            }}
            disabled={acceptInviteMutation.isPending}
          >
            Присоединиться
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
