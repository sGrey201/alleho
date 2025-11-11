import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Article, InsertArticle, Tag } from '@shared/schema';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleWithTags | null>(null);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<InsertArticle>({
    titleRu: '',
    titleDe: '',
    titleEn: '',
    contentRu: '',
    contentDe: '',
    contentEn: '',
  });

  const { data: articles, isLoading } = useQuery<ArticleWithTags[]>({
    queryKey: ['/api/admin/articles'],
    enabled: isAdmin,
  });

  const { data: allTags = [], isLoading: isLoadingTags } = useQuery<Tag[]>({
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
        title: t('articleSaved'),
        variant: 'default',
      });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: t('error'),
        description: t('somethingWrong'),
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
        title: t('articleSaved'),
        variant: 'default',
      });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: t('error'),
        description: t('somethingWrong'),
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
        title: t('articleDeleted'),
        variant: 'default',
      });
    },
    onError: () => {
      toast({
        title: t('error'),
        description: t('somethingWrong'),
        variant: 'destructive',
      });
    },
  });

  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return allTags;
    const query = tagSearchQuery.toLowerCase();
    return allTags.filter(tag => 
      tag.name.toLowerCase().includes(query) || 
      tag.slug.toLowerCase().includes(query)
    );
  }, [allTags, tagSearchQuery]);

  const selectedTags = useMemo(() => {
    return allTags.filter(tag => selectedTagIds.includes(tag.id));
  }, [allTags, selectedTagIds]);

  const resetForm = () => {
    setFormData({
      titleRu: '',
      titleDe: '',
      titleEn: '',
      contentRu: '',
      contentDe: '',
      contentEn: '',
    });
    setSelectedTagIds([]);
    setTagSearchQuery('');
    setEditingArticle(null);
  };

  const handleEdit = (article: ArticleWithTags) => {
    setEditingArticle(article);
    setFormData({
      titleRu: article.titleRu,
      titleDe: article.titleDe,
      titleEn: article.titleEn,
      contentRu: article.contentRu,
      contentDe: article.contentDe,
      contentEn: article.contentEn,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('manageArticles')}</h1>
          <p className="text-muted-foreground mt-1">
            {articles?.length || 0} {t('articles').toLowerCase()}
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-article">
              <Plus className="mr-2 h-4 w-4" />
              {t('createArticle')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArticle ? t('editArticle') : t('createArticle')}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <Tabs defaultValue="ru" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="ru" data-testid="tab-russian">
                    {t('russianVersion')}
                  </TabsTrigger>
                  <TabsTrigger value="de" data-testid="tab-german">
                    {t('germanVersion')}
                  </TabsTrigger>
                  <TabsTrigger value="en" data-testid="tab-english">
                    {t('englishVersion')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ru" className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="titleRu">{t('title')}</Label>
                    <Input
                      id="titleRu"
                      value={formData.titleRu}
                      onChange={(e) => setFormData({ ...formData, titleRu: e.target.value })}
                      required
                      data-testid="input-title-ru"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contentRu">{t('content')}</Label>
                    <Textarea
                      id="contentRu"
                      value={formData.contentRu}
                      onChange={(e) => setFormData({ ...formData, contentRu: e.target.value })}
                      required
                      rows={12}
                      data-testid="textarea-content-ru"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="de" className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="titleDe">{t('title')}</Label>
                    <Input
                      id="titleDe"
                      value={formData.titleDe}
                      onChange={(e) => setFormData({ ...formData, titleDe: e.target.value })}
                      required
                      data-testid="input-title-de"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contentDe">{t('content')}</Label>
                    <Textarea
                      id="contentDe"
                      value={formData.contentDe}
                      onChange={(e) => setFormData({ ...formData, contentDe: e.target.value })}
                      required
                      rows={12}
                      data-testid="textarea-content-de"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="en" className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="titleEn">{t('title')}</Label>
                    <Input
                      id="titleEn"
                      value={formData.titleEn}
                      onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                      required
                      data-testid="input-title-en"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contentEn">{t('content')}</Label>
                    <Textarea
                      id="contentEn"
                      value={formData.contentEn}
                      onChange={(e) => setFormData({ ...formData, contentEn: e.target.value })}
                      required
                      rows={12}
                      data-testid="textarea-content-en"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div>
                <Label>{t('tags')}</Label>
                <div className="flex flex-wrap gap-2 mt-2 mb-2">
                  {selectedTags.map((tag) => (
                    <Badge key={tag.id} variant="secondary" className="gap-1">
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
                      {t('selectTags')}
                      <Plus className="ml-2 h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder={t('searchTags')} 
                        value={tagSearchQuery}
                        onValueChange={setTagSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>{t('noTagsFound')}</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {filteredTags.map((tag) => (
                            <CommandItem
                              key={tag.id}
                              value={tag.id}
                              onSelect={() => addTag(tag.id)}
                              disabled={selectedTagIds.includes(tag.id)}
                              data-testid={`tag-option-${tag.slug}`}
                            >
                              {tag.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
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
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-article"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {t('save')}
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
                    {article.titleEn}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary" className="text-xs">
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
                    {t('edit')}
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
                        <AlertDialogTitle>{t('deleteArticle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {article.titleEn}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(article.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-${article.id}`}
                        >
                          {t('delete')}
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
              <p className="text-muted-foreground">{t('noArticles')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
