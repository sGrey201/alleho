import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RouteSeo } from "@/components/RouteSeo";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { pageMeta } from "@/lib/pageMeta";
import { t } from "@/lib/i18n";
import { consumeAuthReturnTo, resolveAuthReturnTo } from "@/lib/authReturnTo";
import { APP_HOME_PATH } from "@shared/brand";

export default function RoleOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading, requiresRoleSelection } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [pendingRole, setPendingRole] = useState<boolean | null>(null);

  const completeRoleMutation = useMutation({
    mutationFn: async ({ isHomeopath, displayName: name }: { isHomeopath: boolean; displayName: string }) => {
      const res = await apiRequest("POST", "/api/auth/complete-role-selection", {
        isHomeopath,
        displayName: name,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const returnTo = resolveAuthReturnTo();
      if (returnTo) consumeAuthReturnTo();
      setLocation(returnTo ?? "/messenger");
    },
    onError: (error: Error) => {
      setPendingRole(null);
      toast({
        title: t.error,
        description: error.message || t.somethingWrong,
        variant: "destructive",
      });
    },
  });

  if (!isLoading && !requiresRoleSelection) {
    const returnTo = resolveAuthReturnTo();
    if (returnTo) consumeAuthReturnTo();
    return <Redirect to={returnTo ?? APP_HOME_PATH} />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const trimmedName = displayName.trim();
  const canSelectRole = trimmedName.length >= 2;

  const handleSelect = (isHomeopath: boolean) => {
    if (!canSelectRole) {
      toast({
        title: t.error,
        description: "Имя пользователя должно быть не короче 2 символов",
        variant: "destructive",
      });
      return;
    }
    setPendingRole(isHomeopath);
    completeRoleMutation.mutate({ isHomeopath, displayName: trimmedName });
  };

  return (
    <>
      <RouteSeo {...pageMeta.roleOnboarding} />
      <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <AuthLogoLink />
            <CardTitle className="text-2xl pt-4">{t.roleOnboardingTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-onboarding-display-name">{t.roleOnboardingDisplayName}</Label>
              <Input
                id="role-onboarding-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t.registerDisplayNamePlaceholder}
              />
            </div>
            <p className="text-center text-base font-medium">{t.registrationAreYouHomeopath}</p>
            <p className="text-center text-sm text-muted-foreground">{t.roleOnboardingHint}</p>
            <Button
              type="button"
              className="w-full"
              onClick={() => handleSelect(true)}
              disabled={!canSelectRole || completeRoleMutation.isPending}
            >
              {completeRoleMutation.isPending && pendingRole === true ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.loading}
                </>
              ) : (
                t.registrationYesHomeopath
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleSelect(false)}
              disabled={!canSelectRole || completeRoleMutation.isPending}
            >
              {completeRoleMutation.isPending && pendingRole === false ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.loading}
                </>
              ) : (
                t.registrationNoPatient
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
