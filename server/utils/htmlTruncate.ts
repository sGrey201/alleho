const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export function truncateHtml(html: string, maxLength: number): string {
  if (!html) return '';
  
  let textLength = 0;
  let result = '';
  let i = 0;
  const openTags: string[] = [];
  
  while (i < html.length && textLength < maxLength) {
    if (html[i] === '<') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) {
        break;
      }
      
      const tag = html.substring(i, tagEnd + 1);
      result += tag;
      
      const isClosingTag = tag.startsWith('</');
      const isSelfClosing = tag.endsWith('/>') || tag.includes('/>');
      
      if (isClosingTag) {
        const tagName = tag.match(/<\/(\w+)/)?.[1]?.toLowerCase();
        if (tagName) {
          const lastIndex = openTags.lastIndexOf(tagName);
          if (lastIndex !== -1) {
            openTags.splice(lastIndex, 1);
          }
        }
      } else if (!isSelfClosing) {
        const tagName = tag.match(/<(\w+)/)?.[1]?.toLowerCase();
        if (tagName && !SELF_CLOSING_TAGS.has(tagName)) {
          openTags.push(tagName);
        }
      }
      
      i = tagEnd + 1;
    } else if (html[i] === '&') {
      const entityEnd = html.indexOf(';', i);
      if (entityEnd !== -1 && entityEnd - i < 10) {
        const entity = html.substring(i, entityEnd + 1);
        result += entity;
        textLength++;
        i = entityEnd + 1;
      } else {
        result += html[i];
        textLength++;
        i++;
      }
    } else {
      result += html[i];
      textLength++;
      i++;
    }
  }
  
  if (textLength >= maxLength && i < html.length) {
    const lastSpace = result.lastIndexOf(' ');
    if (lastSpace > result.length - 50) {
      result = result.substring(0, lastSpace);
    }
    result += '...';
  }
  
  for (let j = openTags.length - 1; j >= 0; j--) {
    result += `</${openTags[j]}>`;
  }
  
  return result;
}
