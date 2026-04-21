import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'slurp',
  'baiduspider',
  'facebookexternalhit',
  'twitterbot',
  'rogerbot',
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest',
  'developers.google.com/+/web/snippet',
  'slackbot',
  'vkshare',
  'w3c_validator',
  'whatsapp',
  'telegrambot',
];

const prerenderCache = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function formatArticleTitle(tags: { name: string; category: string }[]): string {
  const sortedTags = [...tags].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'situation' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return sortedTags.map(tag => tag.name).join(', ');
}

function generateArticleHtml(article: any, tags: any[]): string {
  const BASE_URL = 'https://alleho.ru';
  const SITE_NAME = 'Alleho - пространство для работы и общения гомеопатов';
  
  const title = formatArticleTitle(tags);
  const fullTitle = `${title} | ${SITE_NAME}`;
  const description = stripHtml(article.preview || '').slice(0, 160);
  const canonicalUrl = `${BASE_URL}/article/${article.slug}`;
  const tagNames = tags.map(t => t.name);
  
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    url: canonicalUrl,
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
      '@id': canonicalUrl,
    },
    keywords: tagNames.join(', '),
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${tagNames.join(', ')}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${BASE_URL}/og-image.png">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${SITE_NAME}">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${BASE_URL}/og-image.png">
  
  ${article.createdAt ? `<meta property="article:published_time" content="${new Date(article.createdAt).toISOString()}">` : ''}
  ${article.updatedAt ? `<meta property="article:modified_time" content="${new Date(article.updatedAt).toISOString()}">` : ''}
  <meta property="article:author" content="${SITE_NAME}">
  ${tagNames.map(tag => `<meta property="article:tag" content="${tag}">`).join('\n  ')}
  
  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <article>
    <h1>${title}</h1>
    <div class="preview">${stripHtml(article.preview || '')}</div>
    <div class="content">${stripHtml(article.content || '').slice(0, 500)}...</div>
    <div class="tags">
      ${tagNames.map(tag => `<span class="tag">${tag}</span>`).join(' ')}
    </div>
  </article>
  <p><a href="${canonicalUrl}">Читать полностью на ${SITE_NAME}</a></p>
  <script>
    if (!/bot|crawl|spider|slurp/i.test(navigator.userAgent)) {
      window.location.href = "${canonicalUrl}";
    }
  </script>
</body>
</html>`;
}

function generateTagListHtml(tags: any[], category: 'remedy' | 'situation'): string {
  const BASE_URL = 'https://alleho.ru';
  const SITE_NAME = 'Alleho - пространство для работы и общения гомеопатов';
  
  const isRemedy = category === 'remedy';
  const title = isRemedy ? 'Все препараты' : 'Все случаи';
  const fullTitle = `${title} | ${SITE_NAME}`;
  const description = isRemedy 
    ? 'Полный каталог гомеопатических препаратов из Boericke'
    : 'Полный каталог клинических случаев и ситуаций для гомеопатического анализа';
  const canonicalUrl = `${BASE_URL}/${isRemedy ? 'remedies' : 'situations'}`;
  
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: fullTitle,
    url: canonicalUrl,
    description: description,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: tags.map((tag, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tag.name,
        url: `${BASE_URL}/?${isRemedy ? 'remedies' : 'situations'}=${tag.slug}`,
      })),
    },
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${BASE_URL}/og-image.png">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${SITE_NAME}">
  
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <ul>
    ${tags.map(tag => `<li><a href="${BASE_URL}/?${isRemedy ? 'remedies' : 'situations'}=${tag.slug}">${tag.name}</a></li>`).join('\n    ')}
  </ul>
  <script>
    if (!/bot|crawl|spider|slurp/i.test(navigator.userAgent)) {
      window.location.href = "${canonicalUrl}";
    }
  </script>
</body>
</html>`;
}

export function invalidateCache(slug?: string) {
  if (slug) {
    prerenderCache.delete(`/article/${slug}`);
  } else {
    prerenderCache.clear();
  }
}

export function invalidateTagCache(category?: 'remedy' | 'situation') {
  if (category) {
    prerenderCache.delete(category === 'remedy' ? '/remedies' : '/situations');
  } else {
    prerenderCache.delete('/remedies');
    prerenderCache.delete('/situations');
  }
}

export async function prerenderMiddleware(req: Request, res: Response, next: NextFunction) {
  const userAgent = req.get('user-agent') || '';
  
  if (!isBot(userAgent)) {
    return next();
  }
  
  const path = req.path;
  
  const cached = prerenderCache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.set('Content-Type', 'text/html');
    res.set('X-Prerender-Cache', 'HIT');
    return res.send(cached.html);
  }
  
  try {
    let html: string | null = null;
    
    const articleMatch = path.match(/^\/article\/([^/]+)$/);
    if (articleMatch) {
      const slug = articleMatch[1];
      const article = await storage.getArticleBySlug(slug);
      if (article) {
        const tags = await storage.getArticleTags(article.id);
        html = generateArticleHtml(article, tags);
      }
    }
    
    if (path === '/remedies') {
      const tags = await storage.getTagsByCategory('remedy');
      html = generateTagListHtml(tags, 'remedy');
    }
    
    if (path === '/situations') {
      const tags = await storage.getTagsByCategory('situation');
      html = generateTagListHtml(tags, 'situation');
    }
    
    if (html) {
      prerenderCache.set(path, { html, timestamp: Date.now() });
      res.set('Content-Type', 'text/html');
      res.set('X-Prerender-Cache', 'MISS');
      return res.send(html);
    }
  } catch (error) {
    console.error('Prerender error:', error);
  }
  
  next();
}
