import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import { queryClient } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Settings, LogOut, Plus, Check, AlertTriangle, X, ClipboardList, Users } from 'lucide-react';
import { ArticleDialog } from '@/components/ArticleDialog';
import { format } from 'date-fns';

type SubscriptionStatus = 'active' | 'expiring' | 'expired';

export function Header() {
  const { user, isAuthenticated, isAdmin, hasActiveSubscription } = useAuth();
  const [location] = useLocation();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getSubscriptionStatus = (expiresAt?: string | Date | null): { status: SubscriptionStatus; daysLeft: number } => {
    if (!expiresAt) return { status: 'expired', daysLeft: 0 };
    
    const now = new Date();
    const expirationDate = new Date(expiresAt);
    const daysLeft = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) return { status: 'expired', daysLeft: 0 };
    if (daysLeft <= 30) return { status: 'expiring', daysLeft };
    return { status: 'active', daysLeft };
  };

  const subscriptionInfo = user ? getSubscriptionStatus(user.subscriptionExpiresAt) : { status: 'expired' as SubscriptionStatus, daysLeft: 0 };

  const getStatusColor = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'expiring': return 'text-yellow-600';
      case 'expired': return 'text-red-600';
    }
  };

  const getStatusBgColor = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'expiring': return 'bg-yellow-600';
      case 'expired': return 'bg-red-600';
    }
  };

  const getStatusIcon = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return Check;
      case 'expiring': return AlertTriangle;
      case 'expired': return X;
    }
  };

  const StatusIcon = getStatusIcon(subscriptionInfo.status);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link 
            href="/" 
            className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md px-2 py-1" 
            data-testid="link-home"
            onClick={() => window.dispatchEvent(new CustomEvent('resetFilters'))}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-[18px]">
              M
            </div>
            <span className="text-lg font-bold text-foreground">
              MateriaMedica
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <ArticleDialog
              trigger={
                <Button variant="default" size="sm" data-testid="button-create-article">
                  <Plus className="h-4 w-4 mr-2" />
                  {t.createArticle}
                </Button>
              }
            />
          )}
          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full hover-elevate active-elevate-2"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={`${user.firstName || ''} ${user.lastName || ''}`}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span 
                    className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ${getStatusBgColor(subscriptionInfo.status)} ring-2 ring-background`}
                    data-testid={`subscription-indicator-${subscriptionInfo.status}`}
                  >
                    <StatusIcon className="h-2.5 w-2.5 text-white" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={`${user.firstName || ''} ${user.lastName || ''}`}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.email}
                    </p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground leading-none">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/subscribe" className="flex w-full items-center" data-testid="link-subscription">
                    <p className={`text-xs font-medium ${getStatusColor(subscriptionInfo.status)}`}>
                      {user.subscriptionExpiresAt && subscriptionInfo.status !== 'expired'
                        ? `${t.subscriptionUntil} ${format(new Date(user.subscriptionExpiresAt), 'dd.MM.yyyy')}`
                        : t.noSubscription}
                    </p>
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/questionnaire" className="flex w-full items-center" data-testid="link-questionnaire">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        {t.questionnaire}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/my-patients" className="flex w-full items-center" data-testid="link-my-patients">
                        <Users className="mr-2 h-4 w-4" />
                        {t.myPatients}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex w-full items-center" data-testid="link-admin-panel">
                        <Settings className="mr-2 h-4 w-4" />
                        {t.adminPanel}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex w-full items-center text-destructive cursor-pointer"
                  data-testid="link-logout"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                    queryClient.clear();
                    window.location.href = '/';
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild data-testid="button-login">
              <Link href="/auth">
                {t.login}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
