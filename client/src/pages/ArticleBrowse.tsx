import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Article, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { ArticleCard } from '@/components/ArticleCard';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';

type ArticleWithTags = Article & { tags: Tag[] };

export default function ArticleBrowse() {
  const [selectedRemedyTagIds, setSelectedRemedyTagIds] = useState<string[]>([]);
  const [selectedSituationTagIds, setSelectedSituationTagIds] = useState<string[]>([]);
  const [remedySearchQuery, setRemedySearchQuery] = useState('');
  const [situationSearchQuery, setSituationSearchQuery] = useState('');
  const [remedyPopoverOpen, setRemedyPopoverOpen] = useState(false);
  const [situationPopoverOpen, setSituationPopoverOpen] = useState(false);

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/articles'],
  });

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const filteredRemedyTags = useMemo(() => {
    if (!allTags) return [];
    
    let tags = allTags.filter(tag => tag.category === 'remedy');
    
    if (!remedySearchQuery.trim()) return tags;
    const query = remedySearchQuery.toLowerCase().trim();
    return tags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      const tagSlugLower = tag.slug.toLowerCase();
      
      if (tagNameLower.includes(query) || tagSlugLower.includes(query)) {
        return true;
      }
      
      const nameWords = tagNameLower.split(/\s+/);
      const slugWords = tagSlugLower.split(/[-_]/);
      return nameWords.some(word => word.startsWith(query)) || 
             slugWords.some(word => word.startsWith(query));
    });
  }, [allTags, remedySearchQuery]);

  const filteredSituationTags = useMemo(() => {
    if (!allTags) return [];
    
    let tags = allTags.filter(tag => tag.category === 'situation');
    
    if (!situationSearchQuery.trim()) return tags;
    const query = situationSearchQuery.toLowerCase().trim();
    return tags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      const tagSlugLower = tag.slug.toLowerCase();
      
      if (tagNameLower.includes(query) || tagSlugLower.includes(query)) {
        return true;
      }
      
      const nameWords = tagNameLower.split(/\s+/);
      const slugWords = tagSlugLower.split(/[-_]/);
      return nameWords.some(word => word.startsWith(query)) || 
             slugWords.some(word => word.startsWith(query));
    });
  }, [allTags, situationSearchQuery]);

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

  const addRemedyTag = (tagId: string) => {
    if (!selectedRemedyTagIds.includes(tagId)) {
      setSelectedRemedyTagIds([...selectedRemedyTagIds, tagId]);
    }
    setRemedyPopoverOpen(false);
    setRemedySearchQuery('');
  };

  const addSituationTag = (tagId: string) => {
    if (!selectedSituationTagIds.includes(tagId)) {
      setSelectedSituationTagIds([...selectedSituationTagIds, tagId]);
    }
    setSituationPopoverOpen(false);
    setSituationSearchQuery('');
  };

  const removeRemedyTag = (tagId: string) => {
    setSelectedRemedyTagIds(selectedRemedyTagIds.filter(id => id !== tagId));
  };

  const removeSituationTag = (tagId: string) => {
    setSelectedSituationTagIds(selectedSituationTagIds.filter(id => id !== tagId));
  };

  const handleRemedyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredRemedyTags.length > 0) {
        const firstTag = filteredRemedyTags[0];
        if (!selectedRemedyTagIds.includes(firstTag.id)) {
          addRemedyTag(firstTag.id);
        }
      }
    }
  };

  const handleSituationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSituationTags.length > 0) {
        const firstTag = filteredSituationTags[0];
        if (!selectedSituationTagIds.includes(firstTag.id)) {
          addSituationTag(firstTag.id);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-4">
        {/* Препараты */}
        <div>
          <div className="text-sm font-medium mb-2">{t.remedies}</div>
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
          </div>
          <Popover open={remedyPopoverOpen} onOpenChange={setRemedyPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                data-testid="button-select-remedies"
              >
                {t.selectTags}
                <Plus className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false} onKeyDown={handleRemedyKeyDown}>
                <CommandInput 
                  placeholder={t.searchByRemedy} 
                  value={remedySearchQuery}
                  onValueChange={setRemedySearchQuery}
                />
                <CommandList className="max-h-96 overflow-auto">
                  {filteredRemedyTags.length === 0 ? (
                    <CommandEmpty>{t.noTagsFound}</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {filteredRemedyTags.map((tag) => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => {
                            if (!selectedRemedyTagIds.includes(tag.id)) {
                              addRemedyTag(tag.id);
                            }
                          }}
                          disabled={selectedRemedyTagIds.includes(tag.id)}
                          data-testid={`remedy-option-${tag.slug}`}
                        >
                          {tag.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Ситуации */}
        <div>
          <div className="text-sm font-medium mb-2">{t.situations}</div>
          <div className="flex flex-wrap gap-2 mb-2">
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
          </div>
          <Popover open={situationPopoverOpen} onOpenChange={setSituationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                data-testid="button-select-situations"
              >
                {t.selectTags}
                <Plus className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false} onKeyDown={handleSituationKeyDown}>
                <CommandInput 
                  placeholder={t.searchBySituation} 
                  value={situationSearchQuery}
                  onValueChange={setSituationSearchQuery}
                />
                <CommandList className="max-h-96 overflow-auto">
                  {filteredSituationTags.length === 0 ? (
                    <CommandEmpty>{t.noTagsFound}</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {filteredSituationTags.map((tag) => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => {
                            if (!selectedSituationTagIds.includes(tag.id)) {
                              addSituationTag(tag.id);
                            }
                          }}
                          disabled={selectedSituationTagIds.includes(tag.id)}
                          data-testid={`situation-option-${tag.slug}`}
                        >
                          {tag.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map(article => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
