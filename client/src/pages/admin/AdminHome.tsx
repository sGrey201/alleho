import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { FileText, Users, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Article, User } from '@shared/schema';

export default function AdminHome() {
  const { isAdmin } = useAuth();

  const { data: articles } = useQuery<Article[]>({
    queryKey: ['/api/admin/articles'],
    enabled: isAdmin,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin,
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t.adminPanel}</h1>
        <p className="text-muted-foreground mt-1">
          {t.manageArticles} {t.manageSubscriptions.toLowerCase()}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">
              {t.articles}
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{articles?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.allArticles}
            </p>
            <Link href="/admin/articles">
              <Button className="mt-4 w-full" data-testid="link-manage-articles">
                {t.manageArticles}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">
              {t.allUsers}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{users?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.manageSubscriptions}
            </p>
            <Link href="/admin/subscriptions">
              <Button className="mt-4 w-full" data-testid="link-manage-subscriptions">
                {t.manageSubscriptions}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
