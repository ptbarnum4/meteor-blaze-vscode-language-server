/**
 * Detect if cursor is within a template comment for autocomplete
 */

export interface TemplateCommentContext {
  isWithin: boolean;
  isFirstComment: boolean; // Only true for first comment in template
  templateName: string | null;
  commentStart: number;
  commentEnd: number;
  currentLine: string;
  cursorInTag: boolean; // True if cursor is at/after @ symbol
  partialTag: string; // e.g., "@par" if user is typing
  lineNumber: number;
}

/**
 * Get context information about cursor position relative to template comments
 */
export function getTemplateCommentContext(
  text: string,
  offset: number
): TemplateCommentContext {
  const defaultContext: TemplateCommentContext = {
    isWithin: false,
    isFirstComment: false,
    templateName: null,
    commentStart: -1,
    commentEnd: -1,
    currentLine: '',
    cursorInTag: false,
    partialTag: '',
    lineNumber: 0,
  };

  // Find if we're inside a Handlebars comment
  // Look for {{!-- ... --}} or {{! ... }}

  // Search backwards for comment start
  let commentStart = -1;
  let commentEnd = -1;
  let isBlockComment = false;

  // Check for block comment {{!-- ... --}}
  for (let i = offset - 1; i >= Math.max(0, offset - 5000); i--) {
    if (
      text[i] === '-' &&
      text[i - 1] === '-' &&
      text[i - 2] === '!' &&
      text[i - 3] === '{' &&
      text[i - 4] === '{'
    ) {
      commentStart = i - 4;
      isBlockComment = true;
      break;
    }
    if (text[i] === '!' && text[i - 1] === '{' && text[i - 2] === '{') {
      commentStart = i - 2;
      isBlockComment = false;
      break;
    }
  }

  if (commentStart === -1) {
    return defaultContext;
  }

  // Search forwards for comment end
  if (isBlockComment) {
    const endPattern = text.indexOf('--}}', offset);
    if (endPattern !== -1) {
      commentEnd = endPattern + 4;
    }
  } else {
    const endPattern = text.indexOf('}}', offset);
    if (endPattern !== -1) {
      commentEnd = endPattern + 2;
    }
  }

  // If we didn't find the end, we might still be typing
  if (commentEnd === -1 || commentEnd < offset) {
    // Check if there's a closing before cursor
    if (isBlockComment) {
      const earlyEnd = text.indexOf('--}}', commentStart);
      if (earlyEnd !== -1 && earlyEnd < offset) {
        return defaultContext; // We're past the comment
      }
    } else {
      const earlyEnd = text.indexOf('}}', commentStart);
      if (earlyEnd !== -1 && earlyEnd < offset) {
        return defaultContext;
      }
    }
  }

  // We are within a comment
  // Now find the parent template
  const templateMatch = findParentTemplate(text, commentStart);

  if (!templateMatch) {
    return defaultContext;
  }

  // Check if this is the first comment in the template
  const isFirst = isFirstCommentInTemplate(
    text,
    templateMatch.start,
    commentStart
  );

  // Get current line content
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const currentLine = text.substring(
    lineStart,
    lineEnd === -1 ? text.length : lineEnd
  );

  // Calculate line number
  const lineNumber = text.substring(0, offset).split('\n').length;

  // Check if cursor is in a tag (at or after @)
  let cursorInTag = false;
  let partialTag = '';

  // Look backwards on current line for @
  const lineOffset = offset - lineStart;
  const linePart = currentLine.substring(0, lineOffset);
  const lastAtIndex = linePart.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    // Check if there's whitespace between @ and cursor
    const afterAt = linePart.substring(lastAtIndex);
    if (!/\s/.test(afterAt)) {
      cursorInTag = true;
      partialTag = afterAt;
    }
  }

  return {
    isWithin: true,
    isFirstComment: isFirst,
    templateName: templateMatch.name,
    commentStart,
    commentEnd: commentEnd === -1 ? offset + 100 : commentEnd,
    currentLine,
    cursorInTag,
    partialTag,
    lineNumber,
  };
}

/**
 * Find the parent template tag before a given position
 */
function findParentTemplate(
  text: string,
  position: number
): { name: string; start: number } | null {
  // Search backwards for <template name="...">
  const beforeText = text.substring(0, position);
  const templateRegex = /<template\s+name=["']([^"']+)["'][^>]*>/gi;

  let lastMatch: { name: string; start: number } | null = null;
  let match;

  while ((match = templateRegex.exec(beforeText)) !== null) {
    lastMatch = {
      name: match[1],
      start: match.index,
    };
  }

  // Make sure we haven't passed a closing </template>
  if (lastMatch) {
    const closingTag = beforeText.indexOf('</template>', lastMatch.start);
    if (closingTag !== -1 && closingTag < position) {
      return null; // We're past the template
    }
  }

  return lastMatch;
}

/**
 * Check if the comment is the first comment within a template
 */
function isFirstCommentInTemplate(
  text: string,
  templateStart: number,
  commentStart: number
): boolean {
  const templateContent = text.substring(templateStart, commentStart);

  // Look for any other comments before this one
  const blockCommentRegex = /\{\{!--/g;
  const inlineCommentRegex = /\{\{!/g;

  // Check for block comments
  const blockMatch = blockCommentRegex.exec(templateContent);
  if (blockMatch) {
    return false;
  }

  // Check for inline comments (but not the start of block comments)
  let inlineMatch;
  while ((inlineMatch = inlineCommentRegex.exec(templateContent)) !== null) {
    // Make sure it's not {{!--
    if (templateContent[inlineMatch.index + 3] !== '-') {
      return false;
    }
  }

  return true;
}

/**
 * Extract comment text from position
 */
export function getCommentTextAtPosition(
  text: string,
  offset: number
): string | null {
  const context = getTemplateCommentContext(text, offset);

  if (!context.isWithin || context.commentStart === -1) {
    return null;
  }

  const commentText = text.substring(context.commentStart, context.commentEnd);

  // Remove comment delimiters
  return commentText
    .replace(/^\{\{!--/, '')
    .replace(/--\}\}$/, '')
    .replace(/^\{\{!/, '')
    .replace(/\}\}$/, '')
    .trim();
}
