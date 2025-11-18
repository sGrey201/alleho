import { useAuth } from '@/hooks/useAuth';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, CreditCard } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Subscribe() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[80vh] py-12 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4 font-serif">
            {t.subscribePageTitle}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t.subscribePageDescription}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{t.firstTimeSubscription}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold text-primary">2000 ₽</div>
              <div className="text-muted-foreground">{t.subscriptionDuration}</div>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{t.benefitFullAccess}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{t.benefitNewContent}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{t.benefitExpertKnowledge}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{t.renewalSubscriptionTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold text-primary">1000 ₽</div>
              <div className="text-muted-foreground">{t.subscriptionDuration}</div>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{t.renewalBenefit}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{t.continuedAccess}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {user && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>{t.loggedInAs}: {user.email}</p>
          </div>
        )}
      </div>
    </div>
  );
}
