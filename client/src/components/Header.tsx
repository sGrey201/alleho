import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSelector } from './LanguageSelector';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Settings, LogOut } from 'lucide-react';

export function Header() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [location] = useLocation();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/">
            <a className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md px-2 py-1" data-testid="link-home">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
                H
              </div>
              <span className="hidden text-lg font-bold text-foreground sm:inline-block">
                Homeopathy
              </span>
            </a>
          </Link>
          
          {isAuthenticated && (
            <nav className="hidden items-center gap-2 md:flex">
              <Link href="/">
                <a
                  className={`px-3 py-2 text-sm font-medium rounded-md hover-elevate active-elevate-2 ${
                    location === '/' ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  }`}
                  data-testid="link-articles"
                >
                  {t('articles')}
                </a>
              </Link>
              {isAdmin && (
                <Link href="/admin">
                  <a
                    className={`px-3 py-2 text-sm font-medium rounded-md hover-elevate active-elevate-2 ${
                      location.startsWith('/admin') ? 'bg-accent text-accent-foreground' : 'text-foreground'
                    }`}
                    data-testid="link-admin"
                  >
                    {t('admin')}
                  </a>
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSelector />
          
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
                {isAdmin && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <a className="flex w-full items-center" data-testid="link-admin-panel">
                          <Settings className="mr-2 h-4 w-4" />
                          {t('adminPanel')}
                        </a>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <a
                    href="/api/logout"
                    className="flex w-full items-center text-destructive"
                    data-testid="link-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('logout')}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild data-testid="button-login">
              <a href="/api/login">{t('login')}</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
