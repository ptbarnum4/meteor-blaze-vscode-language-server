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
  isOptional: boolean; // For now, all extracted parameters are considered required
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
    'Template',
    'Session',
    'Meteor',
    // Built-in Handlebars helpers
    'log',
    'lookup',
    // Common global helpers
    ...globalHelpers
  ]);

  // Pattern 1: Direct variable reference {{paramName}}
  // Matches {{word}} but not {{helper word}}, {{#block}}, {{/block}}, {{> include}}
  const directVarPattern = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;
  let match;

  while ((match = directVarPattern.exec(templateContent)) !== null) {
    const varName = match[1];

    // Exclude block helpers, closing tags, partials, and known helpers
    if (
      !knownHelpers.has(varName) &&
      !varName.startsWith('@') && // Exclude special variables like @index, @key
      varName !== 'this' &&
      varName !== 'Template' &&
      varName !== 'Session'
    ) {
      parameters.add(varName);
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
  const helperParamPattern = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = helperParamPattern.exec(templateContent)) !== null) {
    const helperName = match[1];
    const paramName = match[2];

    // Only add paramName if helperName is a known helper or looks like a helper
    // This prevents adding both parts of a "{{firstName lastName}}" scenario where both are params
    if (knownHelpers.has(helperName) || helperName === 'formatNumber' || helperName === 'format') {
      // Don't add @index, @key, or other special vars
      if (!paramName.startsWith('@') && paramName !== 'this') {
        parameters.add(paramName);
      }
    }
  }

  // Pattern 4: Property access in conditionals and each blocks
  // {{#if paramName}}, {{#unless paramName}}, {{#each paramName}}
  const blockHelperPattern = /\{\{#(if|unless|each|with)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

  while ((match = blockHelperPattern.exec(templateContent)) !== null) {
    const paramName = match[2];

    if (!paramName.startsWith('@') && paramName !== 'this') {
      parameters.add(paramName);
    }
  }

  // Pattern 5: Properties used in subexpressions like {{#if (equals paramName value)}}
  const subexpressionPattern = /\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  while ((match = subexpressionPattern.exec(templateContent)) !== null) {
    const paramName = match[1];

    if (!paramName.startsWith('@') && paramName !== 'this' && !knownHelpers.has(paramName)) {
      parameters.add(paramName);
    }
  }

  // Convert Set to array of ExtractedParameter objects
  return Array.from(parameters).map(name => ({
    name,
    isOptional: false // Parameters extracted from usage are assumed required
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
  templateName: string,
  fs: any
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
  fs: any,
  path: any,
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
    path.join(path.dirname(currentDir), `${templateName}.html`)
  ];

  for (const filePath of possiblePaths) {
    const templateContent = findTemplateContent(filePath, templateName, fs);

    if (templateContent) {
      return extractTemplateParameters(templateContent, globalHelpers);
    }
  }

  return [];
}
