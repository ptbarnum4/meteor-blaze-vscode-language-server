export const findMatchingBlockCondition = (
  textBeforeEndBlock: string,
  blockType: string
): string | null => {
  // Stack to track nested block pairs
  const stack: string[] = [];

  // Find all block patterns, working backwards
  // Allow blocks with or without a condition
  const blockRegex = new RegExp(
    `\\{\\{\\s*(#${blockType}|\\/${blockType})(?:\\s+([^}]*)?)?\\s*\\}\\}`,
    'g'
  );
  const matches: { type: string; condition: string; index: number }[] = [];

  let match;
  while ((match = blockRegex.exec(textBeforeEndBlock)) !== null) {
    const type = match[1];
    const condition = match[2] ? match[2].trim() : '';
    matches.push({ type, condition, index: match.index });
  }

  // Process matches in reverse order (from end to beginning)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { type, condition } = matches[i];

    if (type === `/${blockType}`) {
      // Push closing block onto stack
      stack.push(`end${blockType}`);
    } else if (type === `#${blockType}`) {
      if (stack.length > 0) {
        // Pop matching end block
        stack.pop();
      } else {
        // This is our matching opening block
        return condition;
      }
    }
  }

  return null;
};

/**
 * Find the matching block condition and its position for a given end block.
 * This version returns both the condition text and the index of the start block.
 */
export const findMatchingBlockConditionWithIndex = (
  textBeforeEndBlock: string,
  blockType: string
): { condition: string; index: number } | null => {
  // Stack to track nested block pairs
  const stack: string[] = [];

  // Find all block patterns, working backwards
  // Allow blocks with or without a condition
  const blockRegex = new RegExp(
    `\\{\\{\\s*(#${blockType}|\\/${blockType})(?:\\s+([^}]*)?)?\\s*\\}\\}`,
    'g'
  );
  const matches: { type: string; condition: string; index: number }[] = [];

  let match;
  while ((match = blockRegex.exec(textBeforeEndBlock)) !== null) {
    const type = match[1];
    const condition = match[2] ? match[2].trim() : '';
    matches.push({ type, condition, index: match.index });
  }

  // Process matches in reverse order (from end to beginning)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { type, condition, index } = matches[i];

    if (type === `/${blockType}`) {
      // Push closing block onto stack
      stack.push(`end${blockType}`);
    } else if (type === `#${blockType}`) {
      if (stack.length > 0) {
        // Pop matching end block
        stack.pop();
      } else {
        // This is our matching opening block
        return { condition, index };
      }
    }
  }

  return null;
};
