import { useAuth } from '@/hooks/useAuth';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import ArticleBrowse from './ArticleBrowse';

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      {user && user.subscriptionExpiresAt && (
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <SubscriptionBanner />
        </div>
      )}
      <ArticleBrowse />
    </div>
  );
}
