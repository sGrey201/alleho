import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Article, InsertArticle, Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Save } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { TagSelector } from '@/components/TagSelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  article?: ArticleWithTags;
}

export function ArticleDialog({ trigger, open, onOpenChange, article }: ArticleDialogProps) {
  const { toast } = useToast();
  const isEditMode = !!article;
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<InsertArticle>({
    preview: '',
    content: '',
    isFree: false,
  });

  useEffect(() => {
    if (article) {
      setFormData({
        preview: article.preview,
        content: article.content,
        isFree: article.isFree,
      });
      setSelectedTagIds(article.tags.map(t => t.id));
    }
  }, [article]);

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
      closeDialog();
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
    mutationFn: async (data: InsertArticle & { tagIds: string[] }) => {
      return await apiRequest('PUT', `/api/admin/articles/${article!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/articles'] });
      toast({
        title: t.articleSaved,
      });
      closeDialog();
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
    setFormData({ preview: '', content: '', isFree: false });
    setSelectedTagIds([]);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    onOpenChange?.(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validTagIds = selectedTagIds.filter(id => id && typeof id === 'string');
    
    if (isEditMode) {
      updateMutation.mutate({ ...formData, tagIds: validTagIds });
    } else {
      createMutation.mutate({ ...formData, tagIds: validTagIds });
    }
  };

  const dialogOpen = open !== undefined ? open : isDialogOpen;
  const setDialogOpen = (value: boolean) => {
    setIsDialogOpen(value);
    onOpenChange?.(value);
    if (!value && !isEditMode) resetForm();
  };

  const isPending = isEditMode ? updateMutation.isPending : createMutation.isPending;

  const dialogContent = (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditMode ? t.editArticle : t.createArticle}</DialogTitle>
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

        <TagSelector
          selectedTagIds={selectedTagIds}
          onTagsChange={setSelectedTagIds}
          allowCreate={true}
        />

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
            disabled={isPending}
            data-testid="button-save-article"
          >
            <Save className="mr-2 h-4 w-4" />
            {t.save}
          </Button>
        </div>
      </form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {dialogContent}
    </Dialog>
  );
}
