import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { useLanguage } from '@/context/LanguageContext';
import { ArticleCard } from '@/components/ArticleCard';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleBrowse() {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter(article => {
      if (!searchQuery) return true;
      
      const title = article[`title${language.charAt(0).toUpperCase() + language.slice(1)}` as 'titleRu' | 'titleDe' | 'titleEn'].toLowerCase();
      const content = article[`content${language.charAt(0).toUpperCase() + language.slice(1)}` as 'contentRu' | 'contentDe' | 'contentEn'].toLowerCase();
      const searchLower = searchQuery.toLowerCase();
      
      const matchesTitle = title.includes(searchLower);
      const matchesContent = content.includes(searchLower);
      const matchesTags = article.tags.some(tag => tag.name.toLowerCase().includes(searchLower));
      
      return matchesTitle || matchesContent || matchesTags;
    });
  }, [articles, searchQuery, language]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-6">
        <div className="relative flex items-center">
          {!searchQuery && (
            <Search className="absolute left-3 h-5 w-5 text-muted-foreground pointer-events-none" />
          )}
          <Input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`h-12 text-base ${searchQuery ? 'pl-4 pr-12' : 'pl-10 pr-4'}`}
            data-testid="input-search"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 h-10 w-10"
              onClick={() => setSearchQuery('')}
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {filteredArticles.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">
              {searchQuery ? t('noResults') : t('noArticles')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map(article => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
