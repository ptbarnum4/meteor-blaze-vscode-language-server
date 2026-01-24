import fs from 'fs';
import path from 'path';

/**
 * Extract parameters used within a template HTML content.
 * This function scans for Handlebars expressions like:
 * - {{param1}}
 * - {{this.param2}}
 * - {{helperName param3}}
 * And returns the parameter names used in the template.
 */

export interface ExtractedParameter {
  name: string;
  isOptional: boolean;
  inferredType?: string; // Inferred type based on usage patterns
}

/**
 * Find all block ranges in the template content
 * @param templateContent - The HTML content of the template
 * @returns Array of block ranges with their types and positions
 */
function findBlockRanges(templateContent: string): Array<{
  type: 'with' | 'each' | 'each-in' | 'if' | 'unless';
  start: number;
  end: number;
  param?: string;
  alias?: string;
  source?: string;
}> {
  const blocks: Array<{
    type: 'with' | 'each' | 'each-in' | 'if' | 'unless';
    start: number;
    end: number;
    param?: string;
    alias?: string;
    source?: string;
  }> = [];

  // Find all block helpers and their closing tags
  const blockTypes = ['with', 'each', 'if', 'unless'];

  for (const blockType of blockTypes) {
    const openPattern = new RegExp(
      `\\{\\{\\s*#${blockType}\\b([^}]*)\\}\\}`,
      'g'
    );
    let match;

    while ((match = openPattern.exec(templateContent)) !== null) {
      const openEnd = match.index + match[0].length;
      const params = match[1].trim();

      // Check if it's an each-in block
      const eachInMatch =
        blockType === 'each' &&
        params.match(/^\s*([a-zA-Z_$][\w$]*)\s+in\s+([a-zA-Z_$][\w$]*)/);

      // Find the corresponding closing tag
      let depth = 1;
      const tokenPattern = new RegExp(`\\{\\{\\s*[#/]${blockType}\\b`, 'g');
      tokenPattern.lastIndex = openEnd;

      let closingMatch;
      while ((closingMatch = tokenPattern.exec(templateContent)) !== null) {
        if (closingMatch[0].includes('#')) {
          depth++;
        } else {
          depth--;
          if (depth === 0) {
            const closeStart = closingMatch.index;

            if (eachInMatch) {
              blocks.push({
                type: 'each-in',
                start: openEnd,
                end: closeStart,
                alias: eachInMatch[1],
                source: eachInMatch[2],
              });
            } else if (blockType === 'with' || blockType === 'each') {
              const paramMatch = params.match(/^\s*([a-zA-Z_$][\w$]*)/);
              if (paramMatch) {
                blocks.push({
                  type: blockType as 'with' | 'each',
                  start: openEnd,
                  end: closeStart,
                  param: paramMatch[1],
                });
              }
            } else {
              blocks.push({
                type: blockType as 'if' | 'unless',
                start: openEnd,
                end: closeStart,
              });
            }
            break;
          }
        }
      }
    }
  }

  return blocks;
}

/**
 * Check if a position is inside any block
 * @param position - Position to check
 * @param blocks - Array of block ranges
 * @returns The innermost block containing the position, or null
 */
function findEnclosingBlock(
  position: number,
  blocks: Array<{
    type: 'with' | 'each' | 'each-in' | 'if' | 'unless';
    start: number;
    end: number;
    param?: string;
    alias?: string;
    source?: string;
  }>
): {
  type: 'with' | 'each' | 'each-in' | 'if' | 'unless';
  start: number;
  end: number;
  param?: string;
  alias?: string;
  source?: string;
} | null {
  // Find the innermost block containing the position
  let innermost = null;
  let innermostSize = Infinity;

  for (const block of blocks) {
    if (position >= block.start && position < block.end) {
      const size = block.end - block.start;
      if (size < innermostSize) {
        innermost = block;
        innermostSize = size;
      }
    }
  }

  return innermost;
}

/**
 * Extract parameters from a template's HTML content by analyzing its usage
 * @param templateContent - The HTML content of the template (between <template> tags)
 * @param globalHelpers - List of known global helpers to exclude from parameters
 * @returns Array of parameter names found in the template
 */
