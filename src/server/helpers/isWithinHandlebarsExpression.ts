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
      isSingleBracket = false;
      break;
    } else if (text.charAt(i) === '{') {
      // Only consider it a single bracket if:
      // 1. It's not followed by another { (not part of {{)
      // 2. It's not preceded by another { (not part of {{)
      const isFollowedByBrace = i + 1 < text.length && text.charAt(i + 1) === '{';
      const isPrecededByBrace = i > 0 && text.charAt(i - 1) === '{';

      if (!isFollowedByBrace && !isPrecededByBrace) {
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
      // Check if cursor is within the expression (before or within the closing braces)
      if (offset >= searchStart && offset < i + searchPattern.length) {
        return {
          isWithin: true,
          expressionStart: searchStart,
          expressionEnd: i,
          isTriple,
          isSingleBracket: false
        };
      }
      // If cursor is after the closing braces entirely, we're not within the expression
      return {
        isWithin: false,
        expressionStart: -1,
        expressionEnd: -1,
        isTriple: false,
        isSingleBracket: false
      };
    }
  }

  // If no closing braces found, the expression is incomplete/unclosed
  // According to test expectations, we should return false for unclosed expressions
  return {
    isWithin: false,
    expressionStart: -1,
    expressionEnd: -1,
    isTriple: false,
    isSingleBracket: false
  };
};
