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

        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">{t.howToSubscribe}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="prose prose-lg max-w-none">
              <p className="text-foreground text-lg mb-4">
                {t.paymentInstructions}
              </p>
              
              <div className="bg-muted p-6 rounded-lg space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{t.contactDetails}</h3>
                  <div className="space-y-2 text-foreground">
                    <p>
                      <strong>Telegram:</strong>{' '}
                      <a 
                        href="https://t.me/abaevz" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover-elevate active-elevate-2 underline"
                      >
                        @abaevz
                      </a>
                    </p>
                    <p>
                      <strong>Email:</strong>{' '}
                      <a 
                        href="mailto:contact@materiamedica.ru" 
                        className="text-primary hover-elevate active-elevate-2 underline"
                      >
                        contact@materiamedica.ru
                      </a>
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">{t.paymentMethods}</h3>
                  <p className="text-foreground">{t.availablePaymentMethods}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center pt-4">
              <Button
                size="lg"
                onClick={() => window.open('https://t.me/abaevz', '_blank')}
                data-testid="button-contact-telegram"
              >
                {t.contactViaTelegram}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLocation('/')}
                data-testid="button-back-to-articles"
              >
                {t.backToArticles}
              </Button>
            </div>
          </CardContent>
        </Card>

        {user && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>{t.loggedInAs}: {user.email}</p>
          </div>
        )}
      </div>
    </div>
  );
}
