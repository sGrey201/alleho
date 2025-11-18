import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tag, InsertTag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, Trash2, X, Edit2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AdminTags() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'remedy' | 'situation'>('remedy');
  
  const [formData, setFormData] = useState<InsertTag>({
    name: '',
    slug: '',
    category: 'remedy',
  });

  const { data: allTags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
    enabled: isAdmin,
  });

  const remedyTags = allTags.filter(tag => tag.category === 'remedy');
  const situationTags = allTags.filter(tag => tag.category === 'situation');

  const createMutation = useMutation({
    mutationFn: async (data: InsertTag) => {
      return await apiRequest('POST', '/api/admin/tags', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: t.tagSaved,
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertTag> }) => {
      return await apiRequest('PUT', `/api/admin/tags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: t.tagSaved,
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
      return await apiRequest('DELETE', `/api/admin/tags/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: t.tagDeleted,
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

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      category: selectedCategory,
    });
    setEditingTag(null);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      slug: tag.slug,
      category: tag.category as 'remedy' | 'situation',
    });
    setIsDialogOpen(true);
  };

  const generateSlug = (name: string): string => {
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

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: t.error,
        description: 'Name is required',
        variant: 'destructive',
      });
      return;
    }

    const dataToSubmit = {
      ...formData,
      slug: generateSlug(formData.name),
    };

    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const handleNameChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      name: value,
    }));
  };

  const handleOpenDialog = (category: 'remedy' | 'situation') => {
    setSelectedCategory(category);
    setFormData({
      name: '',
      slug: '',
      category: category,
    });
    setIsDialogOpen(true);
  };

  const TagList = ({ tags, category }: { tags: Tag[]; category: 'remedy' | 'situation' }) => (
    <div className="space-y-2">
      {tags.map(tag => (
        <Card key={tag.id} data-testid={`card-tag-${tag.id}`}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{tag.name}</div>
              <div className="text-sm text-muted-foreground truncate">{tag.slug}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleEdit(tag)}
                data-testid={`button-edit-tag-${tag.id}`}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid={`button-delete-tag-${tag.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.deleteTag}</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{tag.name}"?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">
                      {t.cancel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(tag.id)}
                      data-testid="button-confirm-delete"
                    >
                      {t.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      ))}
      {tags.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No tags in this category yet
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">{t.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{t.manageTags}</h1>
        <p className="text-muted-foreground">
          Manage homeopathic remedies and clinical situations
        </p>
      </div>

      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as 'remedy' | 'situation')}>
        <div className="flex items-center justify-between mb-6">
          <TabsList>
            <TabsTrigger value="remedy" data-testid="tab-remedies">
              {t.remedies} ({remedyTags.length})
            </TabsTrigger>
            <TabsTrigger value="situation" data-testid="tab-situations">
              {t.situations} ({situationTags.length})
            </TabsTrigger>
          </TabsList>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog(selectedCategory)} data-testid="button-create-tag">
                <Plus className="h-4 w-4 mr-2" />
                {t.createTag}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTag ? t.editTag : t.createTag}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="category">{t.tagCategory}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: 'remedy' | 'situation') =>
                      setFormData(prev => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger data-testid="select-tag-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remedy">{t.remedy}</SelectItem>
                      <SelectItem value="situation">{t.situation}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t.tagName}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., Arnica montana"
                    data-testid="input-tag-name"
                  />
                </div>

              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setIsDialogOpen(false);
                  }}
                  data-testid="button-cancel-tag"
                >
                  {t.cancel}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-tag"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {t.save}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="remedy">
          <TagList tags={remedyTags} category="remedy" />
        </TabsContent>

        <TabsContent value="situation">
          <TagList tags={situationTags} category="situation" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
