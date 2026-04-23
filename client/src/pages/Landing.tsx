import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function Landing() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (isAdmin) {
        setLocation("/messenger");
        return;
      }
      setLocation("/health-wall");
    }
  }, [isLoading, isAuthenticated, isAdmin, setLocation]);

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
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Alle Homöopathen
        </h1>
        <p className="text-muted-foreground text-lg mb-6">
          Закрытое сообщество для гомеопатов
        </p>

        <p className="text-muted-foreground mb-8 leading-relaxed">
          Общение и работа в одном месте. Современные технологии вместе с накопленной мудростью —
          безопасная среда для обмена опытом, консилиумов и поддержки пациентов.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleLogin} size="lg">
            Войти в сообщество
          </Button>
        </div>
      </main>
    </div>
  );
}
