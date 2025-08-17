import vscode from 'vscode';

/**
 * Parses Blaze block conditions and adds semantic tokens to the builder.
 * Handles block names, arguments, and special cases like 'in'.
 * @param tokensBuilder The SemanticTokensBuilder to add tokens to.
 * @param startPos The starting position of the block condition in the document.
 * @param match The regex match array containing the full block condition.
 */
const parseBlockConditions = (
  tokensBuilder: vscode.SemanticTokensBuilder,
  startPos: vscode.Position,
  match: RegExpExecArray
) => {
  tokensBuilder.push(startPos.line, startPos.character + 2, 1, 1); // blazeBlockHash
  const blockNameMatch = /^\{\{[#/](\w+)/.exec(match[0]);
  if (!blockNameMatch) {
    return;
  }

  // Extract block name and arguments
  const blockNameStart = startPos.character + 3;
  const blockNameLength = blockNameMatch[1].length;
  tokensBuilder.push(startPos.line, blockNameStart, blockNameLength, 2); // blazeBlockName

  // Extract arguments after the block name
  const afterBlockName = match[0].slice(2 + 1 + blockNameLength, match[0].length - 2);
  const argsMatch = /^\s*(.+)$/.exec(afterBlockName);

  if (!argsMatch || !argsMatch[1].length) {
    return;
  }

  // Handle arguments
  const argsStart = blockNameStart + blockNameLength + afterBlockName.indexOf(argsMatch[1]);
  const argsTokens = argsMatch[1].split(/\s+/);

  let offset = 0;

  const blockTypes = ['if', 'each', 'unless', 'with', 'markdown'];

  // Single argument case
  if (argsTokens.length === 1 && argsTokens[0].length > 0) {
    tokensBuilder.push(startPos.line, argsStart, argsTokens[0].length, 3); // blazeBlockSingleArg
    return;
  }

  // Multiple arguments
  argsTokens.forEach((arg, i) => {
    if (!arg.length) {
      return;
    }
    // Find the position of the argument in the original string
    const argPos = argsMatch[1].indexOf(arg, offset);
    let tokenType = i === 0 ? 4 : 5;

    // Special case for 'in' keyword in block names
    if (arg === 'in' && blockTypes.includes(blockNameMatch[1])) {
      tokenType = 6;
    }
    // Push the token for this argument
    tokensBuilder.push(startPos.line, argsStart + argPos, arg.length, tokenType);

    // Update the offset for the next argument
    offset = argPos + arg.length;
  });
};

export default parseBlockConditions;
