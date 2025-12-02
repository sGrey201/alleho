import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppSidebar } from "@/components/AppSidebar";
import { SplashScreen } from "@/components/SplashScreen";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import ArticleReader from "@/pages/ArticleReader";
import Terms from "@/pages/Terms";
import Oferta from "@/pages/Oferta";
import Subscribe from "@/pages/Subscribe";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFail from "@/pages/PaymentFail";
import AdminHome from "@/pages/admin/AdminHome";
import AdminArticles from "@/pages/admin/AdminArticles";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminTags from "@/pages/admin/AdminTags";

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
      <Route path="/" component={Home} />
      <Route path="/article/:slug" component={ArticleReader} />
      <Route path="/terms" component={Terms} />
      <Route path="/oferta" component={Oferta} />
      <Route path="/subscribe" component={Subscribe} />
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

function AppContent() {
  const { isAdmin, isLoading } = useAuth();
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SplashScreen>
          <AppContent />
        </SplashScreen>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
