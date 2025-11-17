import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Article, Tag } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Calendar, Lock } from 'lucide-react';
import { format } from 'date-fns';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleReader() {
  const [, params] = useRoute('/article/:slug');
  const { hasActiveSubscription, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: article, isLoading } = useQuery<ArticleWithTags>({
    queryKey: ['/api/articles/slug', params?.slug],
    enabled: !!params?.slug,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: t.unauthorized,
        description: t.unauthorizedDescription,
        variant: 'destructive',
      });
      setTimeout(() => {
        window.location.href = '/api/login';
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);


  if (isLoading || authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">{t.articleNotFound}</p>
        </div>
      </div>
    );
  }

  const wordCount = article.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);
  
  const previewContent = article.content.substring(0, 1000);
  const isContentLocked = !article.isFree && !hasActiveSubscription && article.content.length > 1000;

  const formattedTags = article.tags.map(tag => {
    if (tag.category === 'remedy') {
      return tag.name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    } else {
      return tag.name.toLowerCase();
    }
  });
  
  const joined = formattedTags.join(', ');
  const title = joined.charAt(0).toUpperCase() + joined.slice(1);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <article className="prose prose-lg max-w-none">
        <div className="mb-8 not-prose">
          <h1 className="mb-6 text-3xl md:text-4xl font-bold text-foreground leading-tight font-serif" data-testid="text-article-title">
            {title}
          </h1>
        </div>

        <div>
          <div
            className="font-serif text-xl leading-[1.8] text-foreground"
            style={{ whiteSpace: 'pre-wrap' }}
            data-testid="text-article-content"
          >
            {hasActiveSubscription || article.isFree ? article.content : previewContent}
          </div>

          {isContentLocked && (
            <div className="mt-12">
              <Card className="border-2 shadow-lg">
                <CardContent className="p-8">
                  <div className="mb-6 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Lock className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <h3 className="mb-3 text-3xl font-bold text-foreground text-center">
                    {t.upgradePromptTitle}
                  </h3>
                  <p className="mb-6 text-lg text-muted-foreground text-center">
                    {t.upgradePromptDescription}
                  </p>
                  
                  <div className="mb-8 space-y-3">
                    <p className="font-semibold text-foreground text-center">{t.subscriptionBenefits}</p>
                    <ul className="space-y-2 max-w-md mx-auto">
                      <li className="flex items-start gap-3">
                        <span className="text-primary mt-1">✓</span>
                        <span className="text-foreground">{t.benefitFullAccess}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-primary mt-1">✓</span>
                        <span className="text-foreground">{t.benefitNewContent}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-primary mt-1">✓</span>
                        <span className="text-foreground">{t.benefitExpertKnowledge}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="text-center">
                    <Button 
                      size="lg"
                      onClick={() => window.location.href = '/admin/subscriptions'}
                      data-testid="button-get-subscription"
                    >
                      {t.getSubscription}
                    </Button>
                    <p className="mt-4 text-sm text-muted-foreground">
                      {t.contactAdmin}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={tag.category === 'remedy' ? 'default' : 'secondary'}
              className="text-sm font-medium"
              data-testid={`badge-article-tag-${tag.slug}`}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      </article>
    </div>
  );
}
