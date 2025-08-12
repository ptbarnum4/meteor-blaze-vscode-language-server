/**
 * Check if a position is within an #if or #unless block
 * @param text The full document text
 * @param offset The cursor position offset
 * @returns Object indicating if inside #if or #unless block
 */
export function findEnclosingIfOrUnlessBlock(text: string, offset: number): {
  isInside: boolean;
  blockType: 'if' | 'unless' | null;
} {
  // Find all #if and #unless blocks
  const blockPatterns = [
    { type: 'if' as const, beginRegex: /\{\{\s*#if\b[^}]*\}\}/g, endRegex: /\{\{\s*\/if\s*\}\}/g },
    { type: 'unless' as const, beginRegex: /\{\{\s*#unless\b[^}]*\}\}/g, endRegex: /\{\{\s*\/unless\s*\}\}/g }
  ];

  for (const pattern of blockPatterns) {
    const { type, beginRegex, endRegex } = pattern;

    // Reset regex state
    beginRegex.lastIndex = 0;
    endRegex.lastIndex = 0;

    let beginMatch;
    while ((beginMatch = beginRegex.exec(text)) !== null) {
      const blockStart = beginMatch.index;
      const blockStartEnd = blockStart + beginMatch[0].length;

      // Find the corresponding end tag
      endRegex.lastIndex = blockStartEnd;
      const endMatch = endRegex.exec(text);

      if (endMatch) {
        const blockEnd = endMatch.index;

        // Check if cursor is inside this block (but not in the opening tag)
        if (offset > blockStartEnd && offset < blockEnd) {
          return {
            isInside: true,
            blockType: type
          };
        }
      }

      // Reset for next iteration
      beginRegex.lastIndex = blockStartEnd;
    }
  }

  return {
    isInside: false,
    blockType: null
  };
}
