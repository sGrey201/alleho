import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, CreditCard, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function Subscribe() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingRenewal, setLoadingRenewal] = useState(false);

  const hasActiveSubscription = user?.subscriptionExpiresAt 
    ? new Date(user.subscriptionExpiresAt) > new Date()
    : false;

  const handlePayment = async (subscriptionType: 'initial' | 'renewal') => {
    if (!user) {
      setLocation('/');
      return;
    }

    const setLoading = subscriptionType === 'initial' ? setLoadingInitial : setLoadingRenewal;
    setLoading(true);

    try {
      const response = await apiRequest('POST', '/api/payment/create', { subscriptionType });
      const data = await response.json();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        throw new Error('No payment URL received');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось создать платеж',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

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

        {!user ? (
          <div className="text-center p-6 border rounded-lg bg-muted/50 max-w-md mx-auto">
            <p className="text-muted-foreground mb-4">
              Войдите, чтобы оформить подписку
            </p>
            <Button asChild data-testid="button-login">
              <a href="/api/login?returnTo=/subscribe">Войти</a>
            </Button>
          </div>
        ) : (
          <div className="flex justify-center mb-12">
            {!hasActiveSubscription ? (
              <Card className="max-w-md w-full">
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
                <CardFooter>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handlePayment('initial')}
                    disabled={loadingInitial || loadingRenewal}
                    data-testid="button-payment-initial"
                  >
                    {loadingInitial ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Переход к оплате...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Оформить подписку
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <Card className="max-w-md w-full">
                <CardHeader>
                  <CardTitle className="text-2xl">{t.renewalSubscriptionTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-3">
                    <div className="text-4xl font-bold text-primary">
                      {hasActiveSubscription ? '1000' : '2000'} ₽
                    </div>
                    {hasActiveSubscription && (
                      <div className="text-lg text-muted-foreground line-through">2000 ₽</div>
                    )}
                  </div>
                  <div className="text-muted-foreground">{t.subscriptionDuration}</div>
                  {hasActiveSubscription && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">🎉 Скидка 50% если продлить до окончания!</p>
                    </div>
                  )}
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
                <CardFooter>
                  <Button
                    className="w-full"
                    size="lg"
                    variant="secondary"
                    onClick={() => handlePayment('renewal')}
                    disabled={loadingInitial || loadingRenewal}
                    data-testid="button-payment-renewal"
                  >
                    {loadingRenewal ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Переход к оплате...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Продлить подписку
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        )}

        {user && (
          <div className="space-y-4">
            {hasActiveSubscription && (
              <div className="p-4 border border-green-500/20 bg-green-500/10 rounded-lg text-center">
                <p className="text-green-700 dark:text-green-400 font-medium">
                  Активная подписка до:{' '}
                  {new Date(user.subscriptionExpiresAt!).toLocaleDateString('ru-RU')}
                </p>
              </div>
            )}
            <div className="text-center text-sm text-muted-foreground">
              <p>{t.loggedInAs}: {user.email}</p>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              <p>
                Нажимая кнопку "Оформить подписку" или "Продлить подписку", вы соглашаетесь с{' '}
                <a href="/oferta" target="_blank" className="underline hover:text-foreground">
                  условиями оферты
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
