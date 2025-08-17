import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { containsMeteorTemplates } from './containsMeteorTemplates';
import getDocumentSettings from './getDocumentSettings';

/**
 * Finds unmatched Blaze block opening tags that don't have corresponding closing tags
 */
async function findUnmatchedBlazeBlocks(text: string, document: TextDocument, config: CurrentConnectionConfig): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  // Get block configuration to determine which blocks require end tags
  const blockConfig = await config.connection.workspace.getConfiguration('meteorLanguageServer.blockConditions');

  // Define default blocks that require end tags (excluding 'let')
  const defaultBlocksRequiringEndTags = new Set(['if', 'unless', 'with', 'each']);

  // Add custom blocks that require end tags from configuration
  const customBlocks = blockConfig?.extend || [];
  const customBlocksRequiringEndTags = new Set(
    customBlocks
      .filter((block: any) => block.requiresEndTag === true)
      .map((block: any) => block.type)
  );

  // Combine default and custom blocks
  const blocksRequiringEndTags = new Set([...defaultBlocksRequiringEndTags, ...customBlocksRequiringEndTags]);

  const stack: Array<{ type: string; match: RegExpExecArray; position: Range }> = [];

  // Find all Blaze block patterns
  const blockPatterns = [
    { regex: /\{\{\s*#(\w+)(?:\s+([^}]*))?\s*\}\}/g, isOpening: true },
    { regex: /\{\{\s*\/(\w+)\s*\}\}/g, isOpening: false }
  ];

  interface BlockMatch {
    type: string;
    blockType: string;
    condition?: string;
    position: Range;
    isOpening: boolean;
  }

  const allBlocks: BlockMatch[] = [];

  // Collect all block patterns
  blockPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = Range.create(startPos, endPos);

      if (pattern.isOpening) {
        allBlocks.push({
          type: 'open',
          blockType: match[1],
          condition: match[2]?.trim(),
          position: range,
          isOpening: true
        });
      } else {
        allBlocks.push({
          type: 'close',
          blockType: match[1],
          position: range,
          isOpening: false
        });
      }
    }
  });

  // Sort by position
  allBlocks.sort((a, b) => {
    if (a.position.start.line !== b.position.start.line) {
      return a.position.start.line - b.position.start.line;
    }
    return a.position.start.character - b.position.start.character;
  });

  // Track open blocks and find unmatched ones
  const openBlocks: Array<{ blockType: string; condition?: string; position: Range }> = [];

  for (const block of allBlocks) {
    if (block.isOpening) {
      openBlocks.push({
        blockType: block.blockType,
        condition: block.condition,
        position: block.position
      });
    } else {
      // Find matching open block
      let matchedIndex = -1;
      for (let i = openBlocks.length - 1; i >= 0; i--) {
        if (openBlocks[i].blockType === block.blockType) {
          // Check if opening and closing blocks are on the same line
          const openingLine = openBlocks[i].position.start.line;
          const closingLine = block.position.start.line;

          if (openingLine === closingLine) {
            // Same line - these blocks are properly closed inline
            matchedIndex = i;
            break;
          } else {
            // Different lines - check for proper nesting
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex >= 0) {
        // Found matching open block, remove it
        openBlocks.splice(matchedIndex, 1);
      } else {
        // Closing block without matching opening block
        let message = `Closing block "{{/${block.blockType}}}" without matching opening block`;

        // If there are open blocks, suggest the most likely correct closing tag
        if (openBlocks.length > 0) {
          const mostRecentOpen = openBlocks[openBlocks.length - 1];
          const conditionText = mostRecentOpen.condition ? ` ${mostRecentOpen.condition}` : '';
          message += `. Did you mean "{{/${mostRecentOpen.blockType}}}" to close "{{#${mostRecentOpen.blockType}${conditionText}}}"?`;
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: block.position,
          message,
          source: 'meteor-blaze'
        });
      }
    }
  }

  // All remaining open blocks are unmatched - but only report errors for blocks that require end tags
  const openBlocksRequiringEndTags = openBlocks.filter(block => blocksRequiringEndTags.has(block.blockType));

  for (let i = 0; i < openBlocksRequiringEndTags.length; i++) {
    const openBlock = openBlocksRequiringEndTags[i];
    const conditionText = openBlock.condition ? ` ${openBlock.condition}` : '';

    let message = `Missing closing tag for "{{#${openBlock.blockType}${conditionText}}}". Expected "{{/${openBlock.blockType}}}"`;

    // If there are other open blocks, show nesting context
    if (openBlocksRequiringEndTags.length > 1) {
      const otherBlocks = openBlocksRequiringEndTags
        .filter((_, index) => index !== i)
        .map(b => {
          const cond = b.condition ? ` ${b.condition}` : '';
          return `#${b.blockType}${cond}`;
        })
        .join(', ');

      message += `. Note: Also missing closing tags for: ${otherBlocks}`;
    }

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: openBlock.position,
      message,
      source: 'meteor-blaze'
    });
  }

  return diagnostics;
}

