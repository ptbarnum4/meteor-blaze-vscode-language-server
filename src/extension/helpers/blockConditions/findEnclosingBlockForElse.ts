export const findEnclosingBlockForElse = (
  text: string,
  elseOffset: number
): { type: 'if' | 'unless'; condition: string } | null => {
  // Find all #if, #unless, {{else}}, /if, /unless blocks before the else position
  type Block =
    | {
        type: 'open';
        blockType: 'if' | 'unless';
        condition: string;
        position: number;
        length: number;
      }
    | { type: 'close'; blockType: 'if' | 'unless'; position: number; length: number }
    | { type: 'else'; position: number; length: number };

  const allBlocks: Block[] = [];

  // Match all relevant block patterns
  const patterns = [
    { regex: /\{\{\s*#(if|unless)\s+([^}]+)\s*\}\}/g, isOpening: true },
    { regex: /\{\{\s*\/(if|unless)\s*\}\}/g, isOpening: false },
    { regex: /\{\{\s*else\s*\}\}/g, isElse: true }
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      if (match.index >= elseOffset) {
        break; // Only consider blocks before our else
      }

      if (pattern.isElse) {
        allBlocks.push({
          type: 'else',
          position: match.index,
          length: match[0].length
        });
      } else if (pattern.isOpening) {
        allBlocks.push({
          type: 'open',
          blockType: match[1] as 'if' | 'unless',
          condition: match[2].trim(),
          position: match.index,
          length: match[0].length
        });
      } else {
        allBlocks.push({
          type: 'close',
          blockType: match[1] as 'if' | 'unless',
          position: match.index,
          length: match[0].length
        });
      }
    }
  });

  // Sort by position
  allBlocks.sort((a, b) => a.position - b.position);

  // Track the stack of open blocks
  const stack: Array<{ blockType: 'if' | 'unless'; condition: string; position: number }> = [];

  for (const block of allBlocks) {
    if (block.type === 'open') {
      stack.push({
        blockType: block.blockType,
        condition: block.condition,
        position: block.position
      });
    } else if (block.type === 'close') {
      if (stack.length > 0 && stack[stack.length - 1].blockType === block.blockType) {
        stack.pop();
      }
    }
  }

  // The else we're looking for should be the (elseCount + 1)th else
  // Return the condition from the top of the stack (innermost open block)
  if (stack.length > 0) {
    const enclosingBlock = stack[stack.length - 1];
    return {
      type: enclosingBlock.blockType,
      condition: enclosingBlock.condition
    };
  }

  return null;
};

/**
 * Find the enclosing block for an else and return both condition and start position.
 */
export const findEnclosingBlockForElseWithIndex = (
  text: string,
  elseOffset: number
): { type: 'if' | 'unless'; condition: string; index: number } | null => {
  // Find all #if, #unless, {{else}}, /if, /unless blocks before the else position
  type Block =
    | {
        type: 'open';
        blockType: 'if' | 'unless';
        condition: string;
        position: number;
        length: number;
      }
    | { type: 'close'; blockType: 'if' | 'unless'; position: number; length: number }
    | { type: 'else'; position: number; length: number };

  const allBlocks: Block[] = [];

  // Match all relevant block patterns
  const patterns = [
    { regex: /\{\{\s*#(if|unless)\s+([^}]+)\s*\}\}/g, isOpening: true },
    { regex: /\{\{\s*\/(if|unless)\s*\}\}/g, isOpening: false },
    { regex: /\{\{\s*else\s*\}\}/g, isElse: true }
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      if (match.index >= elseOffset) {
        break; // Only consider blocks before our else
      }

      if (pattern.isElse) {
        allBlocks.push({
          type: 'else',
          position: match.index,
          length: match[0].length
        });
      } else if (pattern.isOpening) {
        allBlocks.push({
          type: 'open',
          blockType: match[1] as 'if' | 'unless',
          condition: match[2].trim(),
          position: match.index,
          length: match[0].length
        });
      } else {
        allBlocks.push({
          type: 'close',
          blockType: match[1] as 'if' | 'unless',
          position: match.index,
          length: match[0].length
        });
      }
    }
  });

  // Sort by position
  allBlocks.sort((a, b) => a.position - b.position);

  // Track the stack of open blocks
  const stack: Array<{ blockType: 'if' | 'unless'; condition: string; position: number }> = [];

  for (const block of allBlocks) {
    if (block.type === 'open') {
      stack.push({
        blockType: block.blockType,
        condition: block.condition,
        position: block.position
      });
    } else if (block.type === 'close') {
      if (stack.length > 0 && stack[stack.length - 1].blockType === block.blockType) {
        stack.pop();
      }
    }
  }

  // The else we're looking for should be the (elseCount + 1)th else
  // Return the condition and position from the top of the stack (innermost open block)
  if (stack.length > 0) {
    const enclosingBlock = stack[stack.length - 1];
    return {
      type: enclosingBlock.blockType,
      condition: enclosingBlock.condition,
      index: enclosingBlock.position
    };
  }

  return null;
};
