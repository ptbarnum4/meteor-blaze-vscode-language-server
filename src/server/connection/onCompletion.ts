import fsSync from 'fs'; // for existsSync and where sync is needed
import path from 'path';
const fs = fsSync.promises; // where available, read files async

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { analyzeGlobalHelpers } from '../helpers/analyzeGlobalHelpers';
import { createBlockCompletions, shouldProvideBlockCompletion } from '../helpers/autoInsertEndTags';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '../helpers/findEnclosingEachInContext';
import { findEnclosingIfOrUnlessBlock } from '../helpers/findEnclosingIfOrUnlessBlock';
import { isWithinComment } from '../helpers/isWithinComment';
import { isWithinHandlebarsExpression } from '../helpers/isWithinHandlebarsExpression';

const onCompletion = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    // Only provide Meteor/Blaze completions for HTML template files
    const uri = document.uri;
    const isHtmlFile = /\.(html|htm|meteor)$/i.test(uri);
    if (!isHtmlFile) {
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    // Check if we're inside any type of comment (HTML, Handlebars, JS/TS)
    const commentInfo = isWithinComment(text, offset);
    if (commentInfo.isWithin) {
      return []; // Don't provide completions inside comments
    }

    // Only provide Meteor completions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      return [];
    }

    // Check if cursor is within handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);

    // Check if we're in a template inclusion context ({{> templateName)
    const textBeforeCursor = text.substring(0, offset);
    const templateInclusionMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]*)$/);
    const isTemplateInclusion = templateInclusionMatch !== null;
    const partialTemplateName = templateInclusionMatch ? templateInclusionMatch[1] : '';

    // Check if we're inside template inclusion parameters ({{> templateName [cursor is here] }})
    // Look for the most recent {{> templateName that hasn't been closed yet
    const templateParameterMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)(?:[^{}])*$/);

    // Check if we're positioned after an equals sign with only whitespace (indicating we want parameter suggestions, not values)
    // This handles cases like: title=   |cursor  where user wants to see next parameter options
    const afterEqualsWithWhitespaceMatch = textBeforeCursor.match(/=\s*$/);
    const isAfterEqualsWithWhitespace = afterEqualsWithWhitespaceMatch !== null;

    // Check if we're positioned after an equals sign with actual content (indicating we're providing a value)
    const afterEqualsWithContentMatch = textBeforeCursor.match(/=\s*[^}\s]+$/);
    const isAfterEqualsWithContent = afterEqualsWithContentMatch !== null;

    // We're in template parameter context if:
    // 1. We found a template parameter match
    // 2. We're not completing the template name itself (isTemplateInclusion is false)
    // 3. We're either not after an equals sign, or we're after equals with only whitespace
    const isTemplateParameter =
      templateParameterMatch !== null &&
      !isTemplateInclusion &&
      (!isAfterEqualsWithContent || isAfterEqualsWithWhitespace);
    const templateNameForParams = templateParameterMatch ? templateParameterMatch[1] : '';

    // If we're in a template inclusion context, provide template name completions
    if (isTemplateInclusion) {
      const templateCompletions = await getTemplateNameCompletions(
        config,
        partialTemplateName,
        document
      );
      return templateCompletions;
    }

    // If we're in template parameter context, provide parameter completions
    if (isTemplateParameter) {
      const parameterCompletions = await getTemplateParameterCompletions(
        config,
        templateNameForParams,
        document,
        textBeforeCursor
      );
      return parameterCompletions;
    }

    // Only continue with regular completion if we're within handlebars and not in template contexts
    if (!handlebarsInfo.isWithin) {
      return [];
    }

    const completions: CompletionItem[] = [];

    // Check if we should provide block completions (for {{#block}} patterns)
    const blockCompletion = shouldProvideBlockCompletion(text, offset);
    if (blockCompletion.shouldProvide) {
      const blockCompletions = await createBlockCompletions(config, blockCompletion.trigger);

      // For auto-triggered completions (when typing }}), return immediately
      if (blockCompletion.trigger.startsWith('complete-')) {
        return blockCompletions;
      }

      completions.push(...blockCompletions);

      // If we have an exact block match (space-triggered), return focused results
      if (blockCompletion.trigger !== '#' && blockCompletions.length > 0) {
        return blockCompletions.filter((comp: CompletionItem) => comp.preselect === true);
      }
    }

    // Get base file name for cross-file analysis
    const filePath = document.uri.replace('file://', '');
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(
      /<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/
    );
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    if (currentTemplateName) {
      // Add helpers from analyzed files using directory-specific lookup strategies
      const dirLookupKeys = [`${dir}/${currentTemplateName}`, `${dir}/${baseName}`].filter(Boolean);

      dirLookupKeys.forEach(key => {
        const helpers = config.fileAnalysis.jsHelpers.get(key as string);

        if (helpers) {
          helpers.forEach(helper => {
            // Avoid duplicates
            if (!completions.find(c => c.label === helper)) {
              const sourceFile = key.split('/').pop(); // Get just the filename from the key
              completions.push({
                label: helper,
                kind: CompletionItemKind.Function,
                detail: `Template helper from ${sourceFile}`,
                documentation: `Helper function: ${helper}`
              });
            }
          });
        }
        // Add data properties from analyzed types
        const dataProps = config.fileAnalysis.dataProperties?.get(key as string) || [];
        if (dataProps.length) {
          dataProps.forEach(p => {
            if (!completions.find(c => c.label === p)) {
              completions.push({
                label: p,
                kind: CompletionItemKind.Field,
                detail: 'Template data property',
                documentation: `Data property available to the template: ${p}`
              });
            }
          });
        }
      });

      // Add global helpers from Template.registerHelper
      // Find workspace root by looking for package.json or .meteor directory
      const currentFileUri = textDocumentPosition.textDocument.uri;
      const currentFilePath = currentFileUri.replace('file://', '');
      let workspaceRoot = path.dirname(currentFilePath);

      // Walk up the directory tree to find workspace root
      let maxIterations = 10; // Safety limit to prevent infinite loops
      while (workspaceRoot !== path.dirname(workspaceRoot) && maxIterations > 0) {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        const meteorPath = path.join(workspaceRoot, '.meteor');

        if (require('fs').existsSync(packageJsonPath) || require('fs').existsSync(meteorPath)) {
          break;
        }

        workspaceRoot = path.dirname(workspaceRoot);
        maxIterations--;
      }

      try {
        // Add timeout to prevent hanging during tests or large projects
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Global helpers analysis timed out')), 5000);
        });

        const globalHelpersResult = await Promise.race([
          analyzeGlobalHelpers(workspaceRoot),
          timeoutPromise
        ]);

        globalHelpersResult.helperDetails.forEach(helper => {
          // Avoid duplicates with existing completions
          if (!completions.find(c => c.label === helper.name)) {
            const documentation =
              helper.jsdoc || `Globally registered template helper: ${helper.name}`;
            completions.push({
              label: helper.name,
              kind: CompletionItemKind.Function,
              detail: `Global template helper ${helper.name}`,
              documentation: helper.jsdoc
                ? { kind: MarkupKind.Markdown, value: helper.jsdoc }
                : documentation
            });
          }
        });
      } catch (error) {
        connection.console.error(`Error analyzing global helpers: ${error}`);
      }

      // Fetch config for blockConditions and blazeHelpers
      let blockTypes = [
        { type: 'if', label: 'if' },
        { type: 'each', label: 'each' },
        { type: 'unless', label: 'unless' },
        { type: 'with', label: 'with' }
      ];

      // Check if we're inside an #each block for @-prefixed helpers
      const eachContext = findEnclosingEachInContext(text, offset);
      const isInsideEachBlock = eachContext !== null;

      // Check if we're inside an #if or #unless block for else helper
      const ifUnlessContext = findEnclosingIfOrUnlessBlock(text, offset);
      const isInsideIfOrUnlessBlock = ifUnlessContext.isInside;

      // Built-in blaze helpers
      let blazeHelpers = [
        { name: '#each', doc: 'Iterate over a list' },
        { name: '#if', doc: 'Conditional rendering' },
        { name: '#unless', doc: 'Inverse conditional rendering' },
        { name: '#with', doc: 'Change data context' },
        { name: '#let', doc: 'Define local variables' },
        { name: 'this', doc: 'Current data context' }
      ];

      // Only add @-prefixed helpers when inside an #each block
      if (isInsideEachBlock) {
        blazeHelpers.push(
          { name: '@index', doc: 'Current index in #each loop' },
          { name: '@key', doc: 'Current key in #each loop' },
          { name: '@first', doc: 'True if first item in #each loop' },
          { name: '@last', doc: 'True if last item in #each loop' }
        );
      }

      // Only add else helper when inside an #if or #unless block
      if (isInsideIfOrUnlessBlock) {
        blazeHelpers.push({
          name: 'else',
          doc: `Alternative branch for #${ifUnlessContext.blockType} block`
        });
      }
      try {
        const config = await connection.workspace.getConfiguration('meteorLanguageServer');
        let hashColor = '#FF6B35';
        let nameColor = '#007ACC';
        if (typeof config?.blazeHelpers?.hashColor === 'string') {
          hashColor = config.blazeHelpers.hashColor;
        }
        if (typeof config?.blazeHelpers?.nameColor === 'string') {
          nameColor = config.blazeHelpers.nameColor;
        }
        // Merge extended blazeHelpers from config
        let extendedHelpers = [];
        if (Array.isArray(config?.blazeHelpers?.extend)) {
          extendedHelpers = config.blazeHelpers.extend
            .map((h: any) => {
              if (typeof h === 'string') {
                return { name: h, doc: '' };
              } else if (typeof h === 'object' && h !== null && typeof h.name === 'string') {
                return { name: h.name, doc: h.doc || '' };
              }
              return null;
            })
            .filter(Boolean);
        }
        blazeHelpers = [...blazeHelpers, ...extendedHelpers];

        blazeHelpers.forEach(helper => {
          let label = helper.name;
          let doc = helper.doc;
          // Suggest helpers prefixed with '#' if cursor is inside empty handlebars brackets (e.g., '{{}}', '{{#}}')
          if (label.startsWith('#')) {
            // Find the text before and after the cursor
            const beforeCursor = text.substring(0, offset);
            const afterCursor = text.substring(offset);
            // Check if cursor is inside '{{}}' or '{{#}}' (empty brackets)
            const insideEmptyBrackets =
              /\{\{\s*\}\}/.test(beforeCursor + afterCursor) ||
              /\{\{#\s*\}\}/.test(beforeCursor + afterCursor);
            if (!insideEmptyBrackets) {
              return; // Do not suggest this helper
            }
            doc = `$(color) <span style='color:${hashColor}'>#</span><span style='color:${nameColor}'>${label.slice(
              1
            )}</span> — ${helper.doc}`;
          }
          completions.push({
            label: helper.name,
            kind: CompletionItemKind.Keyword,
            detail: 'Blaze helper',
            documentation: { kind: MarkupKind.Markdown, value: doc }
          });
        });

        // Add propNames completions for custom blocks
        // Merge custom blocks from config
        let customBlocks = [];
        if (Array.isArray(config?.blockConditions?.extend)) {
          customBlocks = config.blockConditions.extend;
        }
        const allBlocks = [...blockTypes, ...customBlocks];

        // Find if cursor is inside a block
        for (const block of allBlocks) {
          if (!block.propNames || block.propNames.length === 0) {
            continue;
          }
          // Find all block ranges
          const blockBeginRegex = new RegExp(`\{\{\s*#${block.type}(?:\s+[^}]*)?\}\}`, 'g');
          let match;
          while ((match = blockBeginRegex.exec(text)) !== null) {
            const start = match.index;
            const endRegex = new RegExp(`\{\{\s*\/${block.type}\s*\}\}`, 'g');
            endRegex.lastIndex = blockBeginRegex.lastIndex;
            const endMatch = endRegex.exec(text);
            const end = endMatch ? endMatch.index + endMatch[0].length : text.length;
            if (offset >= start && offset <= end) {
              // Inside this block, suggest propNames
              block.propNames.forEach((p: string) => {
                completions.push({
                  label: p,
                  kind: CompletionItemKind.Property,
                  detail: `Custom property for block #${block.type}`
                });
              });
              break;
            }
          }
        }
      } catch (e) {
        // Ignore config errors
      }
    }

    // If we're in a single bracket context, wrap all completions with double brackets
    if (handlebarsInfo.isSingleBracket) {
      completions.forEach(completion => {
        // Calculate the range to replace (from the single bracket to the current cursor position)
        const startPos = document.positionAt(handlebarsInfo.expressionStart - 1); // Include the single bracket
        const endPos = document.positionAt(offset); // Current cursor position

        // Set up the completion to replace the entire range with properly formatted handlebars
        const completionText = completion.insertText || completion.label;
        completion.insertText = `{{${completionText}}}`;

        // Use textEdit to replace the specific range instead of additionalTextEdits
        completion.textEdit = {
          range: {
            start: startPos,
            end: endPos
          },
          newText: `{{${completionText}}}`
        };

        // Remove any insertText since we're using textEdit
        delete completion.insertText;
      });
    }

    return completions;
  };
};

