/**
 * Set of self-closing HTML tags that should be skipped
 */
const SELF_CLOSING_TAGS = new Set([
  'img',
  'br',
  'hr',
  'input',
  'meta',
  'link',
  'area',
  'base',
  'col',
  'embed',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Find the matching opening tag for a closing tag using stack-based matching
 * @param text - Full document text
 * @param closingTagPosition - Offset of the closing tag
 * @param tagName - The tag name to match (e.g., 'div')
 * @returns Object with opening tag text and position, or null
 */
export function findMatchingOpenTag(
  text: string,
  closingTagPosition: number,
  tagName: string
): { openingTag: string; position: number } | null {
  // Skip self-closing tags
  if (SELF_CLOSING_TAGS.has(tagName.toLowerCase())) {
    return null;
  }

  const beforeClosingTag = text.substring(0, closingTagPosition);

  // Stack to track nested tags of the same type
  let depth = 0;

  // Regex to find all opening and closing tags of this type
  // This matches: <tagName ...> and </tagName>
  const openingTagRegex = new RegExp(`<${tagName}([^>]*?)(/?)>`, 'gi');
  const closingTagRegex = new RegExp(`</${tagName}\\s*>`, 'gi');

  // Create an array of all tags with their positions and types
  const tags: Array<{
    pos: number;
    isClosing: boolean;
    match: RegExpExecArray;
  }> = [];

  let match;
  while ((match = openingTagRegex.exec(beforeClosingTag)) !== null) {
    // Check if it's self-closing (ends with />)
    if (match[2] !== '/') {
      tags.push({ pos: match.index, isClosing: false, match });
    }
  }

  // Reset regex
  closingTagRegex.lastIndex = 0;
  while ((match = closingTagRegex.exec(beforeClosingTag)) !== null) {
    tags.push({ pos: match.index, isClosing: true, match });
  }

  // Sort by position
  tags.sort((a, b) => a.pos - b.pos);

  // Walk through tags from the end, tracking depth
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];
    if (tag.isClosing) {
      depth++;
    } else {
      if (depth === 0) {
        // This is the matching opening tag
        return {
          openingTag: tag.match[0],
          position: tag.pos,
        };
      }
      depth--;
    }
  }

  return null;
}
