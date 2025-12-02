import { useState, useMemo } from 'react';
import { Article, Tag, InsertArticle } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Edit, Plus, X, Save } from 'lucide-react';
import { t } from '@/lib/i18n';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatArticleTitle } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RichTextEditor } from '@/components/RichTextEditor';
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
    preview: article.preview,
    content: article.content,
    isFree: article.isFree,
  });
  
  const title = formatArticleTitle(article.tags);

  const getTextFromHTML = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  const previewText = getTextFromHTML(article.preview);

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
      preview: article.preview,
      content: article.content,
      isFree: article.isFree,
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
          <div className="flex items-start gap-2 mb-4">
            <h3 className="text-xl md:text-2xl font-bold text-foreground font-serif leading-tight line-clamp-2 flex-1" data-testid={`text-article-title-${article.id}`}>
              {title}
              {article.isFree && (
                <span className="ml-2 font-medium text-green-600 dark:text-green-500 text-[16px]">free</span>
              )}
            </h3>
            {user?.isAdmin && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleEdit}
                className="shrink-0"
                data-testid={`button-edit-article-${article.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <p className="text-base text-muted-foreground leading-snug line-clamp-4 font-serif">
            {previewText}
          </p>
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