// Helper function to get template name completions for {{> templateName}} syntax
async function getTemplateNameCompletions(
  config: CurrentConnectionConfig,
  partialTemplateName: string,
  currentDocument: TextDocument
): Promise<CompletionItem[]> {
  const { connection } = config;
  const completions: CompletionItem[] = [];

  try {
    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName);
    if (!associatedFile) {
      return completions;
    }

    // Parse imports from the associated file
    const importedTemplates = parseTemplateImports(associatedFile);

    // Filter by partial match and create completions
    importedTemplates
      .filter(templateName =>
        templateName.toLowerCase().includes(partialTemplateName.toLowerCase())
      )
      .forEach(templateName => {
        completions.push({
          label: templateName,
          kind: CompletionItemKind.Module,
          detail: 'Imported template',
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Include imported template: \`{{> ${templateName}}}\`\n\nThis template is imported in the associated JavaScript/TypeScript file.`
          },
          insertText: templateName,
          filterText: templateName
        });
      });
  } catch (error) {
    // Silently handle errors
  }

  return completions;
}

// Helper function to find the associated JS/TS file for a template
function findAssociatedJSFile(currentDir: string, baseName: string): string | null {
  const possibleExtensions = ['.ts', '.js'];

  // First, try exact base name match
  for (const ext of possibleExtensions) {
    const filePath = path.join(currentDir, baseName + ext);
    try {
      if (fsSync.existsSync(filePath)) {
        return filePath;
      }
    } catch (e) {
      // Continue trying other extensions
    }
  }

  // If no exact match, look for any JS/TS files in the same directory
  try {
    const files = fsSync.readdirSync(currentDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (possibleExtensions.includes(ext)) {
        const fullPath = path.join(currentDir, file);
        // Check if this file imports the current HTML template
        try {
          const content = fsSync.readFileSync(fullPath, 'utf8');
          // Look for imports of template.html or similar patterns
          const templateImportPattern = new RegExp(
            `import\\s+['"]\\./${baseName}(?:\\.html)?['"]`,
            'g'
          );
          if (templateImportPattern.test(content)) {
            return fullPath;
          }
        } catch (e) {
          // Continue checking other files
        }
      }
    }

    // If still no match, return the first JS/TS file found (fallback)
    for (const file of files) {
      const ext = path.extname(file);
      if (possibleExtensions.includes(ext)) {
        return path.join(currentDir, file);
      }
    }
  } catch (e) {
    // Directory read failed, continue with null
  }

  return null;
}

