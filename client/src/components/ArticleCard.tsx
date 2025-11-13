import { Article, Tag } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useMutation } from '@tanstack/react-query';
import { Edit, Trash2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/admin/articles/${article.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
      toast({
        title: t.articleDeleted,
      });
    },
    onError: () => {
      toast({
        title: t.error,
        description: 'Ошибка при удалении статьи',
        variant: 'destructive',
      });
    }
  });

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/admin/articles?edit=${article.id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Вы уверены, что хотите удалить эту статью?')) {
      deleteMutation.mutate();
    }
  };

  return (
    <Link href={`/article/${article.id}`}>
      <div 
        className="p-6 cursor-pointer border rounded-lg relative"
        data-testid={`card-article-${article.id}`}
      >
        {user?.isAdmin && (
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleEdit}
              data-testid={`button-edit-article-${article.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-article-${article.id}`}
            >
              <Trash2 className="h-4 w-4" />
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
            <span className="text-sm font-medium text-primary">{t.readFull}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
