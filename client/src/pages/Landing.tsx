import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { LandingPanel } from "@/components/LandingPanel";
import { navigateToAuth, navigateToAuthRegister } from "@/lib/authReturnTo";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/messenger");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center">
        <LandingPanel
          onLogin={() => navigateToAuth(setLocation, "/messenger")}
          onRegister={() => navigateToAuthRegister(setLocation, "/messenger")}
        />
      </main>
    </div>
  );
}
