import {
  FoldingRange,
  FoldingRangeParams,
} from 'vscode-languageserver/node.js';

import { CurrentConnectionConfig } from '../../types/index.js';

const onFoldingRanges = (config: CurrentConnectionConfig) => {
  return (params: FoldingRangeParams): FoldingRange[] => {
    const document = config.documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const text = document.getText();
    const lines = text.split('\n');
    const foldingRanges: FoldingRange[] = [];

    // Stack to track opening blocks
    interface BlockInfo {
      name: string;
      startLine: number;
      startChar: number;
    }
    const blockStack: BlockInfo[] = [];

    // Regex patterns for Blaze block helpers
    // Opening tags: {{#if}}, {{#each}}, {{#unless}}, {{#with}}, {{#let}}
    const openBlockRegex =
      /\{\{#(if|each|unless|with|let|autoform|afQuickField|afEachArrayItem|afFieldInput|afDeleteButton)\b[^}]*\}\}/g;
    // Closing tags: {{/if}}, {{/each}}, etc.
    const closeBlockRegex =
      /\{\{\/(if|each|unless|with|let|autoform|afQuickField|afEachArrayItem|afFieldInput|afDeleteButton)\}\}/g;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Find all opening blocks in this line
      let match: RegExpExecArray | null;
      openBlockRegex.lastIndex = 0;
      while ((match = openBlockRegex.exec(line)) !== null) {
        const blockName = match[1];
        blockStack.push({
          name: blockName,
          startLine: lineIndex,
          startChar: match.index,
        });
      }

      // Find all closing blocks in this line
      closeBlockRegex.lastIndex = 0;
      while ((match = closeBlockRegex.exec(line)) !== null) {
        const blockName = match[1];

        // Pop from stack and create folding range
        // Find the most recent matching opening block
        for (let i = blockStack.length - 1; i >= 0; i--) {
          if (blockStack[i].name === blockName) {
            const openBlock = blockStack[i];
            blockStack.splice(i, 1);

            // Only create folding range if it spans multiple lines
            if (lineIndex > openBlock.startLine) {
              foldingRanges.push({
                startLine: openBlock.startLine,
                endLine: lineIndex,
                kind: undefined, // Can be 'comment', 'imports', or 'region'
              });
            }
            break;
          }
        }
      }
    }

    return foldingRanges;
  };
};

export default onFoldingRanges;
