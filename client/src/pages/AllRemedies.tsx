import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Tag } from '@shared/schema';
import { t } from '@/lib/i18n';
import { SEO, generateTagListSchema } from '@/components/SEO';
import { Badge } from '@/components/ui/badge';

export default function AllRemedies() {
  const { data: tags, isLoading } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
  });

  const remedies = tags?.filter(tag => tag.category === 'remedy').sort((a, b) => a.name.localeCompare(b.name, 'ru')) || [];

  const schema = generateTagListSchema(
    remedies.map(r => ({ name: r.name, slug: r.slug })),
    'remedy'
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
        title="Все препараты"
        description="Полный список гомеопатических препаратов на Alleho - пространство для работы и общения гомеопатов. Найдите статьи о препаратах для изучения гомеопатии."
        keywords={remedies.map(r => r.name).join(', ')}
        url="/remedies"
        schema={schema}
      />

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-8 text-3xl md:text-4xl font-bold text-foreground font-serif" data-testid="text-page-title">
          {t.remedies}
        </h1>

        <p className="mb-8 text-lg text-muted-foreground">
          Полный список гомеопатических препаратов, упомянутых в наших статьях. Нажмите на препарат, чтобы увидеть все связанные статьи.
        </p>

        <div className="flex flex-wrap gap-3" data-testid="list-remedies">
          {remedies.map((remedy) => (
            <Link key={remedy.id} href={`/?remedies=${remedy.slug}`}>
              <Badge
                variant="default"
                className="text-base py-2 px-4 cursor-pointer"
                data-testid={`badge-remedy-${remedy.slug}`}
              >
                {remedy.name}
              </Badge>
            </Link>
          ))}
        </div>

        {remedies.length === 0 && (
          <p className="text-muted-foreground">{t.noResults}</p>
        )}
      </div>
    </>
  );
}
