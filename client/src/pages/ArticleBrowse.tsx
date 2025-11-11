import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { useLanguage } from '@/context/LanguageContext';
import { ArticleCard } from '@/components/ArticleCard';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleBrowse() {
  const { t, language } = useLanguage();
  const [inputValue, setInputValue] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const suggestedTags = useMemo(() => {
    if (!allTags || !inputValue) return [];
    
    const searchLower = inputValue.toLowerCase();
    return allTags
      .filter(tag => tag.name.toLowerCase().startsWith(searchLower))
      .slice(0, 10);
  }, [allTags, inputValue]);

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter(article => {
      if (!appliedQuery) return true;
      
      const title = article[`title${language.charAt(0).toUpperCase() + language.slice(1)}` as 'titleRu' | 'titleDe' | 'titleEn'].toLowerCase();
      const content = article[`content${language.charAt(0).toUpperCase() + language.slice(1)}` as 'contentRu' | 'contentDe' | 'contentEn'].toLowerCase();
      const searchLower = appliedQuery.toLowerCase();
      
      const matchesTitle = title.includes(searchLower);
      const matchesContent = content.includes(searchLower);
      const matchesTags = article.tags.some(tag => tag.name.toLowerCase().includes(searchLower));
      
      return matchesTitle || matchesContent || matchesTags;
    });
  }, [articles, appliedQuery, language]);

  const handleSearch = () => {
    setAppliedQuery(inputValue);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTagClick = (tagName: string) => {
    setInputValue(tagName);
    setAppliedQuery(tagName);
    setShowSuggestions(false);
  };

  const handleClear = () => {
    setInputValue('');
    setAppliedQuery('');
    setShowSuggestions(false);
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
      <div className="mb-8 space-y-6">
        <Popover open={showSuggestions && suggestedTags.length > 0} onOpenChange={setShowSuggestions}>
          <PopoverTrigger asChild>
            <div className="relative flex items-center">
              {!inputValue && (
                <Search className="absolute left-3 h-5 w-5 text-muted-foreground pointer-events-none" />
              )}
              <Input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setShowSuggestions(e.target.value.length > 0);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(inputValue.length > 0)}
                className={`h-12 text-base ${inputValue ? 'pl-4 pr-12' : 'pl-10 pr-4'}`}
                data-testid="input-search"
              />
              {inputValue && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 h-10 w-10"
                  onClick={handleClear}
                  data-testid="button-clear-search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent 
            className="w-[var(--radix-popover-trigger-width)] p-2" 
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="text-xs text-muted-foreground mb-2 px-2">{t('suggestedRemedies') || 'Препараты:'}</div>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="cursor-pointer hover-elevate"
                  onClick={() => handleTagClick(tag.name)}
                  data-testid={`badge-tag-${tag.id}`}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {filteredArticles.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">
              {appliedQuery ? t('noResults') : t('noArticles')}
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
