import { useState, useMemo } from 'react';
import { Article, Tag, InsertArticle } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Edit, Plus, X, Save } from 'lucide-react';
import { t } from '@/lib/i18n';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(article.tags.map(t => t.id));
  const [tagCategoryFilter, setTagCategoryFilter] = useState<'remedy' | 'situation'>('remedy');
  const [formData, setFormData] = useState<InsertArticle>({
    content: article.content,
  });

  const preview = article.content.substring(0, 600).replace(/<[^>]*>/g, '');
  
  const formattedTags = article.tags.map(tag => {
    if (tag.category === 'remedy') {
      return tag.name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    } else {
      return tag.name.toLowerCase();
    }
  });
  
  const joined = formattedTags.join(', ');
  const title = joined.charAt(0).toUpperCase() + joined.slice(1);

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertArticle & { tagIds: string[] }) => {
      return await apiRequest('PUT', `/api/admin/articles/${article.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/articles'] });
      toast({
        title: t.articleSaved,
      });
      setIsEditDialogOpen(false);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: 'destructive',
      });
    },
  });

  const filteredTags = useMemo(() => {
    let tags = allTags.filter(tag => tag.category === tagCategoryFilter);
    
    if (!tagSearchQuery.trim()) return tags;
    const query = tagSearchQuery.toLowerCase().trim();
    return tags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      const tagSlugLower = tag.slug.toLowerCase();
      return tagNameLower.includes(query) || tagSlugLower.includes(query);
    });
  }, [allTags, tagSearchQuery, tagCategoryFilter]);

  const selectedTags = useMemo(() => {
    return allTags.filter(tag => selectedTagIds.includes(tag.id));
  }, [allTags, selectedTagIds]);

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFormData({
      content: article.content,
    });
    setSelectedTagIds(article.tags.map(t => t.id));
    setIsEditDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ ...formData, tagIds: selectedTagIds });
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

  return (
    <>
      <Link href={`/article/${article.slug}`}>
        <div 
          className="md:p-6 cursor-pointer rounded-lg relative md:border"
          data-testid={`card-article-${article.id}`}
        >
          {user?.isAdmin && (
            <div className="absolute top-4 right-4">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleEdit}
                data-testid={`button-edit-article-${article.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <h3 className="text-xl font-semibold mb-4 text-foreground pr-20" data-testid={`text-article-title-${article.id}`}>
            {title}
          </h3>
          
          <div className="relative">
            <p className="text-base text-muted-foreground leading-relaxed line-clamp-6">
              {preview}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background via-background/80 to-transparent flex items-end justify-center pb-2">
              <span className="text-xl font-medium text-primary">{t.readFull}</span>
            </div>
          </div>
        </div>
      </Link>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.editArticle}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="content">{t.content}</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={12}
                  data-testid="textarea-content"
                />
              </div>
            </div>

            <div>
              <Label>{t.tags}</Label>
              <div className="flex flex-wrap gap-2 mt-2 mb-2">
                {selectedTags.map((tag) => (
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
                    className="w-full justify-between"
                    data-testid="button-select-tags"
                  >
                    {t.selectTags}
                    <Plus className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Tabs value={tagCategoryFilter} onValueChange={(v) => setTagCategoryFilter(v as 'remedy' | 'situation')}>
                    <div className="border-b px-2 pt-2">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="remedy" className="text-xs">
                          {t.remedies}
                        </TabsTrigger>
                        <TabsTrigger value="situation" className="text-xs">
                          {t.situations}
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <Command shouldFilter={false}>
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
                            {filteredTags.map((tag) => (
                              <CommandItem
                                key={tag.id}
                                value={tag.name}
                                onSelect={() => addTag(tag.id)}
                                disabled={selectedTagIds.includes(tag.id)}
                              >
                                {tag.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </Tabs>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                data-testid="button-cancel"
              >
                {t.cancel}
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                <Save className="mr-2 h-4 w-4" />
                {t.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
