import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { InsertArticle, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, X } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CreateArticleDialogProps {
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateArticleDialog({ trigger, open, onOpenChange }: CreateArticleDialogProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<InsertArticle>({
    preview: '',
    content: '',
    isFree: false,
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertArticle & { tagIds: string[] }) => {
      return await apiRequest('POST', '/api/admin/articles', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/articles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: t.articleSaved,
        variant: 'default',
      });
      resetForm();
      const isOpen = false;
      setIsDialogOpen(isOpen);
      onOpenChange?.(isOpen);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: 'destructive',
      });
    },
  });

  const createTagMutation = useMutation<Tag, Error, { name: string; slug: string; category: 'remedy' | 'situation' }>({
    mutationFn: async (data: { name: string; slug: string; category: 'remedy' | 'situation' }) => {
      const result = await apiRequest('POST', '/api/admin/tags', data);
      return result as unknown as Tag;
    },
    onSuccess: async (newTag: Tag) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      
      if (newTag && newTag.id && typeof newTag.id === 'string') {
        if (!selectedTagIds.includes(newTag.id)) {
          setSelectedTagIds(prev => [...prev, newTag.id]);
        }
      }
      
      toast({
        title: t.tagSaved,
        variant: 'default',
      });
    },
  });

  const resetForm = () => {
    setFormData({ preview: '', content: '', isFree: false });
    setSelectedTagIds([]);
    setTagSearchQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validTagIds = selectedTagIds.filter(id => id && typeof id === 'string');
    
    createMutation.mutate({ ...formData, tagIds: validTagIds });
  };

  const addTag = (tagId: string) => {
    if (!selectedTagIds.includes(tagId)) {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
    setTagPopoverOpen(false);
    setTagSearchQuery('');
  };

  const removeTag = (tagId: string) => {
    setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
  };

  const transliterate = (text: string): string => {
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
  };

  const handleCreateNewTag = () => {
    const trimmedQuery = tagSearchQuery.trim();
    if (!trimmedQuery) return;
    
    const slug = transliterate(trimmedQuery);
    
    createTagMutation.mutate({
      name: trimmedQuery,
      slug,
      category: 'situation',
    });
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length === 0 && tagSearchQuery.trim()) {
        handleCreateNewTag();
      }
    }
  };

  const selectedTags = useMemo(() => {
    return selectedTagIds
      .map(id => allTags.find(tag => tag.id === id))
      .filter((tag): tag is Tag => tag !== undefined);
  }, [selectedTagIds, allTags]);

  const filteredTags = useMemo(() => {
    const query = tagSearchQuery.toLowerCase().trim();
    return allTags.filter(tag => {
      const matchesSearch = !query || tag.name.toLowerCase().includes(query);
      return matchesSearch;
    });
  }, [allTags, tagSearchQuery]);

  const dialogOpen = open !== undefined ? open : isDialogOpen;
  const setDialogOpen = (value: boolean) => {
    setIsDialogOpen(value);
    onOpenChange?.(value);
    if (!value) resetForm();
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.createArticle}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="preview">{t.preview}</Label>
              <RichTextEditor
                content={formData.preview}
                onChange={(content) => setFormData({ ...formData, preview: content })}
                placeholder={t.preview}
              />
            </div>
            <div>
              <Label htmlFor="content">{t.content}</Label>
              <RichTextEditor
                content={formData.content}
                onChange={(content) => setFormData({ ...formData, content: content })}
                placeholder={t.content}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isFree"
                checked={formData.isFree}
                onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked === true })}
                data-testid="checkbox-is-free"
              />
              <Label htmlFor="isFree" className="cursor-pointer">{t.isFree}</Label>
            </div>
          </div>

          <div>
            <Label>{t.tags}</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {selectedTags.filter(tag => tag && tag.id && tag.name).map((tag) => (
                <Badge 
                  key={tag.id} 
                  variant={tag.category === 'remedy' ? 'default' : 'secondary'} 
                  className="gap-1"
                >
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
            </div>
            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={tagPopoverOpen}
                  className="w-full justify-between"
                  data-testid="button-select-tags"
                >
                  {t.selectTags}
                  <Plus className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false} onKeyDown={handleTagSearchKeyDown}>
                  <CommandInput 
                    placeholder={t.searchTags}
                    value={tagSearchQuery}
                    onValueChange={setTagSearchQuery}
                  />
                  <CommandList className="max-h-96 overflow-auto">
                    {filteredTags.length === 0 && tagSearchQuery.trim() ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground mb-3">
                          {t.noTagsFound}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateNewTag}
                          disabled={createTagMutation.isPending}
                          data-testid="button-create-new-tag"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t.createNewSituation}: "{tagSearchQuery.trim()}"
                        </Button>
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
                          >
                            <Badge 
                              variant={tag.category === 'remedy' ? 'default' : 'secondary'}
                              className="mr-2"
                            >
                              {tag.category === 'remedy' ? t.remedy : t.situation}
                            </Badge>
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

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-save-article"
            >
              <Save className="mr-2 h-4 w-4" />
              {t.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
