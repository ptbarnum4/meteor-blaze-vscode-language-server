export type EachInContext = {
  alias: string;
  source: string;
  openIndex: number;
};

// Find the nearest enclosing `{{#each alias in source}}` block for a given cursor offset.
// This function looks for each-in blocks that contain the cursor position, accounting for
// the fact that the cursor might be inside the opening tag itself.
export function findEnclosingEachInContext(text: string, cursorOffset: number): EachInContext | null {
  if (cursorOffset <= 0) {
    return null;
  }

  // Look for all each-in blocks in the entire text
  const openRe = /\{\{\s*#each\s+([A-Za-z_$][\w$]*)\s+in\s+([A-Za-z_$][\w$]*)[^}]*\}\}/g;
  let m: RegExpExecArray | null;
  const candidates: { alias: string; source: string; openIndex: number; openEnd: number }[] = [];

  while ((m = openRe.exec(text)) !== null) {
    const openStart = m.index;
    const openEnd = m.index + m[0].length;
    candidates.push({
      alias: m[1],
      source: m[2],
      openIndex: openStart,
      openEnd: openEnd
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Find candidates where the cursor is either:
  // 1. Inside the opening tag (between openIndex and openEnd)
  // 2. After the opening tag but before the corresponding closing tag
  const validCandidates = candidates.filter(c => {
    // If cursor is inside the opening tag itself
    if (cursorOffset >= c.openIndex && cursorOffset <= c.openEnd) {
      return true;
    }

    // If cursor is after the opening tag, check if it's before the closing tag
    if (cursorOffset > c.openEnd) {
      // Find the corresponding {{/each}} for this opening tag
      const tokenRe = /\{\{\s*#each\b|\{\{\s*\/each\s*\}\}/g;
      tokenRe.lastIndex = c.openIndex;
      let depth = 0;
      let t: RegExpExecArray | null;

      while ((t = tokenRe.exec(text)) !== null) {
        const token = t[0];
        if (/^\{\{\s*#each\b/.test(token)) {
          depth++;
        } else {
          depth--;
          if (depth === 0) {
            // Found the corresponding closing tag
            return cursorOffset < t.index;
          }
        }
      }

      // If no closing tag found, assume cursor is inside
      return true;
    }

    return false;
  });

  // Return the innermost (last) valid candidate
  if (validCandidates.length > 0) {
    const result = validCandidates[validCandidates.length - 1];
    return {
      alias: result.alias,
      source: result.source,
      openIndex: result.openIndex
    };
  }

  return null;
}
