import { Article, Tag } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Link, useLocation } from 'wouter';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
  isLast?: boolean;
}

export function ArticleCard({ article, isLast = false }: ArticleCardProps) {
  const preview = article.content.substring(0, 200).replace(/<[^>]*>/g, '');
  const [location, setLocation] = useLocation();

  const handleTagClick = (e: React.MouseEvent, tag: Tag) => {
    e.preventDefault();
    e.stopPropagation();

    // Парсим текущие параметры URL
    const params = new URLSearchParams(location.split('?')[1] || '');
    const remediesParam = params.get('remedies');
    const situationsParam = params.get('situations');

    if (tag.category === 'remedy') {
      const currentSlugs = remediesParam ? remediesParam.split(',') : [];
      if (!currentSlugs.includes(tag.slug)) {
        currentSlugs.push(tag.slug);
        params.set('remedies', currentSlugs.join(','));
      }
    } else if (tag.category === 'situation') {
      const currentSlugs = situationsParam ? situationsParam.split(',') : [];
      if (!currentSlugs.includes(tag.slug)) {
        currentSlugs.push(tag.slug);
        params.set('situations', currentSlugs.join(','));
      }
    }

    const newUrl = params.toString() ? `/?${params.toString()}` : '/';
    setLocation(newUrl);
  };

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

        <div className="flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant={tag.category === 'remedy' ? 'default' : 'secondary'}
              className="text-xs font-medium cursor-pointer hover-elevate"
              data-testid={`badge-tag-${tag.slug}`}
              onClick={(e) => handleTagClick(e, tag)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
