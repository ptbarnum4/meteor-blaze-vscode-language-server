import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { CurrentConnectionConfig } from '../../types';

/**
 * Creates completion items for Blaze block tags with automatic end tag insertion
 */
export async function createBlockCompletions(
  config: CurrentConnectionConfig,
  trigger: string
): Promise<CompletionItem[]> {
  const completions: CompletionItem[] = [];

  // Get block configuration
  const blockConfig = await config.connection.workspace.getConfiguration('meteorLanguageServer.blockConditions');
  const autoInsertEnabled = blockConfig?.autoInsertEndTags !== false; // Default to true

  if (!autoInsertEnabled) {
    return completions;
  }

  // Default blocks that support auto-insertion
  const defaultBlocks = [
    {
      type: 'if',
      label: 'if',
      description: 'Conditional block with condition',
      snippet: '${1:condition}}\n\t$0\n{{/if}}',
      triggerSnippet: 'if ${1:condition}}\n\t$0\n{{/if}}'
    },
    {
      type: 'unless',
      label: 'unless',
      description: 'Negative conditional block',
      snippet: '${1:condition}}\n\t$0\n{{/unless}}',
      triggerSnippet: 'unless ${1:condition}}\n\t$0\n{{/unless}}'
    },
    {
      type: 'with',
      label: 'with',
      description: 'Context block with data',
      snippet: '${1:data}}\n\t$0\n{{/with}}',
      triggerSnippet: 'with ${1:data}}\n\t$0\n{{/with}}'
    },
    {
      type: 'each',
      label: 'each',
      description: 'Iteration block',
      snippet: '${1:collection}}\n\t$0\n{{/each}}',
      triggerSnippet: 'each ${1:collection}}\n\t$0\n{{/each}}'
    }
  ];

  // Add custom blocks from configuration
  const customBlocks = blockConfig?.extend || [];
  const customBlocksWithAutoInsert = customBlocks.filter((block: any) =>
    block.autoInsertEndTag !== false // Default to true unless explicitly set to false
  );

  // Handle completion within existing blocks
  if (trigger.startsWith('complete-')) {
    const blockType = trigger.replace('complete-', '');

    // Check if it's a default block type
    const defaultBlock = defaultBlocks.find(block => block.type === blockType);
    if (defaultBlock) {
      completions.push({
        label: `{{/${blockType}}}`,
        kind: CompletionItemKind.Snippet,
        detail: `Add missing {{/${blockType}}} closing tag`,
        documentation: {
          kind: 'markdown',
          value: `Adds the missing \`{{/${blockType}}}\` closing tag after the current block`
        },
        insertText: `\n\t$0\n{{/${blockType}}}`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0000${blockType}`, // Highest priority
        preselect: true,
        filterText: '', // Empty filter to make it appear without typing
      });
      return completions;
    }

    // Check if it's a custom block type
    const customBlock = customBlocksWithAutoInsert.find((block: any) => block.type === blockType);
    if (customBlock) {
      completions.push({
        label: `{{/${blockType}}}`,
        kind: CompletionItemKind.Snippet,
        detail: `Add missing {{/${blockType}}} closing tag`,
        documentation: {
          kind: 'markdown',
          value: `Adds the missing \`{{/${blockType}}}\` closing tag after the current block`
        },
        insertText: `\n\t$0\n{{/${blockType}}}`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0000${blockType}`, // Highest priority
        preselect: true,
        filterText: '', // Empty filter to make it appear without typing
      });
      return completions;
    }
  }

  // Create completions for default blocks
  for (const block of defaultBlocks) {
    if (trigger === '#' || block.type.startsWith(trigger.replace('#', ''))) {
      // Use triggerSnippet for discovery mode ({{#)
      // Use snippet for after-space mode ({{#if )
      const insertText = trigger === '#' ? block.triggerSnippet : block.snippet;
      const label = trigger === '#' ? `#${block.type}` : `Complete ${block.type} block`;

      completions.push({
        label,
        kind: CompletionItemKind.Snippet,
        detail: block.description,
        documentation: {
          kind: 'markdown',
          value: `Inserts a \`{{#${block.type}}}\` block with automatic closing tag`
        },
        insertText,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0${block.type}` // Sort blocks first
      });
    } else if (trigger === block.type) {
      // Exact match after space ({{#if )
      completions.push({
        label: `Complete ${block.type} block`,
        kind: CompletionItemKind.Snippet,
        detail: `Auto-complete ${block.type} block`,
        documentation: {
          kind: 'markdown',
          value: `Complete the \`{{#${block.type}}}\` block with automatic closing tag`
        },
        insertText: block.snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0${block.type}`,
        preselect: true
      });
    }
  }

  // Create completions for custom blocks
  for (const block of customBlocksWithAutoInsert) {
    if (trigger === '#' || block.type.startsWith(trigger.replace('#', ''))) {
      const triggerSnippet = `${block.type} \${1:args}}\n\t$0\n{{/${block.type}}}`;
      const snippet = `\${1:args}}\n\t$0\n{{/${block.type}}}`;

      const insertText = trigger === '#' ? triggerSnippet : snippet;
      const label = trigger === '#' ? `#${block.type}` : `Complete ${block.type} block`;

      completions.push({
        label,
        kind: CompletionItemKind.Snippet,
        detail: block.label || `Custom ${block.type} block`,
        documentation: {
          kind: 'markdown',
          value: `Inserts a \`{{#${block.type}}}\` block with automatic closing tag`
        },
        insertText,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `1${block.type}` // Sort custom blocks after default ones
      });
    } else if (trigger === block.type) {
      // Exact match after space ({{#customBlock )
      const snippet = `\${1:args}}\n\t$0\n{{/${block.type}}}`;

      completions.push({
        label: `Complete ${block.type} block`,
        kind: CompletionItemKind.Snippet,
        detail: block.label || `Custom ${block.type} block`,
        documentation: {
          kind: 'markdown',
          value: `Complete the \`{{#${block.type}}}\` block with automatic closing tag`
        },
        insertText: snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `1${block.type}`,
        preselect: true
      });
    }
  }

  return completions;
}

