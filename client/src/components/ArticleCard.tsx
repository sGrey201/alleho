import { Article, Tag } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { t } from '@/lib/i18n';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
  isLast?: boolean;
}

export function ArticleCard({ article, isLast = false }: ArticleCardProps) {
  const preview = article.content.substring(0, 600).replace(/<[^>]*>/g, '');

  return (
    <Link href={`/article/${article.id}`}>
      <div 
        className={`py-6 cursor-pointer ${!isLast ? 'border-b' : ''}`}
        data-testid={`card-article-${article.id}`}
      >
        <div className="flex flex-wrap gap-2 mb-4">
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
