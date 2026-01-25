export type EachBlockInfo = {
  type: 'each-in' | 'each-plain';
  source: string; // The array/collection being iterated
  alias?: string; // The alias (for each-in syntax)
  blockStart: number;
  blockEnd: number;
};

/**
 * Find if the cursor is positioned on an #each block keyword and extract details.
 * Supports both:
 * - {{#each val in arr}} (each-in)
 * - {{#each arr}} (each-plain, uses 'this' context)
 *
 * @param text - The document text
 * @param cursorOffset - The cursor position
 * @returns EachBlockInfo if cursor is on #each keyword, null otherwise
 *
 */
export function findEachBlockAtCursor(
  text: string,
  cursorOffset: number
): EachBlockInfo | null {
  if (cursorOffset <= 0) {
    return null;
  }

  // Find all #each blocks in the text
  // Pattern: {{#each <something>}}
  const eachPattern = /\{\{\s*#each\s+([^}]+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = eachPattern.exec(text)) !== null) {
    const blockStart = match.index;
    const blockEnd = match.index + match[0].length;
    const _fullMatch = match[0];
    const params = match[1].trim();

    // Check if cursor is within this #each block opening tag
    // We want to detect if the cursor is on the #each keyword or nearby
    if (cursorOffset >= blockStart && cursorOffset <= blockEnd) {
      // Parse the parameters to determine if it's each-in or each-plain
      // Pattern for each-in: {{#each val in arr}}
      const eachInPattern = /^([A-Za-z_$][\w$]*)\s+in\s+([A-Za-z_$][\w$]*)\s*$/;
      const eachInMatch = params.match(eachInPattern);

      if (eachInMatch) {
        // each-in syntax
        return {
          type: 'each-in',
          source: eachInMatch[2],
          alias: eachInMatch[1],
          blockStart,
          blockEnd,
        };
      } else {
        // each-plain syntax: {{#each arr}}
        // The parameter is just the source array/collection
        const sourceMatch = params.match(/^([A-Za-z_$][\w$]*)/);
        if (sourceMatch) {
          return {
            type: 'each-plain',
            source: sourceMatch[1],
            blockStart,
            blockEnd,
          };
        }
      }
    }
  }

  return null;
}
