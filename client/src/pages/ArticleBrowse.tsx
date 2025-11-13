import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { ArticleCard } from '@/components/ArticleCard';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation } from 'wouter';

type ArticleWithTags = Article & { tags: Tag[] };

// Транслитерация русского текста в латиницу для поиска препаратов
function transliterateRuToLatin(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  return text.toLowerCase().split('').map(char => map[char] || char).join('');
}

export default function ArticleBrowse() {
  const [location, setLocation] = useLocation();
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [tagCategoryFilter, setTagCategoryFilter] = useState<'remedy' | 'situation'>('remedy');
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const [selectedRemedyTagIds, setSelectedRemedyTagIds] = useState<string[]>([]);
  const [selectedSituationTagIds, setSelectedSituationTagIds] = useState<string[]>([]);
  const hasInitialized = useRef(false);

  // Инициализируем теги из URL при первой загрузке allTags
  useEffect(() => {
    if (!allTags || hasInitialized.current) return;
    
    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    const remedySlugs = searchParams.get('remedies');
    const situationSlugs = searchParams.get('situations');
    
    const remedyIds: string[] = [];
    const situationIds: string[] = [];
    
    if (remedySlugs) {
      const slugs = remedySlugs.split(',').filter(Boolean);
      remedyIds.push(...allTags
        .filter(tag => slugs.includes(tag.slug) && tag.category === 'remedy')
        .map(tag => tag.id));
    }
    
    if (situationSlugs) {
      const slugs = situationSlugs.split(',').filter(Boolean);
      situationIds.push(...allTags
        .filter(tag => slugs.includes(tag.slug) && tag.category === 'situation')
        .map(tag => tag.id));
    }
    
    setSelectedRemedyTagIds(remedyIds);
    setSelectedSituationTagIds(situationIds);
    hasInitialized.current = true;
  }, [allTags, location]);

  // Обновляем URL при изменении выбранных тегов (только после инициализации)
  useEffect(() => {
    if (!allTags || !hasInitialized.current) return;
    
    // Небольшая задержка чтобы state успел обновиться после инициализации
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams();
      
      if (selectedRemedyTagIds.length > 0) {
        const slugs = allTags
          .filter(tag => selectedRemedyTagIds.includes(tag.id))
          .map(tag => tag.slug)
          .join(',');
        if (slugs) params.set('remedies', slugs);
      }
      
      if (selectedSituationTagIds.length > 0) {
        const slugs = allTags
          .filter(tag => selectedSituationTagIds.includes(tag.id))
          .map(tag => tag.slug)
          .join(',');
        if (slugs) params.set('situations', slugs);
      }
      
      const newUrl = params.toString() ? `/?${params.toString()}` : '/';
      const currentLocation = window.location.pathname + window.location.search;
      
      if (newUrl !== currentLocation) {
        setLocation(newUrl, { replace: true });
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [selectedRemedyTagIds, selectedSituationTagIds, allTags, setLocation]);

  const filteredTags = useMemo(() => {
    if (!allTags) return [];
    
    let tags = allTags.filter(tag => tag.category === tagCategoryFilter);
    
    if (!tagSearchQuery.trim()) return tags;
    const query = tagSearchQuery.toLowerCase().trim();
    
    // Для препаратов также ищем по транслитерации русского текста
    const transliteratedQuery = tagCategoryFilter === 'remedy' ? transliterateRuToLatin(query) : query;
    
    return tags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      const tagSlugLower = tag.slug.toLowerCase();
      
      // Поиск по оригинальному запросу
      if (tagNameLower.includes(query) || tagSlugLower.includes(query)) {
        return true;
      }
      
      // Для препаратов: поиск по транслитерированному запросу
      if (tagCategoryFilter === 'remedy' && transliteratedQuery !== query) {
        if (tagNameLower.includes(transliteratedQuery) || tagSlugLower.includes(transliteratedQuery)) {
          return true;
        }
      }
      
      // Поиск по началу слов
      const nameWords = tagNameLower.split(/\s+/);
      const slugWords = tagSlugLower.split(/[-_]/);
      
      if (nameWords.some(word => word.startsWith(query)) || slugWords.some(word => word.startsWith(query))) {
        return true;
      }
      
      // Для препаратов: поиск по началу слов в транслитерации
      if (tagCategoryFilter === 'remedy' && transliteratedQuery !== query) {
        return nameWords.some(word => word.startsWith(transliteratedQuery)) || 
               slugWords.some(word => word.startsWith(transliteratedQuery));
      }
      
      return false;
    });
  }, [allTags, tagSearchQuery, tagCategoryFilter]);

  const selectedRemedyTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter(tag => selectedRemedyTagIds.includes(tag.id));
  }, [allTags, selectedRemedyTagIds]);

  const selectedSituationTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter(tag => selectedSituationTagIds.includes(tag.id));
  }, [allTags, selectedSituationTagIds]);

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter(article => {
      // Если ничего не выбрано - показываем все статьи
      if (selectedRemedyTagIds.length === 0 && selectedSituationTagIds.length === 0) return true;
      
      // Проверка соответствия препаратам (OR внутри категории)
      let matchesRemedy = true;
      if (selectedRemedyTagIds.length > 0) {
        matchesRemedy = article.tags.some(tag => selectedRemedyTagIds.includes(tag.id));
      }
      
      // Проверка соответствия ситуациям (OR внутри категории)
      let matchesSituation = true;
      if (selectedSituationTagIds.length > 0) {
        matchesSituation = article.tags.some(tag => selectedSituationTagIds.includes(tag.id));
      }
      
      // Логика AND между категориями: (П1 OR П2) AND (С1 OR С2)
      return matchesRemedy && matchesSituation;
    });
  }, [articles, selectedRemedyTagIds, selectedSituationTagIds]);

  const addTag = (tagId: string) => {
    const tag = allTags?.find(t => t.id === tagId);
    if (!tag) return;
    
    if (tag.category === 'remedy' && !selectedRemedyTagIds.includes(tagId)) {
      setSelectedRemedyTagIds([...selectedRemedyTagIds, tagId]);
    } else if (tag.category === 'situation' && !selectedSituationTagIds.includes(tagId)) {
      setSelectedSituationTagIds([...selectedSituationTagIds, tagId]);
    }
    setTagPopoverOpen(false);
    setTagSearchQuery('');
  };

  const removeRemedyTag = (tagId: string) => {
    setSelectedRemedyTagIds(selectedRemedyTagIds.filter(id => id !== tagId));
  };

  const removeSituationTag = (tagId: string) => {
    setSelectedSituationTagIds(selectedSituationTagIds.filter(id => id !== tagId));
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length > 0) {
        const firstTag = filteredTags[0];
        const selectedIds = tagCategoryFilter === 'remedy' ? selectedRemedyTagIds : selectedSituationTagIds;
        if (!selectedIds.includes(firstTag.id)) {
          addTag(firstTag.id);
        }
      }
    }
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

  const hasSelectedTags = selectedRemedyTagIds.length > 0 || selectedSituationTagIds.length > 0;

  const clearAllTags = () => {
    setSelectedRemedyTagIds([]);
    setSelectedSituationTagIds([]);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedRemedyTags.map((tag) => (
            <Badge 
              key={tag.id} 
              variant="default" 
              className="gap-1"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeRemedyTag(tag.id)}
                className="ml-1 hover:text-destructive"
                data-testid={`button-remove-remedy-${tag.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedSituationTags.map((tag) => (
            <Badge 
              key={tag.id} 
              variant="secondary" 
              className="gap-1"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeSituationTag(tag.id)}
                className="ml-1 hover:text-destructive"
                data-testid={`button-remove-situation-${tag.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {hasSelectedTags && (
            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  data-testid="button-add-tag"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Tabs value={tagCategoryFilter} onValueChange={(v) => setTagCategoryFilter(v as 'remedy' | 'situation')}>
                  <div className="border-b px-2 pt-2">
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="remedy" className="text-xs" data-testid="tab-filter-remedies">
                        {t.remedies}
                      </TabsTrigger>
                      <TabsTrigger value="situation" className="text-xs" data-testid="tab-filter-situations">
                        {t.situations}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <Command shouldFilter={false} onKeyDown={handleTagSearchKeyDown}>
                    <CommandInput 
                      placeholder={tagCategoryFilter === 'remedy' ? t.searchByRemedy : t.searchBySituation} 
                      value={tagSearchQuery}
                      onValueChange={setTagSearchQuery}
                    />
                    <CommandList className="max-h-96 overflow-auto">
                      {filteredTags.length === 0 ? (
                        <CommandEmpty>{t.noTagsFound}</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {filteredTags.map((tag) => {
                            const selectedIds = tag.category === 'remedy' ? selectedRemedyTagIds : selectedSituationTagIds;
                            return (
                              <CommandItem
                                key={tag.id}
                                value={tag.name}
                                onSelect={() => {
                                  if (!selectedIds.includes(tag.id)) {
                                    addTag(tag.id);
                                  }
                                }}
                                disabled={selectedIds.includes(tag.id)}
                                data-testid={`tag-option-${tag.slug}`}
                              >
                                {tag.name}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </Tabs>
              </PopoverContent>
            </Popover>
          )}
          {hasSelectedTags && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={clearAllTags}
              data-testid="button-clear-tags"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!hasSelectedTags && (
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                data-testid="button-select-tags"
              >
                {t.search}
                <Plus className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Tabs value={tagCategoryFilter} onValueChange={(v) => setTagCategoryFilter(v as 'remedy' | 'situation')}>
              <div className="border-b px-2 pt-2">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="remedy" className="text-xs" data-testid="tab-filter-remedies">
                    {t.remedies}
                  </TabsTrigger>
                  <TabsTrigger value="situation" className="text-xs" data-testid="tab-filter-situations">
                    {t.situations}
                  </TabsTrigger>
                </TabsList>
              </div>
              <Command shouldFilter={false} onKeyDown={handleTagSearchKeyDown}>
                <CommandInput 
                  placeholder={tagCategoryFilter === 'remedy' ? t.searchByRemedy : t.searchBySituation} 
                  value={tagSearchQuery}
                  onValueChange={setTagSearchQuery}
                />
                <CommandList className="max-h-96 overflow-auto">
                  {filteredTags.length === 0 ? (
                    <CommandEmpty>{t.noTagsFound}</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {filteredTags.map((tag) => {
                        const selectedIds = tag.category === 'remedy' ? selectedRemedyTagIds : selectedSituationTagIds;
                        return (
                          <CommandItem
                            key={tag.id}
                            value={tag.name}
                            onSelect={() => {
                              if (!selectedIds.includes(tag.id)) {
                                addTag(tag.id);
                              }
                            }}
                            disabled={selectedIds.includes(tag.id)}
                            data-testid={`tag-option-${tag.slug}`}
                          >
                            {tag.name}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </Tabs>
          </PopoverContent>
          </Popover>
        )}
      </div>

      {filteredArticles.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-muted-foreground">
              {selectedRemedyTagIds.length > 0 || selectedSituationTagIds.length > 0 ? t.noResults : t.noArticles}
            </p>
          </div>
        </div>
      ) : (
        <div>
          {filteredArticles.map((article, index) => (
            <ArticleCard 
              key={article.id} 
              article={article} 
              isLast={index === filteredArticles.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
