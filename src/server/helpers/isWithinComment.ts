// Check if cursor position is within any type of comment

type CommentType = 'html' | 'handlebars-block' | 'handlebars-inline' | 'javascript-line' | 'javascript-block' | 'typescript-line' | 'typescript-block';

type IsWithinCommentResult = {
  isWithin: boolean;
  commentType: CommentType | null;
  commentStart: number;
  commentEnd: number;
};

export const isWithinComment = (
  text: string,
  offset: number
): IsWithinCommentResult => {
  // Check for HTML comments: <!-- -->
  const htmlCommentResult = checkHtmlComment(text, offset);
  if (htmlCommentResult.isWithin) {
    return htmlCommentResult;
  }

  // Check for Handlebars comments: {{!-- --}} and {{! }}
  const handlebarsCommentResult = checkHandlebarsComment(text, offset);
  if (handlebarsCommentResult.isWithin) {
    return handlebarsCommentResult;
  }

  // Check for JavaScript/TypeScript comments: // and /* */
  const jsCommentResult = checkJavaScriptComment(text, offset);
  if (jsCommentResult.isWithin) {
    return jsCommentResult;
  }

  return {
    isWithin: false,
    commentType: null,
    commentStart: -1,
    commentEnd: -1
  };
};

function checkHtmlComment(text: string, offset: number): IsWithinCommentResult {
  // Look backwards for HTML comment start
  let htmlCommentStart = -1;
  for (let i = offset; i >= 4; i--) {
    if (text.substring(i - 4, i) === '<!--') {
      htmlCommentStart = i - 4;
      break;
    }
  }

  if (htmlCommentStart === -1) {
    return { isWithin: false, commentType: null, commentStart: -1, commentEnd: -1 };
  }

  // Look for the end
  let htmlCommentEnd = -1;
  for (let i = htmlCommentStart + 4; i <= text.length - 3; i++) {
    if (text.substring(i, i + 3) === '-->') {
      htmlCommentEnd = i + 3;
      break;
    }
  }

  // Check if cursor is within the comment
  if (htmlCommentEnd === -1) {
    // Unclosed comment
    if (offset >= htmlCommentStart) {
      return {
        isWithin: true,
        commentType: 'html',
        commentStart: htmlCommentStart,
        commentEnd: text.length
      };
    }
  } else if (offset >= htmlCommentStart && offset < htmlCommentEnd) {
    return {
      isWithin: true,
      commentType: 'html',
      commentStart: htmlCommentStart,
      commentEnd: htmlCommentEnd
    };
  }

  return { isWithin: false, commentType: null, commentStart: -1, commentEnd: -1 };
}

function checkHandlebarsComment(text: string, offset: number): IsWithinCommentResult {
  // Check for block comment {{!-- --}}
  let blockCommentStart = -1;
  for (let i = offset; i >= 5; i--) {
    if (text.substring(i - 5, i) === '{{!--') {
      blockCommentStart = i - 5;
      break;
    }
  }

  if (blockCommentStart !== -1) {
    // Look for block comment end
    let blockCommentEnd = -1;
    for (let i = blockCommentStart + 5; i <= text.length - 4; i++) {
      if (text.substring(i, i + 4) === '--}}') {
        blockCommentEnd = i + 4;
        break;
      }
    }

    if (blockCommentEnd === -1) {
      // Unclosed block comment
      if (offset >= blockCommentStart) {
        return {
          isWithin: true,
          commentType: 'handlebars-block',
          commentStart: blockCommentStart,
          commentEnd: text.length
        };
      }
    } else if (offset >= blockCommentStart && offset < blockCommentEnd) {
      return {
        isWithin: true,
        commentType: 'handlebars-block',
        commentStart: blockCommentStart,
        commentEnd: blockCommentEnd
      };
    }
  }

  // Check for inline comment {{! }}
  let inlineCommentStart = -1;
  for (let i = offset; i >= 3; i--) {
    if (text.substring(i - 3, i) === '{{!') {
      // Make sure it's not the start of a block comment {{!--
      if (i < text.length && text.charAt(i) !== '-') {
        inlineCommentStart = i - 3;
        break;
      }
    }
  }

  if (inlineCommentStart !== -1) {
    // Look for inline comment end - need to handle nested {{ }} within the comment
    let inlineCommentEnd = -1;
    let braceDepth = 1; // We've already seen the opening {{

    for (let i = inlineCommentStart + 3; i <= text.length - 2; i++) {
      const twoChar = text.substring(i, i + 2);

      if (twoChar === '{{') {
        braceDepth++;
        i++; // Skip next char since we've already processed it
      } else if (twoChar === '}}') {
        braceDepth--;
        if (braceDepth === 0) {
          inlineCommentEnd = i + 2;
          break;
        }
        i++; // Skip next char since we've already processed it
      }
    }

    if (inlineCommentEnd === -1) {
      // Unclosed inline comment
      if (offset >= inlineCommentStart) {
        return {
          isWithin: true,
          commentType: 'handlebars-inline',
          commentStart: inlineCommentStart,
          commentEnd: text.length
        };
      }
    } else if (offset >= inlineCommentStart && offset < inlineCommentEnd) {
      return {
        isWithin: true,
        commentType: 'handlebars-inline',
        commentStart: inlineCommentStart,
        commentEnd: inlineCommentEnd
      };
    }
  }

  return { isWithin: false, commentType: null, commentStart: -1, commentEnd: -1 };
}

function checkJavaScriptComment(text: string, offset: number): IsWithinCommentResult {
  // Check for line comment //
  let lineCommentStart = -1;
  for (let i = offset; i >= 2; i--) {
    if (text.substring(i - 2, i) === '//') {
      lineCommentStart = i - 2;
      break;
    }
    // Stop at newline (line comments don't cross lines)
    if (text.charAt(i - 1) === '\n') {
      break;
    }
  }

  if (lineCommentStart !== -1) {
    // Find end of line
    let lineCommentEnd = text.length;
    for (let i = lineCommentStart + 2; i < text.length; i++) {
      if (text.charAt(i) === '\n') {
        lineCommentEnd = i;
        break;
      }
    }

    if (offset >= lineCommentStart && offset < lineCommentEnd) {
      return {
        isWithin: true,
        commentType: 'javascript-line',
        commentStart: lineCommentStart,
        commentEnd: lineCommentEnd
      };
    }
  }

  // Check for block comment /* */
  let blockCommentStart = -1;
  for (let i = offset; i >= 2; i--) {
    if (text.substring(i - 2, i) === '/*') {
      blockCommentStart = i - 2;
      break;
    }
  }

  if (blockCommentStart !== -1) {
    // Look for block comment end
    let blockCommentEnd = -1;
    for (let i = blockCommentStart + 2; i <= text.length - 2; i++) {
      if (text.substring(i, i + 2) === '*/') {
        blockCommentEnd = i + 2;
        break;
      }
    }

    if (blockCommentEnd === -1) {
      // Unclosed block comment
      if (offset >= blockCommentStart) {
        return {
          isWithin: true,
          commentType: 'javascript-block',
          commentStart: blockCommentStart,
          commentEnd: text.length
        };
      }
    } else if (offset >= blockCommentStart && offset < blockCommentEnd) {
      return {
        isWithin: true,
        commentType: 'javascript-block',
        commentStart: blockCommentStart,
        commentEnd: blockCommentEnd
      };
    }
  }

  return { isWithin: false, commentType: null, commentStart: -1, commentEnd: -1 };
}
