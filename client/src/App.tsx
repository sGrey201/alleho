import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Oferta from "@/pages/Oferta";
import Subscribe from "@/pages/Subscribe";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFail from "@/pages/PaymentFail";
import AuthPage from "@/pages/AuthPage";
import InviteAccept from "@/pages/InviteAccept";
import ResetPassword from "@/pages/ResetPassword";
import About from "@/pages/About";
import Messenger from "@/pages/Messenger";
import Profile from "@/pages/Profile";
import QuestionnaireTemplates from "@/pages/QuestionnaireTemplates";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { resetAppShellThemeForClassicLayout } from "@/hooks/useAppShellTheme";

function Router() {
  const { isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/invite/accept" component={InviteAccept} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/terms" component={Terms} />
      <Route path="/oferta" component={Oferta} />
      <Route path="/about" component={About} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/health-wall" component={() => <Redirect to="/messenger" />} />
      <Route path="/health-wall/:patientUserId" component={() => <Redirect to="/messenger" />} />
      <Route path="/messenger" component={Messenger} />
      <Route path="/messenger/direct/:conversationId" component={Messenger} />
      <Route path="/messenger/chat/:conversationId/settings" component={Messenger} />
      <Route path="/messenger/chat/:conversationId" component={Messenger} />
      <Route path="/messenger/patient" component={() => <Redirect to="/messenger" />} />
      <Route path="/messenger/patient/:patientUserId" component={() => <Redirect to="/messenger" />} />
      <Route path="/messenger/group/:conversationId" component={Messenger} />
      <Route path="/messenger/channel/:conversationId" component={Messenger} />
      <Route path="/messenger/channel/:conversationId/post/:messageId/comments" component={Messenger} />
      <Route path="/messenger/group/:conversationId/settings" component={Messenger} />
      <Route path="/messenger/channel/:conversationId/settings" component={Messenger} />
      <Route path="/profile/:userId">{() => <Profile />}</Route>
      <Route path="/profile">{() => <Profile />}</Route>
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/fail" component={PaymentFail} />
      {isAdmin && (
        <>
          <Route path="/questionnaires/:id/edit" component={QuestionnaireTemplates} />
          <Route path="/questionnaires" component={QuestionnaireTemplates} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

/** Locks document scroll and enables safe-area insets on notched phones (Health Wall, Messenger, Profile). */
function useImmersiveViewport(enabled: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle("app-immersive", enabled);
    return () => document.documentElement.classList.remove("app-immersive");
  }, [enabled]);
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  const isProfilePage = location.startsWith("/profile");
  const isQuestionnairesPage = location.startsWith("/questionnaires");
  const isFullscreenPage =
    location.startsWith("/messenger") ||
    isProfilePage ||
    isQuestionnairesPage;

  useImmersiveViewport(isFullscreenPage);

  useEffect(() => {
    if (!isFullscreenPage) {
      resetAppShellThemeForClassicLayout();
    }
  }, [isFullscreenPage]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAuthPage = location === "/auth";
  const isInviteAcceptPage = location.startsWith("/invite/accept");
  const isResetPasswordPage = location.startsWith("/reset-password");
  if (isAuthenticated && isAuthPage) {
    return <Redirect to="/" />;
  }
  if (!isAuthenticated && !isAuthPage && !isResetPasswordPage && !isInviteAcceptPage) {
    return <Redirect to="/auth" />;
  }

  const pushPromptEnabled =
    isAuthenticated &&
    (location.startsWith("/health-wall") || location.startsWith("/messenger"));

  if (isFullscreenPage) {
    if (isProfilePage) {
      return (
        <div className="app-viewport">
          <ScrollToTop />
          <main className="app-viewport-content app-viewport-content--scroll">
            <Router />
          </main>
        </div>
      );
    }

    return (
      <div className="app-viewport">
        <ScrollToTop />
        <div className="app-viewport-content">
          <Router />
          <PushNotificationPrompt enabled={pushPromptEnabled} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScrollToTop />
      <main className="flex-1">
        <Router />
      </main>
      {!isAuthPage && !isInviteAcceptPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
          <AppUpdatePrompt />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
