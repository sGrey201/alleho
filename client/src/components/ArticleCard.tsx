import { useState } from 'react';
import { Article, Tag } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Edit } from 'lucide-react';
import { formatArticleTitle } from '@/lib/utils';
import { ArticleDialog } from '@/components/ArticleDialog';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { user } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const title = formatArticleTitle(article.tags);

  const getTextFromHTML = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  const previewText = getTextFromHTML(article.preview);

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditDialogOpen(true);
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
                <Badge variant="secondary" className="ml-2 text-sm font-medium">free</Badge>
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
      
      <ArticleDialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen}
        article={article}
      />
    </>
  );
}