export function extractTemplateParameters(
  templateContent: string,
  globalHelpers: string[] = []
): ExtractedParameter[] {
  const parameters = new Set<string>();
  const knownHelpers = new Set([
    // Built-in Meteor/Blaze helpers
    'if',
    'unless',
    'each',
    'with',
    'let',
    'else',
    'Template',
    'Session',
    'Meteor',
    // Built-in Handlebars helpers
    'log',
    'lookup',
    // Common global helpers
    ...globalHelpers,
  ]);

  // First, find all block ranges
  const blocks = findBlockRanges(templateContent);

  // Extract parameters from block helper declarations
  // For #with and #each, the parameter comes from the opening tag
  for (const block of blocks) {
    if (block.type === 'with' && block.param) {
      // {{#with address}} -> address is the param
      parameters.add(block.param);
    } else if (block.type === 'each' && block.param) {
      // {{#each thing}} -> thing is the param
      parameters.add(block.param);
    } else if (block.type === 'each-in' && block.source) {
      // {{#each image in images}} -> images is the param (not image)
      parameters.add(block.source);
    }
  }

  // Pattern 1: Direct variable reference {{paramName}}
  // Matches {{word}} but not {{helper word}}, {{#block}}, {{/block}}, {{> include}}
  const directVarPattern = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;
  let match;

  while ((match = directVarPattern.exec(templateContent)) !== null) {
    const varName = match[1];
    const position = match.index;

    // Exclude block helpers, closing tags, partials, and known helpers
    if (
      !knownHelpers.has(varName) &&
      !varName.startsWith('@') &&
      varName !== 'this' &&
      varName !== 'Template' &&
      varName !== 'Session'
    ) {
      // Check if this variable is inside a with/each block
      const enclosingBlock = findEnclosingBlock(position, blocks);

      // Skip if it's inside a 'with' or 'each' block unless used outside too
      if (
        !enclosingBlock ||
        (enclosingBlock.type !== 'with' && enclosingBlock.type !== 'each')
      ) {
        parameters.add(varName);
      } else {
        // Inside a with/each block - check if it's also used outside
        const outsidePattern = new RegExp(
          `\\{\\{\\s*${varName}(?:\\s|\\.|\\}|\\))`,
          'g'
        );
        let outsideMatch;
        while ((outsideMatch = outsidePattern.exec(templateContent)) !== null) {
          const outsidePos = outsideMatch.index;
          const outsideBlock = findEnclosingBlock(outsidePos, blocks);
          if (!outsideBlock || outsideBlock.start !== enclosingBlock.start) {
            parameters.add(varName);
            break;
          }
        }
      }
    }
  }

  // Pattern 2: Property access {{this.paramName}}
  const thisPropPattern = /\{\{\s*this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

  while ((match = thisPropPattern.exec(templateContent)) !== null) {
    const propName = match[1];
    parameters.add(propName);
  }

  // Pattern 3: Helper parameters {{helperName paramName}}
  // Match {{word1 word2}} or {{word1 word2 word3}} where word2+ are parameters
  const helperParamPattern =
    /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = helperParamPattern.exec(templateContent)) !== null) {
    const helperName = match[1];
    const paramName = match[2];
    const position = match.index;

    // Skip if the helper is actually a block helper keyword that we've already handled
    if (
      helperName === 'if' ||
      helperName === 'unless' ||
      helperName === 'each' ||
      helperName === 'with'
    ) {
      continue;
    }

    // Don't add @index, @key, or other special vars
    if (!paramName.startsWith('@') && paramName !== 'this') {
      // Check if inside an each-in block
      const enclosingBlock = findEnclosingBlock(position, blocks);

      if (enclosingBlock && enclosingBlock.type === 'each-in') {
        // Inside each-in: only add if it's not the alias
        if (paramName !== enclosingBlock.alias) {
          parameters.add(paramName);
        }
      } else {
        parameters.add(paramName);
      }
    }
  }

  // Pattern 4: Property access in conditionals (#if, #unless)
  // These should extract parameters from their conditions
  const conditionalPattern =
    /\{\{#(if|unless)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

  while ((match = conditionalPattern.exec(templateContent)) !== null) {
    const paramName = match[2];
    const position = match.index;

    if (!paramName.startsWith('@') && paramName !== 'this') {
      // Check if inside an each-in block
      const enclosingBlock = findEnclosingBlock(position, blocks);

      if (enclosingBlock && enclosingBlock.type === 'each-in') {
        // Inside each-in: only add if it's not the alias
        if (paramName !== enclosingBlock.alias) {
          parameters.add(paramName);
        }
      } else {
        parameters.add(paramName);
      }
    }
  }

  // Pattern 5: Properties used in subexpressions like {{#if (equals paramName value)}}
  const subexpressionPattern =
    /\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = subexpressionPattern.exec(templateContent)) !== null) {
    const paramName = match[1];
    const position = match.index;

    if (
      !paramName.startsWith('@') &&
      paramName !== 'this' &&
      !knownHelpers.has(paramName)
    ) {
      // Check if inside an each-in block
      const enclosingBlock = findEnclosingBlock(position, blocks);

      if (enclosingBlock && enclosingBlock.type === 'each-in') {
        // Inside each-in: only add if it's not the alias
        if (paramName !== enclosingBlock.alias) {
          parameters.add(paramName);
        }
      } else {
        parameters.add(paramName);
      }
    }
  }

  // Pattern 6: Property lookups like {{varName.property}} or {{image.url}}
  const propertyLookupPattern =
    /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = propertyLookupPattern.exec(templateContent)) !== null) {
    const varName = match[1];
    const position = match.index;

    if (!varName.startsWith('@') && varName !== 'this') {
      // Check if inside an each-in block
      const enclosingBlock = findEnclosingBlock(position, blocks);

      if (enclosingBlock && enclosingBlock.type === 'each-in') {
        // Inside each-in: this is a property lookup on the alias, so it's NOT a param
        // unless it's looking up on something other than the alias
        if (varName !== enclosingBlock.alias) {
          parameters.add(varName);
        }
      } else {
        // Outside each-in or inside other blocks: could be a param
        // But we should be careful - this might be a property access
        // For now, don't add it unless it appears standalone elsewhere
      }
    }
  }

  // Infer types for each parameter based on usage
  const parameterTypes = inferParameterTypes(
    templateContent,
    parameters,
    blocks
  );

  // Convert Set to array of ExtractedParameter objects
  return Array.from(parameters).map((name) => ({
    name,
    isOptional: false,
    inferredType: parameterTypes.get(name) || 'string', // Default to string instead of any
  }));
}

