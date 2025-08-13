import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { createBlockCompletions, shouldProvideBlockCompletion } from '../helpers/autoInsertEndTags';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '../helpers/findEnclosingEachInContext';
import { findEnclosingIfOrUnlessBlock } from '../helpers/findEnclosingIfOrUnlessBlock';
import { isWithinHandlebarsExpression } from '../helpers/isWithinHandlebarsExpression';

const onCompletion = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    connection.console.log('Completion requested');
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      connection.console.log('No document found');
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    connection.console.log(`Document URI: ${document.uri}`);
    connection.console.log(`Document language ID: ${document.languageId}`);
    connection.console.log(`Document contains templates: ${containsMeteorTemplates(document)}`);

    // Only provide Meteor completions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found in document');
      return [];
    }

    // Check if cursor is within handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      connection.console.log('Cursor not within handlebars expression');
      return [];
    }

    connection.console.log(
      `Within handlebars expression: ${handlebarsInfo.isTriple ? 'triple' : 'double'} braces`
    );

    // Check if we're in a template inclusion context ({{> templateName)
    const textBeforeCursor = text.substring(0, offset);
    const templateInclusionMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]*)$/);
    const isTemplateInclusion = templateInclusionMatch !== null;
    const partialTemplateName = templateInclusionMatch ? templateInclusionMatch[1] : '';

    connection.console.log(`Template inclusion detected: ${isTemplateInclusion}, partial: "${partialTemplateName}"`);

    // If we're in a template inclusion context, provide template name completions
    if (isTemplateInclusion) {
      connection.console.log('Providing template inclusion completions');
      const templateCompletions = await getTemplateNameCompletions(config, partialTemplateName, document);
      return templateCompletions;
    }

    const completions: CompletionItem[] = [];

    // Check if we should provide block completions (for {{#block}} patterns)
    const blockCompletion = shouldProvideBlockCompletion(text, offset);
    if (blockCompletion.shouldProvide) {
      connection.console.log(`Providing block completions for trigger: ${blockCompletion.trigger}`);
      const blockCompletions = await createBlockCompletions(config, blockCompletion.trigger);

      // For auto-triggered completions (when typing }}), return immediately
      if (blockCompletion.trigger.startsWith('complete-')) {
        connection.console.log(`Auto-triggering completion for: ${blockCompletion.trigger}`);
        return blockCompletions;
      }

      completions.push(...blockCompletions);

      // If we have an exact block match (space-triggered), return focused results
      if (blockCompletion.trigger !== '#' && blockCompletions.length > 0) {
        connection.console.log(`Returning focused block completion for: ${blockCompletion.trigger}`);
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

    connection.console.log(`Current template: ${currentTemplateName}`);

    if (currentTemplateName) {
      // Add helpers from analyzed files using directory-specific lookup strategies
      const dirLookupKeys = [`${dir}/${currentTemplateName}`, `${dir}/${baseName}`].filter(Boolean);

      connection.console.log(
        `Looking up helpers with directory-specific keys: ${JSON.stringify(dirLookupKeys)}`
      );
      connection.console.log(
        `[COMPLETION DEBUG] Available helpers map keys: ${JSON.stringify(
          Array.from(config.fileAnalysis.jsHelpers.keys())
        )}`
      );

      dirLookupKeys.forEach(key => {
        const helpers = config.fileAnalysis.jsHelpers.get(key as string);
        connection.console.log(
          `🔍 LOOKUP KEY: "${key}" → HELPERS: ${helpers ? JSON.stringify(helpers) : 'NONE FOUND'}`
        );
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

    connection.console.log(`Returning ${completions.length} completions`);
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
    const fs = await import('fs');
    const path = await import('path');

    connection.console.log(`Using document: ${currentDocument.uri} (${currentDocument.languageId})`);

    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName, fs, path);
    if (!associatedFile) {
      connection.console.log('No associated JS/TS file found for template inclusion completion');
      return completions;
    }

    connection.console.log(`Found associated file: ${associatedFile}`);

    // Parse imports from the associated file
    const importedTemplates = parseTemplateImports(associatedFile, fs, path);
    connection.console.log(`Found imported templates: ${importedTemplates.join(', ')}`);

    // Filter by partial match and create completions
    importedTemplates
      .filter(templateName => templateName.toLowerCase().includes(partialTemplateName.toLowerCase()))
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
    connection.console.log(`Error getting template completions: ${error}`);
  }

  return completions;
}

// Helper function to find the associated JS/TS file for a template
function findAssociatedJSFile(
  currentDir: string,
  baseName: string,
  fs: any,
  path: any
): string | null {
  const possibleExtensions = ['.ts', '.js'];

  // First, try exact base name match
  for (const ext of possibleExtensions) {
    const filePath = path.join(currentDir, baseName + ext);
    try {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    } catch (e) {
      // Continue trying other extensions
    }
  }

  // If no exact match, look for any JS/TS files in the same directory
  try {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (possibleExtensions.includes(ext)) {
        const fullPath = path.join(currentDir, file);
        // Check if this file imports the current HTML template
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Look for imports of template.html or similar patterns
          const templateImportPattern = new RegExp(`import\\s+['"]\\./${baseName}(?:\\.html)?['"]`, 'g');
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

// Helper function to parse template imports from a JS/TS file
function parseTemplateImports(filePath: string, fs: any, path: any): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const templates: string[] = [];

    // Find all import statements (both named and unnamed)
    const importPattern = /import\s+(?:[^'"]*\s+from\s+)?['"](\.\.?\/[^'"]*)['"]/g;

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      const fullImportPath = path.resolve(path.dirname(filePath), importPath);

      // Try different file extensions for the imported file
      const possibleExtensions = ['.ts', '.js', ''];
      let importedFileContent = null;
      let actualImportPath = null;

      for (const ext of possibleExtensions) {
        const testPath = fullImportPath + ext;
        if (fs.existsSync(testPath)) {
          try {
            importedFileContent = fs.readFileSync(testPath, 'utf8');
            actualImportPath = testPath;
            break;
          } catch (e) {
            // Continue trying other extensions
          }
        }
      }

      // If we found the imported file, look for Template.templateName patterns
      if (importedFileContent) {
        // Match Template.templateName patterns
        const templatePattern = /Template\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let templateMatch;

        while ((templateMatch = templatePattern.exec(importedFileContent)) !== null) {
          const templateName = templateMatch[1];
          if (!templates.includes(templateName)) {
            // Verify this template exists by checking for a template.html file
            const templateDir = path.dirname(actualImportPath);
            const templateHtmlPath = path.join(templateDir, 'template.html');

            if (fs.existsSync(templateHtmlPath)) {
              try {
                const templateHtml = fs.readFileSync(templateHtmlPath, 'utf8');
                // Check if the template.html actually defines this template
                const templateDefPattern = new RegExp(`<template\\s+name=["']${templateName}["']`, 'i');
                if (templateDefPattern.test(templateHtml)) {
                  templates.push(templateName);
                }
              } catch (e) {
                // If we can't read template.html, include the template anyway since we found Template.templateName
                templates.push(templateName);
              }
            }
          }
        }
      }

      // Also check if this is a direct template import pattern
      // like './templateName' where templateName directory has template.html
      const pathParts = importPath.split('/');
      const templateName = pathParts[pathParts.length - 1];

      if (templateName && !templates.includes(templateName)) {
        const templateHtmlPath = path.join(fullImportPath, 'template.html');
        if (fs.existsSync(templateHtmlPath)) {
          try {
            const templateHtml = fs.readFileSync(templateHtmlPath, 'utf8');
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

export default onCompletion;
