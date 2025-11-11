import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/context/LanguageContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import ArticleReader from "@/pages/ArticleReader";
import AdminHome from "@/pages/admin/AdminHome";
import AdminArticles from "@/pages/admin/AdminArticles";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";

function Router() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Landing />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/article/:id" component={ArticleReader} />
      {isAdmin && (
        <>
          <Route path="/admin" component={AdminHome} />
          <Route path="/admin/articles" component={AdminArticles} />
          <Route path="/admin/subscriptions" component={AdminSubscriptions} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

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

  if (!isAuthenticated) {
    return <Router />;
  }

  if (isAdmin && window.location.pathname.startsWith('/admin')) {
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
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Router />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AppContent />
          <Toaster />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
