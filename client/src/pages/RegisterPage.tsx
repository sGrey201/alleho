import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, User, Loader2 } from "lucide-react";
import { RouteSeo } from "@/components/RouteSeo";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { pageMeta } from "@/lib/pageMeta";
import { t } from "@/lib/i18n";
import { navigateToAuth, resolveAuthReturnTo } from "@/lib/authReturnTo";

const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  displayName: z.string().trim().min(2, "Имя должно быть не короче 2 символов"),
  isHomeopath: z.boolean(),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<boolean | null>(null);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", displayName: "", isHomeopath: false },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json() as Promise<{ email: string }>;
    },
    onSuccess: (data) => {
      setRegisteredEmail(data.email);
    },
    onError: (error: Error) => {
      let description = error.message || t.somethingWrong;
      if (error.message.includes("user_exists")) {
        description = "Пользователь с таким email уже зарегистрирован";
      }
      toast({ title: t.error, description, variant: "destructive" });
    },
  });

  const handleSubmit = (data: RegisterFormData) => {
    if (selectedRole === null) {
      toast({
        title: t.error,
        description: t.roleOnboardingHint,
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate({ ...data, isHomeopath: selectedRole });
  };

  const returnTo = resolveAuthReturnTo();

  if (registeredEmail) {
    return (
      <>
        <RouteSeo {...pageMeta.register} />
        <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center pb-2">
              <AuthLogoLink />
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <h1 className="text-xl font-semibold">{t.registerSuccessTitle}</h1>
              <p className="text-muted-foreground text-sm">
                {t.registerSuccessDescription}
                <br />
                <span className="font-medium text-foreground">{registeredEmail}</span>
              </p>
              <Button
                className="w-full"
                onClick={() => navigateToAuth(setLocation, returnTo ?? "/messenger")}
              >
                {t.registerGoToLogin}
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <RouteSeo {...pageMeta.register} />
      <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <AuthLogoLink />
            <h1 className="text-2xl font-semibold pt-4">{t.registerTitle}</h1>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input {...field} type="email" placeholder="your@email.com" className="pl-10" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.registerDisplayName}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder={t.registerDisplayNamePlaceholder}
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t.registrationAreYouHomeopath}</p>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant={selectedRole === true ? "default" : "outline"}
                      onClick={() => setSelectedRole(true)}
                    >
                      {t.registrationYesHomeopath}
                    </Button>
                    <Button
                      type="button"
                      variant={selectedRole === false ? "default" : "outline"}
                      onClick={() => setSelectedRole(false)}
                    >
                      {t.registrationNoPatient}
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.registerSubmitting}
                    </>
                  ) : (
                    t.registerSubmit
                  )}
                </Button>
              </form>
            </Form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t.registerHaveAccount}{" "}
              <Link href={returnTo ? `/auth?return=${encodeURIComponent(returnTo)}` : "/auth"} className="text-primary hover:underline">
                {t.login}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
