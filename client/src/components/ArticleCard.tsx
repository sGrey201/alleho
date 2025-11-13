import { Article, Tag } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Edit } from 'lucide-react';
import { t } from '@/lib/i18n';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
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

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/admin/articles?edit=${article.id}`);
  };

  return (
    <Link href={`/article/${article.id}`}>
      <div 
        className="p-6 cursor-pointer border rounded-lg relative"
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
            <span className="text-sm font-medium text-primary">{t.readFull}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
