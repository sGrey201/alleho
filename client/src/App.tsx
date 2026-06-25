import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useIsRestoring } from "@tanstack/react-query";
import { offlinePersistOptions } from "@/lib/queryPersister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import NotFound from "@/pages/not-found";
import Terms from "@/pages/Terms";
import Oferta from "@/pages/Oferta";
import Subscribe from "@/pages/Subscribe";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFail from "@/pages/PaymentFail";
import AuthPage from "@/pages/AuthPage";
import RegisterPage from "@/pages/RegisterPage";
import InviteAccept from "@/pages/InviteAccept";
import RoleOnboarding from "@/pages/RoleOnboarding";
import ResetPassword from "@/pages/ResetPassword";
import About from "@/pages/About";
import Messenger from "@/pages/Messenger";
import QuestionnaireTemplates from "@/pages/QuestionnaireTemplates";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOfflineRevalidation } from "@/hooks/useOfflineRevalidation";
import { t } from "@/lib/i18n";
import { resetAppShellThemeForClassicLayout } from "@/hooks/useAppShellTheme";
import { useVisualViewportSize } from "@/hooks/useVisualViewportSize";
import { isGuestForbiddenMessengerPath, isGuestMessengerPath } from "@/lib/guestMessengerPaths";
import { peekAuthReturnTo, readAuthReturnFromQuery, saveAuthReturnTo } from "@/lib/authReturnTo";

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
      <Route path="/"><Redirect to="/messenger" /></Route>
      <Route path="/auth/register" component={RegisterPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/invite/accept" component={InviteAccept} />
      <Route path="/onboarding/role" component={RoleOnboarding} />
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
      <Route path="/messenger/profile/:userId" component={Messenger} />
      <Route path="/messenger/profile" component={Messenger} />
      <Route path="/profile/:userId">{(params) => <Redirect to={`/messenger/profile/${params.userId}`} />}</Route>
      <Route path="/profile"><Redirect to="/messenger/profile" /></Route>
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

/** Locks document scroll and enables safe-area insets on notched phones (Messenger, Questionnaires). */
function useImmersiveViewport(enabled: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle("app-immersive", enabled);
    return () => document.documentElement.classList.remove("app-immersive");
  }, [enabled]);
}

function AppContent() {
  const isRestoring = useIsRestoring();
  const { isLoading, isAuthenticated, requiresRoleSelection } = useAuth();
  const [location] = useLocation();

  const isQuestionnairesPage = location.startsWith("/questionnaires");
  const isFullscreenPage =
    location.startsWith("/messenger") ||
    isQuestionnairesPage;

  useImmersiveViewport(isFullscreenPage);
  useVisualViewportSize(isFullscreenPage);

  useEffect(() => {
    if (!isFullscreenPage) {
      resetAppShellThemeForClassicLayout();
    }
  }, [isFullscreenPage]);

  useOfflineRevalidation(
    !isRestoring && isAuthenticated && location.startsWith("/messenger")
  );

  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

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

  const isAuthPage = location === "/auth" || location.startsWith("/auth/register");
  const isInviteAcceptPage = location.startsWith("/invite/accept");
  const isRoleOnboardingPage = location.startsWith("/onboarding/role");
  const isResetPasswordPage = location.startsWith("/reset-password");
  const guestMessengerBlocked = !isAuthenticated && isGuestForbiddenMessengerPath(location);

  if (guestMessengerBlocked) {
    return <Redirect to="/messenger" />;
  }

  if (isAuthenticated && requiresRoleSelection && !isRoleOnboardingPage && !isInviteAcceptPage) {
    const returnTo = readAuthReturnFromQuery() ?? peekAuthReturnTo();
    if (returnTo && isGuestMessengerPath(returnTo)) {
      saveAuthReturnTo(returnTo);
    }
    const rolePath = returnTo
      ? `/onboarding/role?return=${encodeURIComponent(returnTo)}`
      : "/onboarding/role";
    return <Redirect to={rolePath} />;
  }
  if (isAuthenticated && isAuthPage) {
    const returnTo = readAuthReturnFromQuery() ?? peekAuthReturnTo();
    return (
      <Redirect
        to={
          requiresRoleSelection
            ? returnTo
              ? `/onboarding/role?return=${encodeURIComponent(returnTo)}`
              : "/onboarding/role"
            : returnTo ?? "/messenger"
        }
      />
    );
  }
  // Guests may browse /messenger without signing in.
  if (
    !isAuthenticated &&
    !isAuthPage &&
    !isResetPasswordPage &&
    !isInviteAcceptPage &&
    !isGuestMessengerPath(location)
  ) {
    return <Redirect to="/auth" />;
  }

  const pushPromptEnabled =
    isAuthenticated &&
    (location.startsWith("/health-wall") || location.startsWith("/messenger"));

  if (isFullscreenPage) {
    return (
      <div className="app-viewport flex-1 min-h-0">
        <OfflineIndicator />
        <ScrollToTop />
        <div className="app-viewport-content">
          <div className="app-viewport-router">
            <Router />
          </div>
          <PushNotificationPrompt enabled={pushPromptEnabled} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OfflineIndicator />
      <ScrollToTop />
      <main className="flex-1">
        <Router />
      </main>
      {!isAuthPage && !isInviteAcceptPage && !isRoleOnboardingPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <HelmetProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={offlinePersistOptions}>
        <TooltipProvider>
          <div className="app-root-shell">
            <AppContent />
            <Toaster />
            <AppUpdatePrompt />
          </div>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
