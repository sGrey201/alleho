import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { ArticleCard } from '@/components/ArticleCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleBrowse() {
  const { t, language } = useLanguage();
  const { hasActiveSubscription } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const allTags = useMemo(() => {
    if (!articles) return [];
    const tagMap = new Map<string, Tag>();
    articles.forEach(article => {
      article.tags.forEach(tag => tagMap.set(tag.id, tag));
    });
    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [articles]);

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter(article => {
      const title = article[`title${language.charAt(0).toUpperCase() + language.slice(1)}` as 'titleRu' | 'titleDe' | 'titleEn'].toLowerCase();
      const content = article[`content${language.charAt(0).toUpperCase() + language.slice(1)}` as 'contentRu' | 'contentDe' | 'contentEn'].toLowerCase();
      const searchLower = searchQuery.toLowerCase();
      
      const matchesSearch = !searchQuery || title.includes(searchLower) || content.includes(searchLower);
      const matchesTags = selectedTags.length === 0 || selectedTags.some(tagId => article.tags.some(t => t.id === tagId));
      
      return matchesSearch && matchesTags;
    });
  }, [articles, searchQuery, selectedTags, language]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

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
      <div className="mb-8">
        <p className="text-lg text-muted-foreground">
          {hasActiveSubscription
            ? t('feature1Description')
            : t('previewOnly')}
        </p>
      </div>

      <div className="mb-8 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-12 text-base"
            data-testid="input-search"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
              onClick={() => setSearchQuery('')}
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {allTags.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">{t('tags')}</h3>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant={selectedTags.includes(tag.id) ? 'default' : 'outline'}
                  className="cursor-pointer hover-elevate active-elevate-2 text-sm px-3 py-1"
                  onClick={() => toggleTag(tag.id)}
                  data-testid={`filter-tag-${tag.slug}`}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTags([])}
                className="mt-3"
                data-testid="button-clear-filters"
              >
                <X className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {filteredArticles.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">
              {searchQuery || selectedTags.length > 0 ? t('noResults') : t('noArticles')}
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
