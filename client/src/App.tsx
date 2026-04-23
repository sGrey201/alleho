import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppSidebar } from "@/components/AppSidebar";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Landing from "@/pages/Landing";
import ArticleReader from "@/pages/ArticleReader";
import Terms from "@/pages/Terms";
import Oferta from "@/pages/Oferta";
import Subscribe from "@/pages/Subscribe";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFail from "@/pages/PaymentFail";
import AuthPage from "@/pages/AuthPage";
import InviteAccept from "@/pages/InviteAccept";
import ResetPassword from "@/pages/ResetPassword";
import AdminHome from "@/pages/admin/AdminHome";
import AdminArticles from "@/pages/admin/AdminArticles";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminTags from "@/pages/admin/AdminTags";
import About from "@/pages/About";
import AllRemedies from "@/pages/AllRemedies";
import AllSituations from "@/pages/AllSituations";
import MyPatients from "@/pages/MyPatients";
import HealthWall from "@/pages/HealthWall";
import Messenger from "@/pages/Messenger";
import Profile from "@/pages/Profile";

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
      <Route path="/portraits" component={Home} />
      <Route path="/article/">{() => <Redirect to="/portraits" />}</Route>
      <Route path="/article/:slug" component={ArticleReader} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/invite/accept" component={InviteAccept} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/terms" component={Terms} />
      <Route path="/oferta" component={Oferta} />
      <Route path="/about" component={About} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/remedies" component={AllRemedies} />
      <Route path="/situations" component={AllSituations} />
      <Route path="/my-patients" component={MyPatients} />
      <Route path="/health-wall" component={HealthWall} />
      <Route path="/health-wall/chat/:userId" component={HealthWall} />
      <Route path="/health-wall/:patientUserId" component={HealthWall} />
      <Route path="/messenger" component={Messenger} />
      <Route path="/messenger/group/:conversationId" component={Messenger} />
      <Route path="/messenger/channel/:conversationId" component={Messenger} />
      <Route path="/messenger/group/:conversationId/settings" component={Messenger} />
      <Route path="/messenger/channel/:conversationId/settings" component={Messenger} />
      <Route path="/profile/:userId" component={Profile} />
      <Route path="/profile" component={Profile} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/fail" component={PaymentFail} />
      {isAdmin && (
        <>
          <Route path="/admin" component={AdminHome} />
          <Route path="/admin/articles" component={AdminArticles} />
          <Route path="/admin/tags" component={AdminTags} />
          <Route path="/admin/subscriptions" component={AdminSubscriptions} />
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

function AppContent() {
  const { isAdmin, isLoading, isAuthenticated } = useAuth();
  const [location] = useLocation();

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
  if (!isAuthenticated && !isAuthPage && !isResetPasswordPage && !isInviteAcceptPage) {
    return <Redirect to="/auth" />;
  }

  if (isAdmin && location.startsWith('/admin')) {
    const style = {
      "--sidebar-width": "16rem",
      "--sidebar-width-icon": "3rem",
    };

    return (
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <Router />
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  const isProfilePage = location.startsWith('/profile');
  const isFullscreenPage =
    location.startsWith('/health-wall') ||
    location.startsWith('/messenger') ||
    isProfilePage;

  if (isFullscreenPage) {
    if (isProfilePage) {
      return (
        <div className="h-screen bg-background flex flex-col">
          <ScrollToTop />
          <main className="flex-1 overflow-y-auto">
            <Router />
          </main>
        </div>
      );
    }

    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <ScrollToTop />
        <Router />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        <Router />
      </main>
      <Footer />
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
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
