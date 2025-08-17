/**
 * Gets the start and end positions of all block helpers in the given text.
 * This is used to determine where to apply semantic tokens for block helpers.
 * @param text The text content of the document.
 * @returns An array of objects with start and end positions of each block helper.
 */
const getBlockRanges = (text: string): { start: number; end: number }[] => {
  // Find all block helper ranges (start/end positions)
  const blockRanges: { start: number; end: number }[] = [];
  const blockStartRegex = /\{\{#(\w+)/g;
  const blockEndRegex = /\{\{\/(\w+)\}\}/g;
  let blockMatch;
  while ((blockMatch = blockStartRegex.exec(text)) !== null) {
    const blockType = blockMatch[1];
    const startIdx = blockMatch.index;
    blockEndRegex.lastIndex = startIdx;
    let endMatch;
    while ((endMatch = blockEndRegex.exec(text)) !== null) {
      if (endMatch[1] === blockType) {
        blockRanges.push({ start: startIdx, end: endMatch.index + endMatch[0].length });
        break;
      }
    }
  }

  return blockRanges;
};

export default getBlockRanges;