// Helper function to find tsconfig.json in the same directory as .meteor
function findTsConfigForMeteorProject(startPath: string): any {
  let currentDir = startPath;

  // Walk up the directory tree to find .meteor directory
  while (currentDir !== path.dirname(currentDir)) {
    const meteorDir = path.join(currentDir, '.meteor');
    if (fsSync.existsSync(meteorDir)) {
      // Found .meteor directory, look for tsconfig.json in the same directory
      const tsconfigPath = path.join(currentDir, 'tsconfig.json');
      if (fsSync.existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = fsSync.readFileSync(tsconfigPath, 'utf8');

          // Try parsing as-is first (in case it's valid JSON without comments)
          try {
            return JSON.parse(tsconfigContent);
          } catch (e) {
            // If that fails, try safer comment removal
            const cleanContent = safelyRemoveJsonComments(tsconfigContent);
            return JSON.parse(cleanContent);
          }
        } catch (e) {
          console.error('Error parsing tsconfig.json:', e);
          console.error('File path:', tsconfigPath);
          return null;
        }
      }
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Safely remove comments from JSON content
function safelyRemoveJsonComments(content: string): string {
  const result: string[] = [];
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : '';

    // Handle block comments
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i += 2; // Skip the */
        continue;
      }
      i++;
      continue;
    }

    // Handle line comments
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result.push(char); // Keep the newline
      }
      i++;
      continue;
    }

    // Handle strings (don't process comments inside strings)
    if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
      inString = !inString;
      result.push(char);
      i++;
      continue;
    }

    // Look for comment starts only outside strings
    if (!inString) {
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i += 2;
        continue;
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }

    result.push(char);
    i++;
  }

  return result.join('');
}

