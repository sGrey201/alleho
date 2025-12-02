import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatArticleTitle(tags: { name: string; category: string }[]): string {
  const sortedTags = [...tags].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'situation' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  
  const title = sortedTags.map(tag => tag.name).join(', ');
  
  return title.charAt(0).toUpperCase() + title.slice(1);
}
