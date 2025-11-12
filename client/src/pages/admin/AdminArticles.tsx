import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Article, InsertArticle, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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

export default function AdminArticles() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleWithTags | null>(null);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagCategoryFilter, setTagCategoryFilter] = useState<'remedy' | 'situation'>('remedy');
  
  const [formData, setFormData] = useState<InsertArticle>({
    title: '',
    content: '',
  });

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/admin/articles'],
    enabled: isAdmin,
  });

  const { data: allTags = [], isLoading: isLoadingTags, refetch: refetchTags } = useQuery<Tag[]>({
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
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertArticle & { tagIds: string[] } }) => {
      return await apiRequest('PUT', `/api/admin/articles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/articles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: t.articleSaved,
        variant: 'default',
      });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/admin/articles/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/articles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: t.articleDeleted,
        variant: 'default',
      });
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
      return await apiRequest('POST', '/api/admin/tags', data) as unknown as Tag;
    },
    onSuccess: async () => {
      // Обновляем список тегов с сервера
      await refetchTags();
      
      toast({
        title: t.tagSaved,
        variant: 'default',
      });
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
      
      // Проверяем совпадение с полным именем или slug
      if (tagNameLower.includes(query) || tagSlugLower.includes(query)) {
        return true;
      }
      
      // Проверяем совпадение с началом каждого слова
      const nameWords = tagNameLower.split(/\s+/);
      const slugWords = tagSlugLower.split(/[-_]/);
      return nameWords.some(word => word.startsWith(query)) || 
             slugWords.some(word => word.startsWith(query));
    });
  }, [allTags, tagSearchQuery, tagCategoryFilter]);

  const selectedTags = useMemo(() => {
    if (!allTags) return [];
    return allTags.filter(tag => tag && selectedTagIds.includes(tag.id));
  }, [allTags, selectedTagIds]);

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
    });
    setSelectedTagIds([]);
    setTagSearchQuery('');
    setEditingArticle(null);
  };

  const handleEdit = (article: ArticleWithTags) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
    });
    setSelectedTagIds(article.tags.map(tag => tag.id));
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataWithTags = { ...formData, tagIds: selectedTagIds };
    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, data: dataWithTags });
    } else {
      createMutation.mutate(dataWithTags);
    }
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

  const generateSlug = (name: string): string => {
    // Карта транслитерации кириллицы в латиницу
    const translitMap: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
      'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
      'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
      'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    
    return name
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
    if (tagSearchQuery.trim()) {
      const name = tagSearchQuery.trim();
      createTagMutation.mutate({
        name,
        slug: generateSlug(name),
        category: tagCategoryFilter,
      });
    }
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Если есть отфильтрованные теги, выбираем первый
      if (filteredTags.length > 0) {
        const firstTag = filteredTags[0];
        if (!selectedTagIds.includes(firstTag.id)) {
          addTag(firstTag.id);
        }
      } 
      // Если тегов нет, создаем новый
      else if (tagSearchQuery.trim()) {
        handleCreateNewTag();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t.manageArticles}</h1>
          <p className="text-muted-foreground mt-1">
            {articles?.length || 0} {t.articles.toLowerCase()}
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-article">
              <Plus className="mr-2 h-4 w-4" />
              {t.createArticle}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArticle ? t.editArticle : t.createArticle}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">{t.title}</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    data-testid="input-title"
                  />
                </div>
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
                                {t.createNewTag}: "{tagSearchQuery.trim()}"
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
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  {t.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-article"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t.save}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {articles && articles.length > 0 ? (
          articles.map((article) => (
            <Card key={article.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="space-y-2 flex-1">
                  <CardTitle className="text-xl font-serif">
                    {article.title}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <Badge 
                        key={tag.id} 
                        variant={tag.category === 'remedy' ? 'default' : 'secondary'} 
                        className="text-xs"
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(article)}
                    data-testid={`button-edit-${article.id}`}
                  >
                    {t.edit}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        data-testid={`button-delete-${article.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteArticle}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {article.title}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(article.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-${article.id}`}
                        >
                          {t.delete}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">{t.noArticles}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
