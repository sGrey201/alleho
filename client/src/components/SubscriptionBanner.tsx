import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, CheckCircle2 } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';

export function SubscriptionBanner() {
  const { user, hasActiveSubscription } = useAuth();
  const { t } = useLanguage();

  if (!user || !user.subscriptionExpiresAt) return null;

  const expiresAt = new Date(user.subscriptionExpiresAt);
  const now = new Date();
  const daysRemaining = differenceInDays(expiresAt, now);

  if (expiresAt < now) {
    return (
      <Alert variant="destructive" className="border-2">
        <Clock className="h-4 w-4" />
        <AlertDescription className="font-medium" data-testid="text-subscription-expired">
          {t('subscriptionExpired')}. {t('contactAdmin')}
        </AlertDescription>
      </Alert>
    );
  }

  if (daysRemaining <= 7) {
    return (
      <Alert className="border-2 border-accent bg-accent/10">
        <Clock className="h-4 w-4 text-accent" />
        <AlertDescription className="font-medium" data-testid="text-trial-active">
          {t('trialActive')}: {daysRemaining} {t('daysRemaining')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-2 border-success bg-success/10">
      <CheckCircle2 className="h-4 w-4 text-success" />
      <AlertDescription className="font-medium" data-testid="text-subscription-active">
        {t('subscriptionActive')} {format(expiresAt, 'MMM d, yyyy')}
      </AlertDescription>
    </Alert>
  );
}