/**
 * Checks if the current position is suitable for block completion
 */
export function shouldProvideBlockCompletion(text: string, offset: number): { shouldProvide: boolean; trigger: string } {
  const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
  const afterCursor = text.substring(offset, Math.min(text.length, offset + 10));

  // Check if we just typed }} and there's a block that needs closing
  if (beforeCursor.endsWith('}}')) {
    // Look back to find the opening block
    const blockStart = beforeCursor.lastIndexOf('{{', beforeCursor.length - 3);
    if (blockStart !== -1) {
      const blockContent = beforeCursor.substring(blockStart);
      const blockMatch = blockContent.match(/\{\{\s*#(\w+)(?:\s+.*)?}\}$/);

      if (blockMatch) {
        const blockType = blockMatch[1];

        // Check if this block already has a closing tag by searching ahead
        const textAfterBlock = text.substring(offset);
        const closingTagPattern = new RegExp(`\\{\\{\\s*\\/${blockType}\\s*\\}\\}`, 'i');

        // First check if there's ANY closing tag in the document
        if (closingTagPattern.test(textAfterBlock)) {
          // There is a closing tag somewhere - now check if we're on the same line
          // Get the line number of the opening block
          const textBeforeBlock = text.substring(0, offset);
          const openingBlockLine = textBeforeBlock.split('\n').length - 1;
          
          // Find the position of the closing tag
          const closingTagMatch = closingTagPattern.exec(textAfterBlock);
          if (closingTagMatch) {
            const closingTagOffset = offset + closingTagMatch.index;
            const textBeforeClosingTag = text.substring(0, closingTagOffset);
            const closingBlockLine = textBeforeClosingTag.split('\n').length - 1;
            
            // If opening and closing are on the same line, don't offer completion
            if (openingBlockLine === closingBlockLine) {
              return { shouldProvide: false, trigger: '' };
            }
          }
          
          // Different lines or couldn't determine - don't offer completion as tag exists
          return { shouldProvide: false, trigger: '' };
        }

        // No closing tag found anywhere - offer completion
        return {
          shouldProvide: true,
          trigger: `complete-${blockType}`
        };
      }
    }
  }

  // Check if we're anywhere within an opening block (for manual completion)
  const lastOpenBrace = beforeCursor.lastIndexOf('{{');
  const lastCloseBrace = beforeCursor.lastIndexOf('}}');

  // Check if we're currently inside handlebars brackets
  if (lastOpenBrace > lastCloseBrace && lastOpenBrace !== -1) {
    const withinBraces = beforeCursor.substring(lastOpenBrace);

    // Check if this is a block helper pattern {{#blockname
    const blockMatch = withinBraces.match(/\{\{\s*#(\w+)(?:\s+.*)?$/);
    if (blockMatch) {
      const blockType = blockMatch[1];

      // Look ahead to see if the block is closed with }}
      const nextCloseBrace = afterCursor.indexOf('}}');
      if (nextCloseBrace !== -1) {
        // Check if this block already has a closing tag by looking for it after the opening block
        const textAfterCursor = text.substring(offset + nextCloseBrace + 2); // After the }}
        const closingTagPattern = new RegExp(`\\{\\{\\s*\\/${blockType}\\s*\\}\\}`, 'i');

        // First check if there's ANY closing tag in the document
        if (closingTagPattern.test(textAfterCursor)) {
          // There is a closing tag somewhere - now check if we're on the same line
          // Get the line number of the opening block
          const textBeforeBlock = text.substring(0, lastOpenBrace);
          const openingBlockLine = textBeforeBlock.split('\n').length - 1;
          
          // Find the position of the closing tag
          const closingTagMatch = closingTagPattern.exec(textAfterCursor);
          if (closingTagMatch) {
            const closingTagOffset = offset + nextCloseBrace + 2 + closingTagMatch.index;
            const textBeforeClosingTag = text.substring(0, closingTagOffset);
            const closingBlockLine = textBeforeClosingTag.split('\n').length - 1;
            
            // If opening and closing are on the same line, don't offer completion
            if (openingBlockLine === closingBlockLine) {
              return { shouldProvide: false, trigger: '' };
            }
          }
          
          // Different lines or couldn't determine - don't offer completion as tag exists
          return { shouldProvide: false, trigger: '' };
        }

        // No closing tag found anywhere - offer completion
        return {
          shouldProvide: true,
          trigger: `complete-${blockType}`
        };
      }
    }
  }

  // Original space-triggered logic
  const blockWithSpaceMatch = beforeCursor.match(/\{\{\s*#(if|unless|with|each)\s+$/);
  if (blockWithSpaceMatch) {
    const blockType = blockWithSpaceMatch[1];
    
    // Check if there's already a closing tag on the same line
    const textFromCursor = text.substring(offset);
    const closingTagPattern = new RegExp(`\\{\\{\\s*\\/${blockType}\\s*\\}\\}`, 'i');
    
    if (closingTagPattern.test(textFromCursor)) {
      // Get line numbers to check if opening and closing are on same line
      const textBeforeCursor = text.substring(0, offset);
      const openingBlockLine = textBeforeCursor.split('\n').length - 1;
      
      const closingTagMatch = closingTagPattern.exec(textFromCursor);
      if (closingTagMatch) {
        const closingTagOffset = offset + closingTagMatch.index;
        const textBeforeClosingTag = text.substring(0, closingTagOffset);
        const closingBlockLine = textBeforeClosingTag.split('\n').length - 1;
        
        // If opening and closing are on the same line, don't offer completion
        if (openingBlockLine === closingBlockLine) {
          return { shouldProvide: false, trigger: '' };
        }
      }
    }
    
    return {
      shouldProvide: true,
      trigger: blockWithSpaceMatch[1]
    };
  }

  // Also check for custom blocks with space
  const customBlockWithSpaceMatch = beforeCursor.match(/\{\{\s*#(\w+)\s+$/);
  if (customBlockWithSpaceMatch) {
    const blockType = customBlockWithSpaceMatch[1];
    
    // Check if there's already a closing tag on the same line
    const textFromCursor = text.substring(offset);
    const closingTagPattern = new RegExp(`\\{\\{\\s*\\/${blockType}\\s*\\}\\}`, 'i');
    
    if (closingTagPattern.test(textFromCursor)) {
      // Get line numbers to check if opening and closing are on same line
      const textBeforeCursor = text.substring(0, offset);
      const openingBlockLine = textBeforeCursor.split('\n').length - 1;
      
      const closingTagMatch = closingTagPattern.exec(textFromCursor);
      if (closingTagMatch) {
        const closingTagOffset = offset + closingTagMatch.index;
        const textBeforeClosingTag = text.substring(0, closingTagOffset);
        const closingBlockLine = textBeforeClosingTag.split('\n').length - 1;
        
        // If opening and closing are on the same line, don't offer completion
        if (openingBlockLine === closingBlockLine) {
          return { shouldProvide: false, trigger: '' };
        }
      }
    }
    
    return {
      shouldProvide: true,
      trigger: customBlockWithSpaceMatch[1]
    };
  }

  // Fallback: Still support "{{#" pattern for discovery
  const blockStartMatch = beforeCursor.match(/\{\{\s*#(\w*)$/);
  if (blockStartMatch && blockStartMatch[1].length === 0) {
    return {
      shouldProvide: true,
      trigger: '#'
    };
  }

  return { shouldProvide: false, trigger: '' };
}
