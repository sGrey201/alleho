import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    tags?: string[];
  };
  schema?: object;
}

const BASE_URL = 'https://materiamedica.pro';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = 'Materia Medica Pro';
const DEFAULT_TITLE = 'Materia Medica Pro — Живые портреты гомеопатических типажей';
const DEFAULT_DESCRIPTION = 'Уникальная галерея живых гомеопатических портретов. Ресурс, динамично пополняющийся новыми зарисовками из жизни.';

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  article,
  schema,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const canonicalUrl = url ? `${BASE_URL}${url}` : BASE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="ru_RU" />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {article?.publishedTime && (
        <meta property="article:published_time" content={article.publishedTime} />
      )}
      {article?.modifiedTime && (
        <meta property="article:modified_time" content={article.modifiedTime} />
      )}
      {article?.author && (
        <meta property="article:author" content={article.author} />
      )}
      {article?.tags?.map((tag) => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}

      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}

export function generateArticleSchema(article: {
  title: string;
  description: string;
  slug: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  tags?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `${BASE_URL}/article/${article.slug}`,
    datePublished: article.createdAt ? new Date(article.createdAt).toISOString() : undefined,
    dateModified: article.updatedAt ? new Date(article.updatedAt).toISOString() : undefined,
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/favicon-512x512.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/article/${article.slug}`,
    },
    keywords: article.tags?.join(', '),
  };
}

export function generateWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: BASE_URL,
    description: DEFAULT_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BASE_URL}/?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateTagListSchema(tags: { name: string; slug: string }[], category: 'remedy' | 'situation') {
  const categoryName = category === 'remedy' ? 'Препараты' : 'Случаи';
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${categoryName} — ${SITE_NAME}`,
    url: `${BASE_URL}/${category === 'remedy' ? 'remedies' : 'situations'}`,
    description: `Полный список ${category === 'remedy' ? 'гомеопатических препаратов' : 'клинических случаев'} на ${SITE_NAME}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: tags.map((tag, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tag.name,
        url: `${BASE_URL}/?${category === 'remedy' ? 'remedies' : 'situations'}=${tag.slug}`,
      })),
    },
  };
}