/**
 * Find a template's content in an HTML file
 * @param filePath - Path to the HTML file
 * @param templateName - Name of the template to find
 * @param fs - File system module
 * @returns Template content or null if not found
 */
export function findTemplateContent(
  filePath: string,
  templateName: string
): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Find the specific template block
    const templateBlockRegex = new RegExp(
      `<template\\s+name=["']${templateName}["'][^>]*>([\\s\\S]*?)<\\/template>`,
      'i'
    );
    const match = content.match(templateBlockRegex);

    if (match && match[1]) {
      return match[1];
    }

    return null;
  } catch (error) {
    console.error(`Error finding template content for ${templateName}:`, error);
    return null;
  }
}

/**
 * Infer types for parameters based on their usage patterns in the template
 * @param templateContent - The HTML content of the template
 * @param parameters - Set of parameter names found in the template
 * @param blocks - Array of block ranges in the template
 * @returns Map of parameter names to inferred types
 */
function inferParameterTypes(
  templateContent: string,
  parameters: Set<string>,
  blocks: Array<{
    type: 'with' | 'each' | 'each-in' | 'if' | 'unless';
    start: number;
    end: number;
    param?: string;
    alias?: string;
    source?: string;
  }>
): Map<string, string> {
  const types = new Map<string, string>();

  for (const paramName of parameters) {
    // Find blocks that use this parameter
    const relevantBlocks = blocks.filter(
      (block) =>
        (block.param === paramName || block.source === paramName) &&
        (block.type === 'with' ||
          block.type === 'each' ||
          block.type === 'each-in')
    );

    if (relevantBlocks.length === 0) {
      // No block usage, default to string
      types.set(paramName, 'string');
      continue;
    }

    // Check each block type
    for (const block of relevantBlocks) {
      if (block.type === 'with') {
        // Parameters used in #with are always objects
        const objectType = inferObjectTypeFromBlock(
          templateContent,
          block.start,
          block.end,
          null // No alias for #with blocks
        );
        types.set(paramName, objectType);
      } else if (block.type === 'each') {
        // Parameters used in #each are arrays
        const arrayType = inferArrayTypeFromBlock(
          templateContent,
          block.start,
          block.end,
          block.param || null // The iterator variable
        );
        types.set(paramName, arrayType);
      } else if (block.type === 'each-in') {
        // Parameters used in #each-in are arrays
        const arrayType = inferArrayTypeFromBlock(
          templateContent,
          block.start,
          block.end,
          block.alias || null // The alias variable
        );
        types.set(paramName, arrayType);
      }
    }
  }

  return types;
}

/**
 * Infer object type from properties accessed within a #with or #each block
 * @param templateContent - The HTML content
 * @param blockStart - Start position of the block content
 * @param blockEnd - End position of the block content
 * @param alias - Optional alias for each-in blocks
 * @returns Inferred object type string
 */
