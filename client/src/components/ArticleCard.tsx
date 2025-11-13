import { Article, Tag } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
  isLast?: boolean;
}

export function ArticleCard({ article, isLast = false }: ArticleCardProps) {
  const preview = article.content.substring(0, 200).replace(/<[^>]*>/g, '');

  return (
    <Link href={`/article/${article.id}`}>
      <div 
        className={`py-6 cursor-pointer ${!isLast ? 'border-b' : ''}`}
        data-testid={`card-article-${article.id}`}
      >
        <h3 className="mb-3 text-2xl font-bold text-foreground leading-tight font-serif">
          {article.title}
        </h3>
        
        <p className="mb-4 text-base text-muted-foreground line-clamp-3 leading-relaxed">
          {preview}...
        </p>

        <div className="flex flex-wrap gap-2">
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
      </div>
    </Link>
  );
}
