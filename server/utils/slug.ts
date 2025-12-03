import { Tag } from '@shared/schema';

// Карта транслитерации кириллицы в латиницу
const translitMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(char => translitMap[char] || char)
    .join('')
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function generateSlugFromTags(tags: Tag[]): string {
  // Генерируем короткий уникальный суффикс (8 символов)
  const uniqueSuffix = Math.random().toString(36).substring(2, 10);
  
  // Если теги отсутствуют, возвращаем только уникальный slug
  if (!tags || tags.length === 0) {
    return `article-${uniqueSuffix}`;
  }
  
  const formattedTags = tags.map(tag => {
    if (tag.category === 'remedy') {
      return tag.name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    } else {
      return tag.name.toLowerCase();
    }
  });
  
  const joined = formattedTags.join(', ');
  const title = joined.charAt(0).toUpperCase() + joined.slice(1);
  let baseSlug = transliterate(title);
  
  // Обрезаем baseSlug до 90 символов (оставляем место для суффикса "-" + 8 символов)
  const maxBaseLength = 90;
  if (baseSlug.length > maxBaseLength) {
    baseSlug = baseSlug.substring(0, maxBaseLength);
    // Убираем неполные слова в конце (обрезаем до последнего дефиса)
    const lastDash = baseSlug.lastIndexOf('-');
    if (lastDash > maxBaseLength / 2) {
      baseSlug = baseSlug.substring(0, lastDash);
    }
  }
  
  // Добавляем уникальный суффикс к slug'у для гарантии уникальности
  return `${baseSlug}-${uniqueSuffix}`;
}
