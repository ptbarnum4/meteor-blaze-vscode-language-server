// Check if cursor position is within handlebars expression

type IsWithinHandlebarsExpressionResult = {
  isWithin: boolean;
  expressionStart: number;
  expressionEnd: number;
  isTriple: boolean;
};

export const isWithinHandlebarsExpression = (
  text: string,
  offset: number
): IsWithinHandlebarsExpressionResult => {
  // Look backwards for opening braces
  let start = -1;
  let isTriple = false;

  for (let i = offset - 1; i >= 0; i--) {
    if (text.substring(i, i + 3) === '{{{') {
      start = i;
      isTriple = true;
      break;
    } else if (text.substring(i, i + 2) === '{{' && text.substring(i, i + 3) !== '{{{') {
      start = i;
      isTriple = false;
      break;
    }
  }

  if (start === -1) {
    return { isWithin: false, expressionStart: -1, expressionEnd: -1, isTriple: false };
  }

  // Look forwards for closing braces
  const searchPattern = isTriple ? '}}}' : '}}';
  const searchStart = start + (isTriple ? 3 : 2);

  for (let i = searchStart; i <= text.length - searchPattern.length; i++) {
    if (text.substring(i, i + searchPattern.length) === searchPattern) {
      // Check if cursor is within the expression
      if (offset >= searchStart && offset <= i) {
        return {
          isWithin: true,
          expressionStart: searchStart,
          expressionEnd: i,
          isTriple
        };
      }
      break;
    }
  }

  // If no closing braces found, check if we might be in an incomplete expression
  // This handles cases where user is typing: {{  <cursor>
  if (offset >= searchStart) {
    // Look ahead to see if there are closing braces somewhere later
    const remainingText = text.substring(offset);
    const nextClosing = remainingText.indexOf(searchPattern);

    if (nextClosing !== -1) {
      // There are closing braces ahead, we're probably in an incomplete expression
      return {
        isWithin: true,
        expressionStart: searchStart,
        expressionEnd: offset + nextClosing,
        isTriple
      };
    } else {
      // No closing braces found ahead, but we're after opening braces
      // This could be an incomplete expression at the end of the document
      // Be permissive and assume they're typing an expression
      return {
        isWithin: true,
        expressionStart: searchStart,
        expressionEnd: text.length,
        isTriple
      };
    }
  }

  return { isWithin: false, expressionStart: -1, expressionEnd: -1, isTriple: false };
};