function inferObjectTypeFromBlock(
  templateContent: string,
  blockStart: number,
  blockEnd: number,
  alias: string | null
): string {
  const blockContent = templateContent.substring(blockStart, blockEnd);
  const properties = new Set<string>();

  // Find all property accesses in the block
  // Pattern 1: {{propertyName}} - direct property access
  const directPropPattern = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;
  let match;

  while ((match = directPropPattern.exec(blockContent)) !== null) {
    const propName = match[1];
    // Skip special keywords and helpers
    if (
      propName !== 'this' &&
      propName !== 'else' &&
      !propName.startsWith('@') &&
      propName !== alias
    ) {
      properties.add(propName);
    }
  }

  // Pattern 2: {{this.propertyName}} or {{alias.propertyName}}
  const thisPropPattern =
    /\{\{\s*(?:this|([a-zA-Z_$][a-zA-Z0-9_$]*))\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = thisPropPattern.exec(blockContent)) !== null) {
    const prefix = match[1] || 'this';
    const propName = match[2];

    // If it's 'this' or matches the alias, it's a property access on the context
    if (prefix === 'this' || prefix === alias) {
      properties.add(propName);
    }
  }

  // Pattern 3: Property access in helper calls {{helper propertyName}}
  const helperPropPattern =
    /\{\{\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = helperPropPattern.exec(blockContent)) !== null) {
    const propName = match[1];
    if (
      !propName.startsWith('@') &&
      propName !== 'this' &&
      propName !== alias
    ) {
      properties.add(propName);
    }
  }

  if (properties.size === 0) {
    return '{}'; // Empty object
  }

  // Build object type string
  const propStrings = Array.from(properties)
    .sort()
    .map((prop) => `  ${prop}: string`)
    .join('\n  ');

  return `{\n  ${propStrings}\n  }`;
}

/**
 * Infer array type from usage within an #each block
 * @param templateContent - The HTML content
 * @param blockStart - Start position of the block content
 * @param blockEnd - End position of the block content
 * @param iterator - The iterator variable (for #each) or alias (for #each-in)
 * @returns Inferred array type string
 */
function inferArrayTypeFromBlock(
  templateContent: string,
  blockStart: number,
  blockEnd: number,
  iterator: string | null
): string {
  const blockContent = templateContent.substring(blockStart, blockEnd);
  const properties = new Set<string>();
  let hasPropertyAccess = false;

  // Check for property lookups on the iterator
  if (iterator) {
    // Pattern: {{iterator.property}}
    const iteratorPropPattern = new RegExp(
      `\\{\\{\\s*${iterator}\\.([a-zA-Z_$][a-zA-Z0-9_$]*)`,
      'g'
    );
    let match;

    while ((match = iteratorPropPattern.exec(blockContent)) !== null) {
      hasPropertyAccess = true;
      properties.add(match[1]);
    }
  }

  // Also check for {{this.property}} patterns
  const thisPropPattern = /\{\{\s*this\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let match;

  while ((match = thisPropPattern.exec(blockContent)) !== null) {
    hasPropertyAccess = true;
    properties.add(match[1]);
  }

  // If no property access found, it's an array of strings
  if (!hasPropertyAccess) {
    return 'string[]';
  }

  // Build object type for array elements
  if (properties.size === 0) {
    return '{}[]'; // Array of empty objects
  }

  const propStrings = Array.from(properties)
    .sort()
    .map((prop) => `  ${prop}: string;`)
    .join('\n  ');

  return `{\n  ${propStrings}\n  }[]`;
}

/**
 * Extract parameters from a template defined in the same file or nearby files
 * @param templateName - Name of the template
 * @param currentFileUri - URI of the current file
 * @param currentDir - Directory of the current file
 * @param fs - File system module
 * @param path - Path module
 * @param globalHelpers - List of known global helpers
 * @returns Array of extracted parameters
 */
export function extractParametersFromTemplate(
  templateName: string,
  currentFileUri: string,
  currentDir: string,
  globalHelpers: string[] = []
): ExtractedParameter[] {
  const currentFilePath = currentFileUri.replace('file://', '');

  // Try multiple locations for the template
  const possiblePaths = [
    currentFilePath, // Same file
    path.join(currentDir, `${templateName}.html`),
    path.join(currentDir, templateName, 'template.html'),
    path.join(currentDir, templateName, `${templateName}.html`),
    // Also check parent directory
    path.join(path.dirname(currentDir), `${templateName}.html`),
  ];

  for (const filePath of possiblePaths) {
    const templateContent = findTemplateContent(filePath, templateName);

    if (templateContent) {
      return extractTemplateParameters(templateContent, globalHelpers);
    }
  }

  return [];
}
