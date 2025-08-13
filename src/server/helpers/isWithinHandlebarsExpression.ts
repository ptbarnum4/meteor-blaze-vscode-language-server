// Check if cursor position is within handlebars expression

type IsWithinHandlebarsExpressionResult = {
  isWithin: boolean;
  expressionStart: number;
  expressionEnd: number;
  isTriple: boolean;
  isSingleBracket: boolean;
};

export const isWithinHandlebarsExpression = (
  text: string,
  offset: number
): IsWithinHandlebarsExpressionResult => {
  // Look backwards for opening braces
  let start = -1;
  let isTriple = false;
  let isSingleBracket = false;

  for (let i = offset - 1; i >= 0; i--) {
    if (text.substring(i, i + 3) === '{{{') {
      start = i;
      isTriple = true;
      break;
    } else if (text.substring(i, i + 2) === '{{' && text.substring(i, i + 3) !== '{{{') {
      start = i;
      isTriple = false;
      break;
    } else if (text.charAt(i) === '{' && text.substring(i, i + 2) !== '{{') {
      // Check if this is truly a single bracket (not part of {{)
      // Make sure it's not preceded by another {
      if (i === 0 || text.charAt(i - 1) !== '{') {
        start = i;
        isTriple = false;
        isSingleBracket = true;
        break;
      }
    }
  }

  if (start === -1) {
    return {
      isWithin: false,
      expressionStart: -1,
      expressionEnd: -1,
      isTriple: false,
      isSingleBracket: false
    };
  }

  // For single brackets, we're more permissive - assume they want to type a handlebars expression
  if (isSingleBracket) {
    return {
      isWithin: true,
      expressionStart: start + 1,
      expressionEnd: offset,
      isTriple: false,
      isSingleBracket: true
    };
  }

  // Look forwards for closing braces (existing logic for double/triple brackets)
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
          isTriple,
          isSingleBracket: false
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
        isTriple,
        isSingleBracket: false
      };
    } else {
      // No closing braces found ahead, but we're after opening braces
      // This could be an incomplete expression at the end of the document
      // Be permissive and assume they're typing an expression
      return {
        isWithin: true,
        expressionStart: searchStart,
        expressionEnd: text.length,
        isTriple,
        isSingleBracket: false
      };
    }
  }

  return {
    isWithin: false,
    expressionStart: -1,
    expressionEnd: -1,
    isTriple: false,
    isSingleBracket: false
  };
};
