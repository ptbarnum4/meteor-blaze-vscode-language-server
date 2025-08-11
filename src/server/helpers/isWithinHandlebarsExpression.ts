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

  return { isWithin: false, expressionStart: -1, expressionEnd: -1, isTriple: false };
};
