import { useAuth } from '@/hooks/useAuth';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import ArticleBrowse from './ArticleBrowse';

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      {user && user.subscriptionExpiresAt && (
        <div className="mx-auto max-w-7xl px-6 py-4">
          <SubscriptionBanner />
        </div>
      )}
      <ArticleBrowse />
    </div>
  );
}
