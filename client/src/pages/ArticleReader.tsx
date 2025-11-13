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
  const [, params] = useRoute('/article/:id');
  const { hasActiveSubscription, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: article, isLoading } = useQuery<ArticleWithTags>({
    queryKey: ['/api/articles', params?.id],
    enabled: !!params?.id,
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
  const isContentLocked = !hasActiveSubscription && article.content.length > 1000;

  const tagNames = article.tags.map(tag => tag.name).join(', ');
  const title = tagNames.charAt(0).toUpperCase() + tagNames.slice(1).toLowerCase();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <article className="prose prose-lg max-w-none">
        <div className="mb-8 not-prose">
          <h1 className="mb-6 text-4xl font-bold text-foreground leading-tight" data-testid="text-article-title">
            {title}
          </h1>
          
          <div className="mb-6 flex flex-wrap gap-2">
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
        </div>

        <div className="relative">
          <div
            className={`font-serif text-lg leading-relaxed text-foreground ${
              isContentLocked ? 'line-clamp-[20]' : ''
            }`}
            style={{ whiteSpace: 'pre-wrap' }}
            data-testid="text-article-content"
          >
            {hasActiveSubscription ? article.content : previewContent}
          </div>

          {isContentLocked && (
            <div className="absolute inset-x-0 bottom-0 h-96 bg-gradient-to-t from-background via-background/95 to-transparent flex items-end justify-center pb-12">
              <Card className="max-w-md border-2 shadow-xl">
                <CardContent className="p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                      <Lock className="h-8 w-8 text-accent" />
                    </div>
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-foreground">
                    {t.upgradePromptTitle}
                  </h3>
                  <p className="mb-6 text-muted-foreground">
                    {t.upgradePromptDescription}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.contactAdmin}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
