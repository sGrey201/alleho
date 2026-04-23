import { useMemo } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const acceptInviteSchema = z.object({
  email: z.string().email("Некорректный email"),
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

export default function InviteAccept() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const initialEmail = useMemo(() => new URLSearchParams(window.location.search).get("email") || "", []);

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: initialEmail },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (data: AcceptInviteFormData) => {
      const res = await apiRequest("POST", "/api/invites/accept", {
        email: data.email,
        token,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Регистрация завершена", description: "Пароль отправлен на вашу почту" });
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

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Недействительная ссылка</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            В ссылке отсутствует токен приглашения.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Регистрация по приглашению</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => acceptInviteMutation.mutate(data))}
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
  );
}
