import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { ArticleCard } from '@/components/ArticleCard';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleBrowse() {
  const [remedyInput, setRemedyInput] = useState('');
  const [situationInput, setSituationInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [showRemedySuggestions, setShowRemedySuggestions] = useState(false);
  const [showSituationSuggestions, setShowSituationSuggestions] = useState(false);

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const suggestedRemedyTags = useMemo(() => {
    if (!allTags || !remedyInput) return [];
    
    const searchLower = remedyInput.toLowerCase();
    return allTags
      .filter(tag => tag.category === 'remedy' && tag.name.toLowerCase().startsWith(searchLower))
      .slice(0, 10);
  }, [allTags, remedyInput]);

  const suggestedSituationTags = useMemo(() => {
    if (!allTags || !situationInput) return [];
    
    const searchLower = situationInput.toLowerCase();
    return allTags
      .filter(tag => tag.category === 'situation' && tag.name.toLowerCase().startsWith(searchLower))
      .slice(0, 10);
  }, [allTags, situationInput]);

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter(article => {
      if (!appliedQuery) return true;
      
      const title = article.title.toLowerCase();
      const content = article.content.toLowerCase();
      const searchLower = appliedQuery.toLowerCase();
      
      const matchesTitle = title.includes(searchLower);
      const matchesContent = content.includes(searchLower);
      const matchesTags = article.tags.some(tag => tag.name.toLowerCase().includes(searchLower));
      
      return matchesTitle || matchesContent || matchesTags;
    });
  }, [articles, appliedQuery]);

  const handleRemedySearch = () => {
    setAppliedQuery(remedyInput);
    setShowRemedySuggestions(false);
  };

  const handleSituationSearch = () => {
    setAppliedQuery(situationInput);
    setShowSituationSuggestions(false);
  };

  const handleRemedyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRemedySearch();
    }
  };

  const handleSituationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSituationSearch();
    }
  };

  const handleRemedyTagClick = (tagName: string) => {
    setRemedyInput(tagName);
    setAppliedQuery(tagName);
    setShowRemedySuggestions(false);
  };

  const handleSituationTagClick = (tagName: string) => {
    setSituationInput(tagName);
    setAppliedQuery(tagName);
    setShowSituationSuggestions(false);
  };

  const handleClearRemedy = () => {
    setRemedyInput('');
    setAppliedQuery('');
    setShowRemedySuggestions(false);
  };

  const handleClearSituation = () => {
    setSituationInput('');
    setAppliedQuery('');
    setShowSituationSuggestions(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-4">
        <Popover open={showRemedySuggestions && suggestedRemedyTags.length > 0} onOpenChange={setShowRemedySuggestions}>
          <PopoverTrigger asChild>
            <div className="relative flex items-center">
              {!remedyInput && (
                <Search className="absolute left-3 h-5 w-5 text-muted-foreground pointer-events-none" />
              )}
              <Input
                type="text"
                placeholder={t.searchByRemedy}
                value={remedyInput}
                onChange={(e) => {
                  setRemedyInput(e.target.value);
                  setShowRemedySuggestions(e.target.value.length > 0);
                }}
                onKeyDown={handleRemedyKeyDown}
                onFocus={() => setShowRemedySuggestions(remedyInput.length > 0)}
                className={`h-12 text-base ${remedyInput ? 'pl-4 pr-12' : 'pl-10 pr-4'}`}
                data-testid="input-search-remedy"
              />
              {remedyInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1"
                  onClick={handleClearRemedy}
                  data-testid="button-clear-remedy"
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
            <div className="text-xs text-muted-foreground mb-2 px-2">{t.remedies}</div>
            <div className="flex flex-wrap gap-2">
              {suggestedRemedyTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant="default"
                  className="cursor-pointer"
                  onClick={() => handleRemedyTagClick(tag.name)}
                  data-testid={`badge-remedy-${tag.id}`}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={showSituationSuggestions && suggestedSituationTags.length > 0} onOpenChange={setShowSituationSuggestions}>
          <PopoverTrigger asChild>
            <div className="relative flex items-center">
              {!situationInput && (
                <Search className="absolute left-3 h-5 w-5 text-muted-foreground pointer-events-none" />
              )}
              <Input
                type="text"
                placeholder={t.searchBySituation}
                value={situationInput}
                onChange={(e) => {
                  setSituationInput(e.target.value);
                  setShowSituationSuggestions(e.target.value.length > 0);
                }}
                onKeyDown={handleSituationKeyDown}
                onFocus={() => setShowSituationSuggestions(situationInput.length > 0)}
                className={`h-12 text-base ${situationInput ? 'pl-4 pr-12' : 'pl-10 pr-4'}`}
                data-testid="input-search-situation"
              />
              {situationInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1"
                  onClick={handleClearSituation}
                  data-testid="button-clear-situation"
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
            <div className="text-xs text-muted-foreground mb-2 px-2">{t.situations}</div>
            <div className="flex flex-wrap gap-2">
              {suggestedSituationTags.map(tag => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => handleSituationTagClick(tag.name)}
                  data-testid={`badge-situation-${tag.id}`}
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
              {appliedQuery ? t.noResults : t.noArticles}
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