// Helper function to find duplicate template parameters
function findDuplicateTemplateParameters(
  text: string,
  textDocument: TextDocument
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  try {
    // Find all template inclusions in the document
    const templateInclusionPattern = /\{\{\s*>\s*([a-zA-Z0-9_]+)\b([^}]*)\}\}/g;
    let match;

    while ((match = templateInclusionPattern.exec(text)) !== null) {
      const templateName = match[1];
      const parametersSection = match[2];
      const inclusionStart = match.index;
      const inclusionEnd = match.index + match[0].length;

      // Extract all parameter names from this template inclusion
      const parameterPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
      const usedParams: Array<{ name: string; start: number; end: number }> = [];
      let paramMatch;

      while ((paramMatch = parameterPattern.exec(parametersSection)) !== null) {
        const paramName = paramMatch[1];
        const paramStart = inclusionStart + match[1].length + 3 + paramMatch.index; // 3 for {{>
        const paramEnd = paramStart + paramName.length;

        usedParams.push({
          name: paramName,
          start: paramStart,
          end: paramEnd
        });
      }

      // Check for duplicates
      const seenParams = new Map<string, { start: number; end: number }>();

      for (const param of usedParams) {
        if (seenParams.has(param.name)) {
          // Found a duplicate parameter
          const originalParam = seenParams.get(param.name)!;

          // Create diagnostic for the duplicate (second occurrence)
          const startPos = textDocument.positionAt(param.start);
          const endPos = textDocument.positionAt(param.end);

          const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
              start: startPos,
              end: endPos
            },
            message: `Duplicate parameter '${param.name}' in template inclusion '${templateName}'. This parameter was already specified.`,
            source: 'meteor-blaze'
          };

          diagnostics.push(diagnostic);

          // Also create a diagnostic for the original (first occurrence) as an info
          const originalStartPos = textDocument.positionAt(originalParam.start);
          const originalEndPos = textDocument.positionAt(originalParam.end);

          const originalDiagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Information,
            range: {
              start: originalStartPos,
              end: originalEndPos
            },
            message: `Parameter '${param.name}' is duplicated later in this template inclusion.`,
            source: 'meteor-blaze'
          };

          diagnostics.push(originalDiagnostic);
        } else {
          seenParams.set(param.name, param);
        }
      }
    }
  } catch (error) {
    // If parsing fails, don't add diagnostics to avoid false positives
  }

  return diagnostics;
}

export const validateTextDocument = async (
  config: CurrentConnectionConfig,
  textDocument: TextDocument
): Promise<void> => {
  const settings = await getDocumentSettings(config, textDocument.uri);
  const text = textDocument.getText();

  const diagnostics: Diagnostic[] = [];

  // Only validate documents that contain Meteor templates
  if (containsMeteorTemplates(textDocument)) {
    // Check for unmatched Blaze blocks
    const blazeBlockDiagnostics = await findUnmatchedBlazeBlocks(text, textDocument, config);
    diagnostics.push(...blazeBlockDiagnostics);

    // Check for duplicate template parameters
    const duplicateParamDiagnostics = findDuplicateTemplateParameters(text, textDocument);
    diagnostics.push(...duplicateParamDiagnostics);
  }

  // Send diagnostics to the client
  config.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};
