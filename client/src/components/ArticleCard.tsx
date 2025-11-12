import { Article, Tag } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { t } from '@/lib/i18n';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
  isLast?: boolean;
}

export function ArticleCard({ article, isLast = false }: ArticleCardProps) {
  const preview = article.content.substring(0, 200).replace(/<[^>]*>/g, '');
  const wordCount = article.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  return (
    <Link href={`/article/${article.id}`}>
      <div 
        className={`py-6 cursor-pointer transition-colors hover:bg-muted/50 ${!isLast ? 'border-b' : ''}`}
        data-testid={`card-article-${article.id}`}
      >
        <h3 className="mb-3 text-2xl font-bold text-foreground leading-tight font-serif">
          {article.title}
        </h3>
        
        <p className="mb-4 text-base text-muted-foreground line-clamp-3 leading-relaxed">
          {preview}...
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={tag.category === 'remedy' ? 'default' : 'secondary'}
              className="text-xs font-medium"
              data-testid={`badge-tag-${tag.slug}`}
            >
              {tag.name}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{readingTime} {t.readingTime}</span>
          </div>
          {article.createdAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(article.createdAt), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
