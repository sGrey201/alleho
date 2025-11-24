import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Users, Globe } from 'lucide-react';
import { t } from '@/lib/i18n';

export default function Landing() {

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl mb-6">
            {t.welcomeTitle}
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground mb-12">
            {t.welcomeSubtitle}
          </p>
          <div className="flex justify-center gap-4">
            <Button 
              size="lg" 
              className="text-base px-8" 
              onClick={() => window.location.href = `/api/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
              data-testid="button-login"
            >
              {t.loginToStart}
            </Button>
          </div>
        </div>

        <div className="mt-20">
          <h2 className="text-center text-3xl font-bold text-foreground mb-12">
            {t.features}
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-2 hover-elevate">
              <CardContent className="p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  {t.feature1Title}
                </h3>
                <p className="text-muted-foreground">
                  {t.feature1Description}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover-elevate">
              <CardContent className="p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  {t.feature2Title}
                </h3>
                <p className="text-muted-foreground">
                  {t.feature2Description}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover-elevate">
              <CardContent className="p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Globe className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  {t.feature3Title}
                </h3>
                <p className="text-muted-foreground">
                  {t.feature3Description}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
