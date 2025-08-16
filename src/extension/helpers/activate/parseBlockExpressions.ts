import vscode from 'vscode';
/**
 * Parses Blaze block expressions and adds semantic tokens to the builder.
 * Handles both block helpers and regular expressions.
 * @param tokensBuilder The SemanticTokensBuilder to add tokens to.
 * @param startPos The starting position of the expression in the document.
 * @param match The regex match array containing the full expression.
 */
const parseBlockExpressions = (
  tokensBuilder: vscode.SemanticTokensBuilder,
  startPos: vscode.Position,
  match: RegExpExecArray
) => {
  // Handle regular expressions like {{pad box}} or {{helper arg1 arg2}}
  const expressionContent = match[0].slice(2, -2).trim(); // Remove {{ and }}

  // Special handling for {{else}} - highlight as blazeBlockName
  if (expressionContent === 'else') {
    const contentStart = startPos.character + 2;
    const leadingWhitespace = match[0].slice(2).match(/^\s*/);
    const elseStart = leadingWhitespace ? contentStart + leadingWhitespace[0].length : contentStart;
    tokensBuilder.push(startPos.line, elseStart, 4, 2); // blazeBlockName (same as block names)
    return;
  }

  // Handle other expressions
  const tokens = expressionContent.split(/\s+/).filter(token => token.length > 0);

  if (!tokens.length) {
    // No valid tokens to process
    return;
  }

  const contentStart = startPos.character + 2;
  let currentOffset = 0;

  // Find the actual start position of content (skip whitespace)
  const leadingWhitespace = match[0].slice(2).match(/^\s*/);
  if (leadingWhitespace) {
    currentOffset = leadingWhitespace[0].length;
  }

  if (tokens.length === 1) {
    // Single token - use blazeExpression for the whole thing
    const tokenPosition = expressionContent.indexOf(tokens[0], currentOffset);
    const tokenStart = contentStart + tokenPosition;
    tokensBuilder.push(startPos.line, tokenStart, tokens[0].length, 7); // blazeExpression
    return;
  }
  // Multiple tokens - follow block condition pattern
  tokens.forEach((token, index) => {
    const tokenPosition = expressionContent.indexOf(token, currentOffset);
    const tokenStart = contentStart + tokenPosition;

    if (index === 0) {
      // First argument gets blazeBlockFirstArg
      tokensBuilder.push(startPos.line, tokenStart, token.length, 4); // blazeBlockFirstArg
    } else {
      // Subsequent arguments get blazeBlockArgs
      tokensBuilder.push(startPos.line, tokenStart, token.length, 5); // blazeBlockArgs
    }

    currentOffset = tokenPosition + token.length;
  });
};

export default parseBlockExpressions;
