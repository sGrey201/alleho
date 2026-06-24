import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RouteSeo } from "@/components/RouteSeo";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { pageMeta } from "@/lib/pageMeta";
import { t } from "@/lib/i18n";
import { consumeAuthReturnTo, resolveAuthReturnTo } from "@/lib/authReturnTo";

export default function RoleOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading, requiresRoleSelection } = useAuth();
  const [pendingRole, setPendingRole] = useState<boolean | null>(null);

  if (!isLoading && !requiresRoleSelection) {
    return <Redirect to="/messenger" />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const completeRoleMutation = useMutation({
    mutationFn: async (isHomeopath: boolean) => {
      const res = await apiRequest("POST", "/api/auth/complete-role-selection", { isHomeopath });
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

  const handleSelect = (isHomeopath: boolean) => {
    setPendingRole(isHomeopath);
    completeRoleMutation.mutate(isHomeopath);
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
            <p className="text-center text-base font-medium">{t.registrationAreYouHomeopath}</p>
            <p className="text-center text-sm text-muted-foreground">{t.roleOnboardingHint}</p>
            <Button
              type="button"
              className="w-full"
              onClick={() => handleSelect(true)}
              disabled={completeRoleMutation.isPending}
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
              disabled={completeRoleMutation.isPending}
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