// Helper function to resolve TypeScript path aliases
function resolveTsPath(importPath: string, tsconfig: any, projectRoot: string): string | null {
  if (!tsconfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = '.', paths } = tsconfig.compilerOptions;
  const absoluteBaseUrl = path.resolve(projectRoot, baseUrl);

  // Try to match the import path against configured path patterns
  for (const [pattern, mappings] of Object.entries(paths)) {
    const regexPattern = pattern.replace(/\*/g, '(.*)');
    const regex = new RegExp(`^${regexPattern}$`);
    const match = importPath.match(regex);

    if (match) {
      // Try each mapping option
      for (const mapping of mappings as string[]) {
        let resolvedPath = mapping;

        // Replace * with the captured group
        if (match[1] !== undefined) {
          resolvedPath = resolvedPath.replace(/\*/g, match[1]);
        }

        // Resolve relative to baseUrl
        const fullPath = path.resolve(absoluteBaseUrl, resolvedPath);
        return fullPath;
      }
    }
  }

  return null;
}

// Helper function to parse template imports from a JS/TS file
function parseTemplateImports(filePath: string): string[] {
  try {
    const content = fsSync.readFileSync(filePath, 'utf8');
    const templates: string[] = [];

    // Find tsconfig.json for this Meteor project
    const tsconfig = findTsConfigForMeteorProject(path.dirname(filePath));

    // Find all import statements (both named and unnamed, including absolute paths)
    const importPattern = /import\s+(?:[^'"]*\s+from\s+)?['"]((?:\.\.?\/|\/)[^'"]*)['"]/g;

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      let fullImportPath;
      if (importPath.startsWith('/')) {
        // Absolute import - try TypeScript path resolution first
        if (tsconfig) {
          // Find project root (directory containing .meteor)
          let currentDir = path.dirname(filePath);
          let projectRoot = currentDir;

          while (currentDir !== path.dirname(currentDir)) {
            if (fsSync.existsSync(path.join(currentDir, '.meteor'))) {
              projectRoot = currentDir;
              break;
            }
            currentDir = path.dirname(currentDir);
          }

          // Try TypeScript path resolution
          const tsResolvedPath = resolveTsPath(importPath, tsconfig, projectRoot);
          if (tsResolvedPath) {
            fullImportPath = tsResolvedPath;
          } else {
            // Fallback to simple resolution
            fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
          }
        } else {
          // No tsconfig, use simple resolution
          // Find the project root by looking for package.json
          let currentDir = path.dirname(filePath);
          let projectRoot = currentDir;

          while (currentDir !== path.dirname(currentDir)) {
            if (fsSync.existsSync(path.join(currentDir, 'package.json'))) {
              projectRoot = currentDir;
              break;
            }
            currentDir = path.dirname(currentDir);
          }

          fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
        }
      } else {
        // Relative import
        fullImportPath = path.resolve(path.dirname(filePath), importPath);
      }

      // Try different file extensions for the imported file
      const possibleExtensions = ['.ts', '.js', ''];
      let importedFileContent = null;
      let actualImportPath = null;

      for (const ext of possibleExtensions) {
        const testPath = fullImportPath + ext;
        if (fsSync.existsSync(testPath)) {
          try {
            importedFileContent = fsSync.readFileSync(testPath, 'utf8');
            actualImportPath = testPath;
            break;
          } catch (e) {
            // Continue trying other extensions
          }
        }
      }

      // If we found the imported file, look for Template.templateName patterns
      if (importedFileContent && actualImportPath) {
        // Match Template.templateName patterns
        const templatePattern = /Template\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let templateMatch;

        while ((templateMatch = templatePattern.exec(importedFileContent)) !== null) {
          const templateName = templateMatch[1];
          if (!templates.includes(templateName)) {
            templates.push(templateName);
          }
        }

        // Also check for template.html files in the same directory and extract template names
        const templateDir = path.dirname(actualImportPath);
        const templateHtmlPath = path.join(templateDir, 'template.html');

        if (fsSync.existsSync(templateHtmlPath)) {
          try {
            const templateHtml = fsSync.readFileSync(templateHtmlPath, 'utf8');
            // Extract template names from template definitions
            const htmlTemplatePattern = /<template\s+name=["']([^"']+)["']/g;
            let htmlTemplateMatch;

            while ((htmlTemplateMatch = htmlTemplatePattern.exec(templateHtml)) !== null) {
              const templateName = htmlTemplateMatch[1];
              if (!templates.includes(templateName)) {
                templates.push(templateName);
              }
            }
          } catch (e) {
            // Continue if we can't read the template.html file
          }
        }
      }

      // For imports that directly import .html files
      if (importPath.endsWith('.html')) {
        const htmlPath = path.resolve(path.dirname(filePath), importPath);
        if (fsSync.existsSync(htmlPath)) {
          try {
            const templateHtml = fsSync.readFileSync(htmlPath, 'utf8');
            const htmlTemplatePattern = /<template\s+name=["']([^"']+)["']/g;
            let htmlTemplateMatch;

            while ((htmlTemplateMatch = htmlTemplatePattern.exec(templateHtml)) !== null) {
              const templateName = htmlTemplateMatch[1];
              if (!templates.includes(templateName)) {
                templates.push(templateName);
              }
            }
          } catch (e) {
            // Continue if we can't read the HTML file
          }
        }
      }

      // Also check if this is a direct template import pattern
      // like './templateName' where templateName directory has template.html
      const pathParts = importPath.split('/');
      const templateName = pathParts[pathParts.length - 1];

      if (templateName && !templates.includes(templateName)) {
        const templateHtmlPath = path.join(fullImportPath, 'template.html');
        if (fsSync.existsSync(templateHtmlPath)) {
          try {
            const templateHtml = fsSync.readFileSync(templateHtmlPath, 'utf8');
            const templateDefPattern = new RegExp(`<template\\s+name=["']${templateName}["']`, 'i');
            if (templateDefPattern.test(templateHtml)) {
              templates.push(templateName);
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    return templates;
  } catch (error) {
    console.error(`Error parsing template imports from ${filePath}:`, error);
    return [];
  }
}

// Function to get template parameter completions
async function getTemplateParameterCompletions(
  config: CurrentConnectionConfig,
  templateName: string,
  currentDocument: TextDocument,
  textBeforeCursor: string
): Promise<CompletionItem[]> {
  const { connection } = config;
  const completions: CompletionItem[] = [];

  try {
    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Parse already used parameters from the current template inclusion
    const usedParameters = parseUsedParameters(textBeforeCursor, templateName);

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName);
    if (!associatedFile) {
      return completions;
    }

    // Parse imports from the associated file to find the template
    const importedTemplates = parseTemplateImports(associatedFile);

    if (!importedTemplates.includes(templateName)) {
      return completions;
    }

    // Find the template file to analyze its data usage
    const templateFile = findImportedTemplateFile(associatedFile, templateName, connection);
    if (!templateFile) {
      return completions;
    }

    // Read and analyze the template file for data properties
    const templateContent = fsSync.readFileSync(templateFile, 'utf8');
    const templateDataProperties = extractDataPropertiesFromTemplate(templateContent, templateName);

    // Also analyze the associated TypeScript file for type definitions
    // We need to find the actual template's TypeScript file, not the importing file
    const templateTsFile = findTemplateTypeScriptFile(associatedFile, templateName, connection);
    let typeDataProperties: Array<{ name: string; type?: string; documentation?: string }> = [];

    if (templateTsFile) {
      typeDataProperties = extractDataPropertiesFromTypes(templateTsFile, templateName);
    }

    // Extract helper function names from the TypeScript file to exclude them from parameters
    const helperNames = templateTsFile ? extractHelperNames(templateTsFile, templateName) : [];

    // Combine TypeScript properties (with enhanced type info) and template properties (with default any type)
    // Create a map of TypeScript properties for easy lookup
    const typePropsMap = new Map(typeDataProperties.map(prop => [prop.name, prop]));

    // Start with all template properties, then enhance with TypeScript info where available
    // Filter out any properties that are actually helper functions
    const templateProps = templateDataProperties
      .filter(propName => !helperNames.includes(propName)) // Exclude helper functions
      .map(propName => {
        const typeInfo = typePropsMap.get(propName);
        return typeInfo || { name: propName, type: 'any' };
      });

    // Add any TypeScript-only properties that aren't in the template HTML
    const templatePropNames = new Set(templateDataProperties);
    const typeOnlyProps = typeDataProperties.filter(
      prop => !templatePropNames.has(prop.name) && !helperNames.includes(prop.name)
    );

    // Combine both sets of properties and filter out already used parameters
    const allDataProperties: Array<{ name: string; type?: string; documentation?: string }> = [
      ...templateProps,
      ...typeOnlyProps
    ]
      .filter(property => !usedParameters.includes(property.name)) // Filter out used parameters
      .sort((a, b) => a.name.localeCompare(b.name));

    // Create completions for each available data property
    allDataProperties.forEach(property => {
      const completion = {
        label: property.name,
        kind: CompletionItemKind.Property,
        detail: `Template parameter: ${property.type || 'any'}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: property.documentation
            ? `${property.documentation}\n\nUsage: \`{{> ${templateName} ${property.name}=value}}\``
            : `Data property that can be passed to the \`${templateName}\` template.\n\nUsage: \`{{> ${templateName} ${property.name}=value}}\`.\n\nNote: This property is not declared in the TypeScript types, but is being used in the template, so it defaults to 'any'.`
        },
        insertText: `${property.name}=`,
        filterText: property.name
      };
      completions.push(completion);
    });
  } catch (error) {}

  return completions;
}

// Helper function to parse already used parameters in the current template inclusion
function parseUsedParameters(textBeforeCursor: string, templateName: string): string[] {
  const usedParams: string[] = [];

  try {
    // Find the start of the current template inclusion
    const templateInclusionPattern = new RegExp(`\\{\\{\\s*>\\s*${templateName}\\b([^}]*)$`);
    const match = textBeforeCursor.match(templateInclusionPattern);

    if (match) {
      const parametersSection = match[1];

      // Extract parameter names using regex to find param=value patterns
      const parameterPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
      let paramMatch;

      while ((paramMatch = parameterPattern.exec(parametersSection)) !== null) {
        const paramName = paramMatch[1];
        if (!usedParams.includes(paramName)) {
          usedParams.push(paramName);
        }
      }
    }
  } catch (error) {
    // If parsing fails, return empty array to not block completions
  }

  return usedParams;
}

// Helper function to find the template file for a given template name
function findImportedTemplateFile(
  jsFilePath: string,
  templateName: string,
  connection: any
): string | null {
  try {
    const jsFileContent = fsSync.readFileSync(jsFilePath, 'utf8');
    const dir = path.dirname(jsFilePath);

    // Parse import statements to find where this template comes from
    const importLines = jsFileContent
      .split('\n')
      .filter((line: string) => line.trim().startsWith('import') && line.includes(templateName));

    for (const importLine of importLines) {
      // Extract import path from import statement
      // Handle both: import './path' and import something from './path'
      const importMatch =
        importLine.match(/from\s+['"]([^'"]+)['"]/) ||
        importLine.match(/import\s+['"]([^'"]+)['"]/);

      if (importMatch) {
        const importPath = importMatch[1];

        let fullImportPath: string;

        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          // Relative import
          fullImportPath = path.resolve(dir, importPath);
        } else if (importPath.startsWith('/')) {
          // Absolute import - handle with TypeScript path resolution
          const tsconfig = findTsConfigForMeteorProject(dir);

          if (tsconfig) {
            // Find project root (directory containing .meteor)
            let currentDir = dir;
            let projectRoot = currentDir;

            while (currentDir !== path.dirname(currentDir)) {
              if (fsSync.existsSync(path.join(currentDir, '.meteor'))) {
                projectRoot = currentDir;
                break;
              }
              currentDir = path.dirname(currentDir);
            }

            // Try TypeScript path resolution
            const tsResolvedPath = resolveTsPath(importPath, tsconfig, projectRoot);
            if (tsResolvedPath) {
              fullImportPath = tsResolvedPath;
            } else {
              // Fallback to simple resolution
              fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
            }
          } else {
            // No tsconfig, use simple resolution
            // Find the project root by looking for package.json or .meteor
            let currentDir = dir;
            let projectRoot = currentDir;

            while (currentDir !== path.dirname(currentDir)) {
              if (
                fsSync.existsSync(path.join(currentDir, 'package.json')) ||
                fsSync.existsSync(path.join(currentDir, '.meteor'))
              ) {
                projectRoot = currentDir;
                break;
              }
              currentDir = path.dirname(currentDir);
            }

            fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
          }
        } else {
          continue; // Skip other types of imports (like node_modules)
        }

        // For imports like './nestedTemplate/nestedTemplate' or '/imports/ui/template2/nestedTemplate2/nestedTemplate2'
        // we need to check the parent directory
        // Extract the directory part of the import path
        const importDir = path.dirname(fullImportPath);

        // Look for template.html in the import directory
        const templateHtmlPath = path.join(importDir, 'template.html');

        if (fsSync.existsSync(templateHtmlPath)) {
          return templateHtmlPath;
        }

        // Also check in the full import path directory (original logic)
        const templateHtmlPathFull = path.join(fullImportPath, 'template.html');

        if (fsSync.existsSync(templateHtmlPathFull)) {
          return templateHtmlPathFull;
        }

        // Also try templateName.html
        const templateNamePath = path.join(path.dirname(fullImportPath), `${templateName}.html`);

        if (fsSync.existsSync(templateNamePath)) {
          return templateNamePath;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding template file for ${templateName}:`, error);
    return null;
  }
}

// Helper function to find the TypeScript file for a given template name
function findTemplateTypeScriptFile(
  jsFilePath: string,
  templateName: string,
  connection: any
): string | null {
  try {
    const jsFileContent = fsSync.readFileSync(jsFilePath, 'utf8');
    const dir = path.dirname(jsFilePath);

    // Parse import statements to find where this template comes from
    const importLines = jsFileContent
      .split('\n')
      .filter((line: string) => line.trim().startsWith('import') && line.includes(templateName));

    for (const importLine of importLines) {
      // Extract import path from import statement
      const importMatch =
        importLine.match(/from\s+['"]([^'"]+)['"]/) ||
        importLine.match(/import\s+['"]([^'"]+)['"]/);

      if (importMatch) {
        const importPath = importMatch[1];

        let fullImportPath: string;

        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          // Relative import
          fullImportPath = path.resolve(dir, importPath);
        } else if (importPath.startsWith('/')) {
          // Absolute import - handle with TypeScript path resolution
          const tsconfig = findTsConfigForMeteorProject(dir);

          if (tsconfig) {
            // Find project root (directory containing .meteor)
            let currentDir = dir;
            let projectRoot = currentDir;

            while (currentDir !== path.dirname(currentDir)) {
              if (fsSync.existsSync(path.join(currentDir, '.meteor'))) {
                projectRoot = currentDir;
                break;
              }
              currentDir = path.dirname(currentDir);
            }

            // Try TypeScript path resolution
            const tsResolvedPath = resolveTsPath(importPath, tsconfig, projectRoot);
            if (tsResolvedPath) {
              fullImportPath = tsResolvedPath;
            } else {
              // Fallback to simple resolution
              fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
            }
          } else {
            // No tsconfig, use simple resolution
            // Find the project root by looking for package.json or .meteor
            let currentDir = dir;
            let projectRoot = currentDir;

            while (currentDir !== path.dirname(currentDir)) {
              if (
                fsSync.existsSync(path.join(currentDir, 'package.json')) ||
                fsSync.existsSync(path.join(currentDir, '.meteor'))
              ) {
                projectRoot = currentDir;
                break;
              }
              currentDir = path.dirname(currentDir);
            }

            fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
          }
        } else {
          continue; // Skip other types of imports (like node_modules)
        }

        // For imports like './nestedTemplate/nestedTemplate' or '/imports/ui/template2/nestedTemplate2/nestedTemplate2'
        // look for the .ts file
        const templateTsPath = `${fullImportPath}.ts`;

        if (fsSync.existsSync(templateTsPath)) {
          return templateTsPath;
        }

        // Also try the directory approach - look in the import directory
        const importDir = path.dirname(fullImportPath);
        const templateTsInDir = path.join(importDir, `${templateName}.ts`);

        if (fsSync.existsSync(templateTsInDir)) {
          return templateTsInDir;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding TypeScript file for ${templateName}:`, error);
    return null;
  }
}

// Helper function to extract data properties from template content
function extractDataPropertiesFromTemplate(
  templateContent: string,
  templateName: string
): string[] {
  const properties = new Set<string>();

  // Find the specific template block
  const templatePattern = new RegExp(
    `<template\\s+name=["']${templateName}["'][^>]*>([\\s\\S]*?)<\\/template>`,
    'i'
  );
  const templateMatch = templateContent.match(templatePattern);

  if (!templateMatch) {
    return [];
  }

  const templateBody = templateMatch[1];

  // Extract properties from handlebars expressions
  // Match patterns like {{property}}, {{#if property}}, {{property.subprop}}, etc.
  const handlebarsPattern = /\{\{[^{}]*?\}\}/g;
  const matches = templateBody.match(handlebarsPattern) || [];

  matches.forEach(match => {
    // Clean up the match - remove {{ }} and any # or / prefixes
    const content = match
      .replace(/^\{\{[#/]?/, '')
      .replace(/\}\}$/, '')
      .trim();

    // Skip built-in helpers and control structures
    if (
      content.startsWith('if ') ||
      content.startsWith('each ') ||
      content.startsWith('unless ') ||
      content.startsWith('with ') ||
      content === 'else' ||
      content.startsWith('@') ||
      content === 'this' ||
      content.includes('(')
    ) {
      return;
    }

    // Extract the root property name (before any dots or spaces)
    const propertyMatch = content.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (propertyMatch) {
      const property = propertyMatch[1];
      // Skip common template helpers that aren't data properties
      if (!['if', 'each', 'unless', 'with', 'let'].includes(property)) {
        properties.add(property);
      }
    }
  });

  const result = Array.from(properties).sort();

  return result;
}

// Helper function to extract data properties from TypeScript type definitions
function extractDataPropertiesFromTypes(
  tsFilePath: string,
  templateName: string
): Array<{ name: string; type?: string; documentation?: string }> {
  const properties: Array<{ name: string; type?: string; documentation?: string }> = [];

  try {
    const tsFileContent = fsSync.readFileSync(tsFilePath, 'utf8');

    // Look for type definitions like: type TemplateNameData = { ... }
    // Convert templateName to PascalCase for type name matching
    const pascalTemplateName = templateName.charAt(0).toUpperCase() + templateName.slice(1);
    const typeNames = [
      `${pascalTemplateName}Data`,
      `${templateName}Data`,
      `${pascalTemplateName}TemplateData`,
      `${templateName}TemplateData`
    ];

    for (const typeName of typeNames) {
      // Match type definitions: type TypeName = { ... }
      const typePattern = new RegExp(`type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`, 'i');
      const typeMatch = tsFileContent.match(typePattern);

      if (typeMatch) {
        const typeBody = typeMatch[1];

        // Extract property names from the type body
        // Split by lines and process each line to avoid nested objects
        const lines = typeBody.split('\n');
        let braceDepth = 0;
        let currentJSDocComment = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();

          // Check for JSDoc comment blocks (/** ... */)
          if (trimmedLine.startsWith('/**')) {
            currentJSDocComment = '';
            let j = i;
            while (j < lines.length) {
              const commentLine = lines[j].trim();
              if (commentLine.includes('*/')) {
                // Extract content before */
                const endContent = commentLine.substring(0, commentLine.indexOf('*/'));
                if (endContent.replace(/^\s*\*?\s*/, '').length > 0) {
                  currentJSDocComment += endContent.replace(/^\s*\*?\s*/, '');
                }
                i = j; // Skip to end of comment block
                break;
              } else if (j > i) {
                // Extract content from comment lines, removing * prefix
                const content = commentLine.replace(/^\s*\*?\s*/, '');
                if (content.length > 0) {
                  if (currentJSDocComment) {
                    currentJSDocComment += ' ';
                  }
                  currentJSDocComment += content;
                }
              }
              j++;
            }
            continue;
          }

          // Check for single-line JSDoc comments
          if (trimmedLine.startsWith('//')) {
            currentJSDocComment = trimmedLine.replace(/^\/\/\s*/, '');
            continue;
          }

          // Check if this line contains a property at the current level (before counting braces)
          if (braceDepth === 0 && trimmedLine.match(/^\s*(\w+)\s*:\s*[^;{]+[;}]/)) {
            const propertyMatch = trimmedLine.match(/^\s*(\w+)\s*:\s*([^;{]+)[;}]/);
            if (propertyMatch) {
              const propertyName = propertyMatch[1];
              const propertyType = propertyMatch[2].trim();
              // Skip comments and TypeScript keywords
              if (
                !propertyName.startsWith('//') &&
                !['readonly', 'public', 'private', 'protected'].includes(propertyName)
              ) {
                const propertyInfo: { name: string; type?: string; documentation?: string } = {
                  name: propertyName,
                  type: propertyType
                };

                if (currentJSDocComment) {
                  propertyInfo.documentation = currentJSDocComment;
                }

                properties.push(propertyInfo);
              }
            }
          }

          // Reset comment after processing property or if we encounter other content
          if (
            !trimmedLine.startsWith('//') &&
            !trimmedLine.startsWith('/**') &&
            trimmedLine.length > 0
          ) {
            currentJSDocComment = '';
          }

          // Count braces to update depth for next iteration
          for (const char of trimmedLine) {
            if (char === '{') {
              braceDepth++;
            } else if (char === '}') {
              braceDepth--;
            }
          }
        }
        break; // Found the type, no need to check others
      }
    }

    // Also look for interface definitions: interface TemplateNameData { ... }
    for (const typeName of typeNames) {
      const interfacePattern = new RegExp(`interface\\s+${typeName}\\s*\\{([\\s\\S]*?)\\}`, 'i');
      const interfaceMatch = tsFileContent.match(interfacePattern);

      if (interfaceMatch) {
        const interfaceBody = interfaceMatch[1];

        // Split by lines and process each line to avoid nested objects
        const lines = interfaceBody.split('\n');
        let braceDepth = 0;
        let currentJSDocComment = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();

          // Check for JSDoc comment blocks (/** ... */)
          if (trimmedLine.startsWith('/**')) {
            currentJSDocComment = '';
            let j = i;
            while (j < lines.length) {
              const commentLine = lines[j].trim();
              if (commentLine.includes('*/')) {
                // Extract content before */
                const endContent = commentLine.substring(0, commentLine.indexOf('*/'));
                if (endContent.replace(/^\s*\*?\s*/, '').length > 0) {
                  currentJSDocComment += endContent.replace(/^\s*\*?\s*/, '');
                }
                i = j; // Skip to end of comment block
                break;
              } else if (j > i) {
                // Extract content from comment lines, removing * prefix
                const content = commentLine.replace(/^\s*\*?\s*/, '');
                if (content.length > 0) {
                  if (currentJSDocComment) {
                    currentJSDocComment += ' ';
                  }
                  currentJSDocComment += content;
                }
              }
              j++;
            }
            continue;
          }

          // Check for single-line JSDoc comments
          if (trimmedLine.startsWith('//')) {
            currentJSDocComment = trimmedLine.replace(/^\/\/\s*/, '');
            continue;
          }

          // Check if this line contains a property at the current level (before counting braces)
          if (braceDepth === 0 && trimmedLine.match(/^\s*(\w+)\s*:\s*[^;{]+[;}]/)) {
            const propertyMatch = trimmedLine.match(/^\s*(\w+)\s*:\s*([^;{]+)[;}]/);
            if (propertyMatch) {
              const propertyName = propertyMatch[1];
              const propertyType = propertyMatch[2].trim();
              if (
                !propertyName.startsWith('//') &&
                !['readonly', 'public', 'private', 'protected'].includes(propertyName)
              ) {
                const propertyInfo: { name: string; type?: string; documentation?: string } = {
                  name: propertyName,
                  type: propertyType
                };

                if (currentJSDocComment) {
                  propertyInfo.documentation = currentJSDocComment;
                }

                properties.push(propertyInfo);
              }
            }
          }

          // Reset comment after processing property or if we encounter other content
          if (
            !trimmedLine.startsWith('//') &&
            !trimmedLine.startsWith('/**') &&
            trimmedLine.length > 0
          ) {
            currentJSDocComment = '';
          }

          // Count braces to update depth for next iteration
          for (const char of trimmedLine) {
            if (char === '{') {
              braceDepth++;
            } else if (char === '}') {
              braceDepth--;
            }
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error(`Error extracting types from ${tsFilePath}:`, error);
  }

  return properties;
}

// Helper function to extract helper function names from TypeScript template files
function extractHelperNames(tsFilePath: string, templateName: string): string[] {
  const helperNames: string[] = [];

  try {
    const tsFileContent = fsSync.readFileSync(tsFilePath, 'utf8');

    // Look for Template.templateName.helpers({ ... }) block
    const helpersPattern = new RegExp(
      `Template\\.${templateName}\\.helpers\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
      'i'
    );
    const helpersMatch = tsFileContent.match(helpersPattern);

    if (helpersMatch) {
      const helpersBody = helpersMatch[1];

      // Extract function names from the helpers object
      // Match patterns like: functionName(): type { or functionName() {
      const functionPattern = /(\w+)\s*\([^)]*\)\s*:?\s*[^{]*\{/g;
      let match;

      while ((match = functionPattern.exec(helpersBody)) !== null) {
        const functionName = match[1];
        if (functionName) {
          if (!helperNames.includes(functionName)) {
            helperNames.push(functionName);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting helper names from ${tsFilePath}:`, error);
  }

  return helperNames;
}

export default onCompletion;
