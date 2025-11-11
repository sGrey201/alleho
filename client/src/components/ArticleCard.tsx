import { Article, Tag } from '@shared/schema';
import { useLanguage } from '@/context/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

type ArticleWithTags = Article & { tags: Tag[] };

interface ArticleCardProps {
  article: ArticleWithTags;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { language, t } = useLanguage();

  const title = article[`title${language.charAt(0).toUpperCase() + language.slice(1)}` as 'titleRu' | 'titleDe' | 'titleEn'];
  const content = article[`content${language.charAt(0).toUpperCase() + language.slice(1)}` as 'contentRu' | 'contentDe' | 'contentEn'];
  
  const preview = content.substring(0, 200).replace(/<[^>]*>/g, '');
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  return (
    <Link href={`/article/${article.id}`}>
      <Card className="h-full transition-all hover-elevate active-elevate-2 border-2 cursor-pointer" data-testid={`card-article-${article.id}`}>
        <CardContent className="p-6">
          <h3 className="mb-3 text-2xl font-bold text-foreground leading-tight line-clamp-2 font-serif">
            {title}
          </h3>
          
          <p className="mb-4 text-base text-muted-foreground line-clamp-3 leading-relaxed">
            {preview}...
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {article.tags.slice(0, 4).map((tag) => (
              <Badge
                key={tag.id}
                variant={tag.category === 'remedy' ? 'default' : 'secondary'}
                className="text-xs font-medium"
                data-testid={`badge-tag-${tag.slug}`}
              >
                {tag.name}
              </Badge>
            ))}
            {article.tags.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{article.tags.length - 4}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{readingTime} {t('readingTime')}</span>
            </div>
            {article.createdAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(article.createdAt), 'MMM d, yyyy')}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
