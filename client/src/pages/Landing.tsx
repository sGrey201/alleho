import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import { t } from "@/lib/i18n";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/messenger");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  const handleLogin = () => setLocation("/auth");

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-2xl mx-auto">
        <div className="mb-6 w-full max-w-[280px]">
          <AuthLogoLink />
        </div>

        <p className="text-muted-foreground mb-8 leading-relaxed">
          Общение и работа в одном месте. Современные технологии вместе с накопленной мудростью —
          безопасная среда для обмена опытом, консилиумов и поддержки пациентов.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleLogin} size="lg">
            Войти в сообщество
          </Button>
        </div>

        <p
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 shadow-[0_0_16px_-6px_rgba(245,158,11,0.4)] dark:text-amber-100"
          data-testid="landing-invite-only"
        >
          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          {t.landingInviteOnly}
        </p>
      </main>
    </div>
  );
}
