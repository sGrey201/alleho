import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Article, Tag } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/lib/i18n';
import { formatArticleTitle } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { LikeButton } from '@/components/LikeButton';
import { ShareButton } from '@/components/ShareButton';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleReader() {
  const [, params] = useRoute('/article/:slug');
  const { hasActiveSubscription, isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [params?.slug]);

  const { data: article, isLoading } = useQuery<ArticleWithTags>({
    queryKey: ['/api/articles/slug', params?.slug],
    enabled: !!params?.slug,
  });

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

  const isContentLocked = !article.isFree && (!isAuthenticated || !hasActiveSubscription);

  const title = formatArticleTitle(article.tags);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <article className="prose prose-lg max-w-none">
        <div className="mb-8 not-prose">
          <h1 className="mb-6 text-3xl md:text-4xl font-bold text-foreground leading-tight font-serif line-clamp-2" data-testid="text-article-title">
            {title}
          </h1>
        </div>

        <div className="mb-8">
          <div
            className="prose prose-lg font-serif text-base md:text-lg leading-[1.44] md:leading-[1.6] text-muted-foreground italic border-l-4 border-primary pl-6 py-2"
            dangerouslySetInnerHTML={{ __html: article.preview }}
          />
        </div>

        {isContentLocked ? (
          <>
            <div className="mb-8">
              <div
                className="prose prose-lg font-serif text-lg md:text-xl leading-[1.44] md:leading-[1.6] text-foreground text-justify"
                data-testid="text-article-preview"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            </div>

            <div className="my-12">
              <Card className="border-2 shadow-lg">
                <CardContent className="p-8">
                  <div className="mb-6 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Lock className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-3xl font-bold text-foreground text-center mt-[10px] mb-[10px]">
                    {!isAuthenticated ? t.authRequiredTitle : t.upgradePromptTitle}
                  </h3>
                  {isAuthenticated && (
                    <p className="mb-8 text-lg text-muted-foreground text-center">
                      {t.upgradePromptDescription}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 justify-center">
                    {!isAuthenticated ? (
                      <Button 
                        size="lg"
                        asChild
                        data-testid="button-login"
                      >
                        <Link className="my-2.5" href="/auth">{t.login}</Link>
                      </Button>
                    ) : (
                      <Button 
                        size="lg"
                        onClick={() => window.location.href = '/subscribe'}
                        data-testid="button-get-subscription"
                      >
                        {t.getSubscription}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div>
            <div
              className="prose prose-lg font-serif text-lg md:text-xl leading-[1.44] md:leading-[1.6] text-foreground text-justify"
              data-testid="text-article-content"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
            
            <div className="mt-12 pt-8 border-t not-prose flex items-center gap-4">
              <LikeButton articleId={article.id} variant="full" isFree={article.isFree} />
              <ShareButton articleSlug={article.slug} variant="full" />
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-2 not-prose">
          {article.tags.map((tag) => (
            <Link
              key={tag.id}
              href={tag.category === 'remedy' ? `/?remedies=${tag.slug}` : `/?situations=${tag.slug}`}
            >
              <Badge
                variant={tag.category === 'remedy' ? 'default' : 'secondary'}
                className="text-sm font-medium cursor-pointer"
                data-testid={`badge-article-tag-${tag.slug}`}
              >
                {tag.name}
              </Badge>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
