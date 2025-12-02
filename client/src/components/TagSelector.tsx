import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Pill, Activity } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

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

function transliterate(text: string): string {
  const translitMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  return text
    .toLowerCase()
    .split('')
    .map(char => translitMap[char] || char)
    .join('')
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface TagSelectorProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  allowCreate?: boolean;
  placeholder?: string;
}

export function TagSelector({ 
  selectedTagIds, 
  onTagsChange, 
  allowCreate = false,
  placeholder
}: TagSelectorProps) {
  const { toast } = useToast();
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const createTagMutation = useMutation<Tag, Error, { name: string; slug: string; category: 'remedy' | 'situation' }>({
    mutationFn: async (data) => {
      const result = await apiRequest('POST', '/api/admin/tags', data);
      return result as unknown as Tag;
    },
    onSuccess: async (newTag: Tag) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      
      if (newTag?.id && !selectedTagIds.includes(newTag.id)) {
        onTagsChange([...selectedTagIds, newTag.id]);
      }
      
      toast({ title: t.tagSaved });
      setTagSearchQuery('');
    },
  });

  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags;
    
    const query = tagSearchQuery.toLowerCase().trim();
    const transliteratedQuery = transliterateRuToLatin(query);
    
    return allTags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      const tagSlugLower = tag.slug.toLowerCase();
      
      if (tagNameLower.includes(query) || tagSlugLower.includes(query)) {
        return true;
      }
      
      if (tag.category === 'remedy' && transliteratedQuery !== query) {
        if (tagNameLower.includes(transliteratedQuery) || tagSlugLower.includes(transliteratedQuery)) {
          return true;
        }
      }
      
      const nameWords = tagNameLower.split(/\s+/);
      const slugWords = tagSlugLower.split(/[-_]/);
      
      if (nameWords.some(word => word.startsWith(query)) || slugWords.some(word => word.startsWith(query))) {
        return true;
      }
      
      if (tag.category === 'remedy' && transliteratedQuery !== query) {
        return nameWords.some(word => word.startsWith(transliteratedQuery)) || 
               slugWords.some(word => word.startsWith(transliteratedQuery));
      }
      
      return false;
    });
  }, [allTags, tagSearchQuery]);

  const selectedTags = useMemo(() => {
    return selectedTagIds
      .map(id => allTags.find(tag => tag.id === id))
      .filter((tag): tag is Tag => tag !== undefined);
  }, [selectedTagIds, allTags]);

  const addTag = (tagId: string) => {
    if (!selectedTagIds.includes(tagId)) {
      onTagsChange([...selectedTagIds, tagId]);
    }
    setTagPopoverOpen(false);
    setTagSearchQuery('');
  };

  const removeTag = (tagId: string) => {
    onTagsChange(selectedTagIds.filter(id => id !== tagId));
  };

  const clearAllTags = () => {
    onTagsChange([]);
  };

  const handleCreateNewTag = (category: 'remedy' | 'situation') => {
    const trimmedQuery = tagSearchQuery.trim();
    if (!trimmedQuery) return;
    
    createTagMutation.mutate({
      name: trimmedQuery,
      slug: transliterate(trimmedQuery),
      category,
    });
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length > 0 && !selectedTagIds.includes(filteredTags[0].id)) {
        addTag(filteredTags[0].id);
      }
    }
  };

  const hasSelectedTags = selectedTagIds.length > 0;

  const popoverContent = (
    <PopoverContent className="w-[400px] p-0" align="start">
      <Command shouldFilter={false} onKeyDown={handleTagSearchKeyDown}>
        <CommandInput 
          placeholder={placeholder || t.searchTags}
          value={tagSearchQuery}
          onValueChange={setTagSearchQuery}
        />
        <CommandList className="max-h-96 overflow-auto">
          {filteredTags.length === 0 && tagSearchQuery.trim() && allowCreate ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {t.noTagsFound}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCreateNewTag('remedy')}
                  disabled={createTagMutation.isPending}
                  data-testid="button-create-new-remedy"
                >
                  <Pill className="mr-2 h-4 w-4" />
                  {t.createNewRemedy}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCreateNewTag('situation')}
                  disabled={createTagMutation.isPending}
                  data-testid="button-create-new-situation"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {t.createNewSituation}
                </Button>
              </div>
            </div>
          ) : filteredTags.length === 0 ? (
            <CommandEmpty>{t.noTagsFound}</CommandEmpty>
          ) : (
            <CommandGroup>
              {filteredTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  onSelect={() => {
                    if (!selectedTagIds.includes(tag.id)) {
                      addTag(tag.id);
                    }
                  }}
                  disabled={selectedTagIds.includes(tag.id)}
                  data-testid={`tag-option-${tag.slug}`}
                  className="gap-2 group"
                >
                  {tag.category === 'remedy' ? (
                    <Pill className="h-4 w-4 text-primary group-data-[selected=true]:text-accent-foreground shrink-0" />
                  ) : (
                    <Activity className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-accent-foreground shrink-0" />
                  )}
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map((tag) => (
          <Badge 
            key={tag.id} 
            variant={tag.category === 'remedy' ? 'default' : 'secondary'} 
            className="gap-1"
          >
            {tag.category === 'remedy' ? (
              <Pill className="h-3 w-3" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            {tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              className="ml-1 hover:text-destructive"
              data-testid={`button-remove-tag-${tag.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {hasSelectedTags && (
          <>
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
              {popoverContent}
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={clearAllTags}
              data-testid="button-clear-tags"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
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
              {t.selectTags}
              <Plus className="ml-2 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          {popoverContent}
        </Popover>
      )}
    </div>
  );
}
