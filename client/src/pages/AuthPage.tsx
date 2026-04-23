import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, Lock, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Некорректный email"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Ошибка входа", 
        description: error.message || "Неверный email или пароль",
        variant: "destructive" 
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", data);
      return res.json();
    },
    onSuccess: () => {
      setForgotPasswordSent(true);
      toast({ title: "Письмо отправлено", description: "Проверьте вашу почту" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Ошибка", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Alleho - пространство для работы и общения гомеопатов</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="login" className="space-y-4 mt-4">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              {...field} 
                              type="email" 
                              placeholder="your@email.com" 
                              className="pl-10"
                              data-testid="input-login-email"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Пароль</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              {...field} 
                              type="password" 
                              placeholder="" 
                              className="pl-10"
                              data-testid="input-login-password"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending ? "Вход..." : "Войти"}
                  </Button>
                </form>
              </Form>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("forgot")}
                  className="text-sm text-primary hover:underline"
                  data-testid="link-forgot-password"
                >
                  Забыли пароль?
                </button>
              </div>
            </TabsContent>

            <TabsContent value="forgot" className="space-y-4 mt-4">
              {forgotPasswordSent ? (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    Если аккаунт с указанным email существует, вы получите письмо с инструкциями по восстановлению пароля.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab("login");
                      setForgotPasswordSent(false);
                    }}
                    data-testid="button-back-to-login"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Вернуться к входу
                  </Button>
                </div>
              ) : (
                <>
                  <Form {...forgotPasswordForm}>
                    <form onSubmit={forgotPasswordForm.handleSubmit((data) => forgotPasswordMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={forgotPasswordForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input 
                                  {...field} 
                                  type="email" 
                                  placeholder="your@email.com" 
                                  className="pl-10"
                                  data-testid="input-forgot-email"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={forgotPasswordMutation.isPending}
                        data-testid="button-forgot-submit"
                      >
                        {forgotPasswordMutation.isPending ? "Отправка..." : "Отправить ссылку"}
                      </Button>
                    </form>
                  </Form>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setActiveTab("login")}
                      className="text-sm text-primary hover:underline"
                      data-testid="link-back-to-login"
                    >
                      Вернуться к входу
                    </button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <p className="mt-6 max-w-md text-center text-xs text-muted-foreground" data-testid="text-disclaimer">
        Платформа alleho.ru является программным обеспечением для хранения информации и обмена сообщениями между специалистами и их клиентами.
        Платформа не является медицинской организацией и не оказывает медицинские услуги.
      </p>
    </div>
  );
}
