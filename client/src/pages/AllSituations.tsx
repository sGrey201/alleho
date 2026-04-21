import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { SEO, generateTagListSchema } from '@/components/SEO';
import { Badge } from '@/components/ui/badge';

export default function AllSituations() {
  const { data: tags, isLoading } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const situations = tags?.filter(tag => tag.category === 'situation').sort((a, b) => a.name.localeCompare(b.name, 'ru')) || [];

  const schema = generateTagListSchema(
    situations.map(s => ({ name: s.name, slug: s.slug })),
    'situation'
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Все случаи"
        description="Полный список клинических случаев и ситуаций на Alleho - пространство для работы и общения гомеопатов. Изучайте гомеопатию через реальные примеры."
        keywords={situations.map(s => s.name).join(', ')}
        url="/situations"
        schema={schema}
      />

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-8 text-3xl md:text-4xl font-bold text-foreground font-serif" data-testid="text-page-title">
          {t.situations}
        </h1>

        <p className="mb-8 text-lg text-muted-foreground">
          Полный список клинических случаев и ситуаций, описанных в наших статьях. Нажмите на случай, чтобы увидеть все связанные статьи.
        </p>

        <div className="flex flex-wrap gap-3" data-testid="list-situations">
          {situations.map((situation) => (
            <Link key={situation.id} href={`/?situations=${situation.slug}`}>
              <Badge
                variant="secondary"
                className="text-base py-2 px-4 cursor-pointer"
                data-testid={`badge-situation-${situation.slug}`}
              >
                {situation.name}
              </Badge>
            </Link>
          ))}
        </div>

        {situations.length === 0 && (
          <p className="text-muted-foreground">{t.noResults}</p>
        )}
      </div>
    </>
  );
}
