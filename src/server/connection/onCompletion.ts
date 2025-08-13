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
    connection.console.log('🔥 METEOR-COMPLETION: Completion requested');
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      connection.console.log('🔥 METEOR-COMPLETION: No document found');
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    connection.console.log(`🔥 METEOR-COMPLETION: Document URI: ${document.uri}`);
    connection.console.log(`🔥 METEOR-COMPLETION: Document language ID: ${document.languageId}`);
    connection.console.log(
      `🔥 METEOR-COMPLETION: Document contains templates: ${containsMeteorTemplates(document)}`
    );

    // Only provide Meteor completions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('🔥 METEOR-COMPLETION: No Meteor templates found in document');
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
    // This pattern handles multiline template inclusions by matching across line breaks
    const templateParameterMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)[\s\S]*?$/);
    const isTemplateParameter = templateParameterMatch !== null && !isTemplateInclusion;
    const templateNameForParams = templateParameterMatch ? templateParameterMatch[1] : '';

    connection.console.log(
      `🔥 METEOR-COMPLETION: Handlebars context: ${handlebarsInfo.isWithin}, Template inclusion: ${isTemplateInclusion}, Template parameter: ${isTemplateParameter}`
    );
    connection.console.log(
      `🔥 METEOR-COMPLETION: Template inclusion detected: ${isTemplateInclusion}, partial: "${partialTemplateName}"`
    );
    connection.console.log(
      `🔥 METEOR-COMPLETION: Template parameter context detected: ${isTemplateParameter}, template: "${templateNameForParams}"`
    );
    connection.console.log(
      `🔥 METEOR-COMPLETION: Text before cursor (last 100 chars): "${textBeforeCursor.slice(-100)}"`
    );

    // If we're in a template inclusion context, provide template name completions
    if (isTemplateInclusion) {
      connection.console.log('🔥 METEOR-COMPLETION: Providing template inclusion completions');
      const templateCompletions = await getTemplateNameCompletions(
        config,
        partialTemplateName,
        document
      );
      return templateCompletions;
    }

    // If we're in template parameter context, provide parameter completions
    if (isTemplateParameter) {
      connection.console.log(
        `🔥 METEOR-COMPLETION: Providing template parameter completions for: ${templateNameForParams}`
      );
      const parameterCompletions = await getTemplateParameterCompletions(
        config,
        templateNameForParams,
        document
      );
      return parameterCompletions;
    }

    // Only continue with regular completion if we're within handlebars and not in template contexts
    if (!handlebarsInfo.isWithin) {
      connection.console.log(
        '🔥 METEOR-COMPLETION: Cursor not within handlebars expression and not in template context'
      );
      return [];
    }

    connection.console.log(
      `🔥 METEOR-COMPLETION: Within handlebars expression: ${
        handlebarsInfo.isTriple ? 'triple' : 'double'
      } braces`
    );

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
        connection.console.log(
          `Returning focused block completion for: ${blockCompletion.trigger}`
        );
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

    connection.console.log(
      `Using document: ${currentDocument.uri} (${currentDocument.languageId})`
    );

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
                const templateDefPattern = new RegExp(
                  `<template\\s+name=["']${templateName}["']`,
                  'i'
                );
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

// Function to get template parameter completions
async function getTemplateParameterCompletions(
  config: CurrentConnectionConfig,
  templateName: string,
  currentDocument: TextDocument
): Promise<CompletionItem[]> {
  const { connection } = config;
  const completions: CompletionItem[] = [];

  try {
    const fs = await import('fs');
    const path = await import('path');

    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Getting parameter completions for template: ${templateName}`
    );

    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName, fs, path);
    if (!associatedFile) {
      connection.console.log(
        '🚀 TEMPLATE-PARAMS: No associated JS/TS file found for parameter completion'
      );
      return completions;
    }

    connection.console.log(`🚀 TEMPLATE-PARAMS: Found associated file: ${associatedFile}`);

    // Parse imports from the associated file to find the template
    const importedTemplates = parseTemplateImports(associatedFile, fs, path);
    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Found imported templates: ${importedTemplates.join(', ')}`
    );

    if (!importedTemplates.includes(templateName)) {
      connection.console.log(`🚀 TEMPLATE-PARAMS: Template ${templateName} not found in imports`);
      return completions;
    }

    // Find the template file to analyze its data usage
    const templateFile = findImportedTemplateFile(
      associatedFile,
      templateName,
      fs,
      path,
      connection
    );
    if (!templateFile) {
      connection.console.log(`🚀 TEMPLATE-PARAMS: Template file not found for ${templateName}`);
      return completions;
    }

    connection.console.log(`🚀 TEMPLATE-PARAMS: Found template file: ${templateFile}`);

    // Read and analyze the template file for data properties
    const templateContent = fs.readFileSync(templateFile, 'utf8');
    const templateDataProperties = extractDataPropertiesFromTemplate(templateContent, templateName);

    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Found template data properties: ${templateDataProperties.join(', ')}`
    );

    // Also analyze the associated TypeScript file for type definitions
    // We need to find the actual template's TypeScript file, not the importing file
    const templateTsFile = findTemplateTypeScriptFile(
      associatedFile,
      templateName,
      fs,
      path,
      connection
    );
    let typeDataProperties: string[] = [];

    if (templateTsFile) {
      connection.console.log(
        `🚀 TEMPLATE-PARAMS: Found template TypeScript file: ${templateTsFile}`
      );
      typeDataProperties = extractDataPropertiesFromTypes(templateTsFile, templateName, fs);
    } else {
      connection.console.log(
        `🚀 TEMPLATE-PARAMS: No template TypeScript file found for ${templateName}`
      );
    }

    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Found type data properties: ${typeDataProperties.join(', ')}`
    );

    // Combine both sources of data properties
    const allDataProperties = [
      ...new Set([...templateDataProperties, ...typeDataProperties])
    ].sort();
    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Combined data properties: ${allDataProperties.join(', ')}`
    );

    // Create completions for each data property
    allDataProperties.forEach(property => {
      const completion = {
        label: property,
        kind: CompletionItemKind.Property,
        detail: 'Template parameter',
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Data property that can be passed to the \`${templateName}\` template.\n\nUsage: \`{{> ${templateName} ${property}=value}}\``
        },
        insertText: `${property}=`,
        filterText: property
      };
      completions.push(completion);
      connection.console.log(`🚀 TEMPLATE-PARAMS: Created completion for: ${property}`);
    });

    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Created ${completions.length} parameter completions`
    );
    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Completion labels: ${completions.map(c => c.label).join(', ')}`
    );
  } catch (error) {
    connection.console.log(
      `🚀 TEMPLATE-PARAMS: Error getting template parameter completions: ${error}`
    );
  }

  connection.console.log(`🚀 TEMPLATE-PARAMS: Returning ${completions.length} completions`);
  return completions;
}

// Helper function to find the template file for a given template name
function findImportedTemplateFile(
  jsFilePath: string,
  templateName: string,
  fs: any,
  path: any,
  connection: any
): string | null {
  try {
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const dir = path.dirname(jsFilePath);

    connection.console.log(
      `🔍 FIND-TEMPLATE: Looking for template "${templateName}" from JS file: ${jsFilePath}`
    );
    connection.console.log(`🔍 FIND-TEMPLATE: JS file directory: ${dir}`);

    // Parse import statements to find where this template comes from
    const importLines = jsFileContent
      .split('\n')
      .filter((line: string) => line.trim().startsWith('import') && line.includes(templateName));

    connection.console.log(
      `🔍 FIND-TEMPLATE: Found ${importLines.length} import lines containing "${templateName}"`
    );
    importLines.forEach((line: string, index: number) => {
      connection.console.log(`🔍 FIND-TEMPLATE: Import ${index + 1}: ${line.trim()}`);
    });

    for (const importLine of importLines) {
      // Extract import path from import statement
      // Handle both: import './path' and import something from './path'
      const importMatch =
        importLine.match(/from\s+['"]([^'"]+)['"]/) ||
        importLine.match(/import\s+['"]([^'"]+)['"]/);

      if (importMatch) {
        const importPath = importMatch[1];
        connection.console.log(`🔍 FIND-TEMPLATE: Extracted import path: ${importPath}`);

        let fullImportPath: string;

        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          fullImportPath = path.resolve(dir, importPath);
          connection.console.log(`🔍 FIND-TEMPLATE: Resolved relative path to: ${fullImportPath}`);
        } else {
          connection.console.log(`🔍 FIND-TEMPLATE: Skipping non-relative import: ${importPath}`);
          continue; // Skip non-relative imports
        }

        // For imports like './nestedTemplate/nestedTemplate', we need to check the parent directory
        // Extract the directory part of the import path
        const importDir = path.dirname(importPath);
        const importDirResolved = path.resolve(dir, importDir);
        connection.console.log(
          `🔍 FIND-TEMPLATE: Import directory resolved to: ${importDirResolved}`
        );

        // Look for template.html in the import directory (not the full import path)
        const templateHtmlPath = path.join(importDirResolved, 'template.html');
        connection.console.log(
          `🔍 FIND-TEMPLATE: Checking for template.html at: ${templateHtmlPath}`
        );

        if (fs.existsSync(templateHtmlPath)) {
          connection.console.log(`🔍 FIND-TEMPLATE: Found template.html!`);
          return templateHtmlPath;
        } else {
          connection.console.log(`🔍 FIND-TEMPLATE: template.html not found at this path`);
        }

        // Also check in the full import path directory (original logic)
        const templateHtmlPathFull = path.join(fullImportPath, 'template.html');
        connection.console.log(
          `🔍 FIND-TEMPLATE: Checking for template.html at full path: ${templateHtmlPathFull}`
        );

        if (fs.existsSync(templateHtmlPathFull)) {
          connection.console.log(`🔍 FIND-TEMPLATE: Found template.html at full path!`);
          return templateHtmlPathFull;
        } else {
          connection.console.log(`🔍 FIND-TEMPLATE: template.html not found at full path`);
        }

        // Also try templateName.html
        const templateNamePath = path.join(path.dirname(fullImportPath), `${templateName}.html`);
        connection.console.log(
          `🔍 FIND-TEMPLATE: Checking for ${templateName}.html at: ${templateNamePath}`
        );

        if (fs.existsSync(templateNamePath)) {
          connection.console.log(`🔍 FIND-TEMPLATE: Found ${templateName}.html!`);
          return templateNamePath;
        } else {
          connection.console.log(`🔍 FIND-TEMPLATE: ${templateName}.html not found at this path`);
        }
      } else {
        connection.console.log(
          `🔍 FIND-TEMPLATE: Could not extract import path from: ${importLine}`
        );
      }
    }

    connection.console.log(`🔍 FIND-TEMPLATE: No template file found for ${templateName}`);
    return null;
  } catch (error) {
    console.error(`🔍 FIND-TEMPLATE: Error finding template file for ${templateName}:`, error);
    return null;
  }
}

// Helper function to find the TypeScript file for a given template name
function findTemplateTypeScriptFile(
  jsFilePath: string,
  templateName: string,
  fs: any,
  path: any,
  connection: any
): string | null {
  try {
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const dir = path.dirname(jsFilePath);

    connection.console.log(
      `🔍 FIND-TS: Looking for TypeScript file for template "${templateName}" from JS file: ${jsFilePath}`
    );

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
        connection.console.log(`🔍 FIND-TS: Extracted import path: ${importPath}`);

        let fullImportPath: string;

        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          fullImportPath = path.resolve(dir, importPath);
          connection.console.log(`🔍 FIND-TS: Resolved relative path to: ${fullImportPath}`);
        } else {
          connection.console.log(`🔍 FIND-TS: Skipping non-relative import: ${importPath}`);
          continue;
        }

        // For imports like './nestedTemplate/nestedTemplate', look for the .ts file
        const templateTsPath = `${fullImportPath}.ts`;
        connection.console.log(`🔍 FIND-TS: Checking for TypeScript file at: ${templateTsPath}`);

        if (fs.existsSync(templateTsPath)) {
          connection.console.log(`🔍 FIND-TS: Found TypeScript file!`);
          return templateTsPath;
        } else {
          connection.console.log(`🔍 FIND-TS: TypeScript file not found at this path`);
        }

        // Also try the directory approach - look in the import directory
        const importDir = path.dirname(importPath);
        const importDirResolved = path.resolve(dir, importDir);
        const templateTsInDir = path.join(importDirResolved, `${templateName}.ts`);
        connection.console.log(
          `🔍 FIND-TS: Checking for TypeScript file in directory: ${templateTsInDir}`
        );

        if (fs.existsSync(templateTsInDir)) {
          connection.console.log(`🔍 FIND-TS: Found TypeScript file in directory!`);
          return templateTsInDir;
        } else {
          connection.console.log(`🔍 FIND-TS: TypeScript file not found in directory`);
        }
      }
    }

    connection.console.log(`🔍 FIND-TS: No TypeScript file found for ${templateName}`);
    return null;
  } catch (error) {
    console.error(`🔍 FIND-TS: Error finding TypeScript file for ${templateName}:`, error);
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
    console.log(`🔎 EXTRACT-PROPS: No template block found for "${templateName}"`);
    return [];
  }

  const templateBody = templateMatch[1];
  console.log(`🔎 EXTRACT-PROPS: Template body length: ${templateBody.length} chars`);

  // Extract properties from handlebars expressions
  // Match patterns like {{property}}, {{#if property}}, {{property.subprop}}, etc.
  const handlebarsPattern = /\{\{[^{}]*?\}\}/g;
  const matches = templateBody.match(handlebarsPattern) || [];

  console.log(`🔎 EXTRACT-PROPS: Found ${matches.length} handlebars expressions`);
  matches.forEach((match, index) => {
    console.log(`🔎 EXTRACT-PROPS: Match ${index + 1}: ${match}`);
  });

  matches.forEach(match => {
    // Clean up the match - remove {{ }} and any # or / prefixes
    const content = match
      .replace(/^\{\{[#/]?/, '')
      .replace(/\}\}$/, '')
      .trim();
    console.log(`🔎 EXTRACT-PROPS: Processing content: "${content}"`);

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
      console.log(`🔎 EXTRACT-PROPS: Skipping built-in/control: "${content}"`);
      return;
    }

    // Extract the root property name (before any dots or spaces)
    const propertyMatch = content.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (propertyMatch) {
      const property = propertyMatch[1];
      // Skip common template helpers that aren't data properties
      if (!['if', 'each', 'unless', 'with', 'let'].includes(property)) {
        console.log(`🔎 EXTRACT-PROPS: Adding property: "${property}"`);
        properties.add(property);
      } else {
        console.log(`🔎 EXTRACT-PROPS: Skipping template helper: "${property}"`);
      }
    } else {
      console.log(`🔎 EXTRACT-PROPS: No property match for: "${content}"`);
    }
  });

  const result = Array.from(properties).sort();
  console.log(`🔎 EXTRACT-PROPS: Final properties: ${result.join(', ')}`);
  return result;
}

// Helper function to extract data properties from TypeScript type definitions
function extractDataPropertiesFromTypes(
  tsFilePath: string,
  templateName: string,
  fs: any
): string[] {
  const properties = new Set<string>();

  try {
    const tsFileContent = fs.readFileSync(tsFilePath, 'utf8');
    console.log(`🔧 EXTRACT-TYPES: Analyzing TypeScript file: ${tsFilePath}`);

    // Look for type definitions like: type TemplateNameData = { ... }
    // Convert templateName to PascalCase for type name matching
    const pascalTemplateName = templateName.charAt(0).toUpperCase() + templateName.slice(1);
    const typeNames = [
      `${pascalTemplateName}Data`,
      `${templateName}Data`,
      `${pascalTemplateName}TemplateData`,
      `${templateName}TemplateData`
    ];

    console.log(`🔧 EXTRACT-TYPES: Looking for type names: ${typeNames.join(', ')}`);

    for (const typeName of typeNames) {
      // Match type definitions: type TypeName = { ... }
      const typePattern = new RegExp(`type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`, 'i');
      const typeMatch = tsFileContent.match(typePattern);

      if (typeMatch) {
        console.log(`🔧 EXTRACT-TYPES: Found type definition: ${typeName}`);
        const typeBody = typeMatch[1];
        console.log(`🔧 EXTRACT-TYPES: Type body: ${typeBody}`);

        // Extract property names from the type body
        // Split by lines and process each line to avoid nested objects
        const lines = typeBody.split('\n');
        let braceDepth = 0;

        for (const line of lines) {
          const trimmedLine = line.trim();
          console.log(`🔧 EXTRACT-TYPES: Processing line (depth ${braceDepth}): "${trimmedLine}"`);

          // Check if this line contains a property at the current level (before counting braces)
          if (braceDepth === 0 && trimmedLine.match(/^\s*(\w+)\s*:\s*[^;{]+[;}]/)) {
            const propertyMatch = trimmedLine.match(/^\s*(\w+)\s*:\s*/);
            if (propertyMatch) {
              const propertyName = propertyMatch[1];
              // Skip comments and TypeScript keywords
              if (
                !propertyName.startsWith('//') &&
                !['readonly', 'public', 'private', 'protected'].includes(propertyName)
              ) {
                console.log(`🔧 EXTRACT-TYPES: Found top-level property: ${propertyName}`);
                properties.add(propertyName);
              }
            }
          }

          // Count braces to update depth for next iteration
          for (const char of trimmedLine) {
            if (char === '{') {
              braceDepth++;
              console.log(`🔧 EXTRACT-TYPES: Opening brace, depth now: ${braceDepth}`);
            } else if (char === '}') {
              braceDepth--;
              console.log(`🔧 EXTRACT-TYPES: Closing brace, depth now: ${braceDepth}`);
            }
          }
        }
        break; // Found the type, no need to check others
      } else {
        console.log(`🔧 EXTRACT-TYPES: Type ${typeName} not found`);
      }
    }

    // Also look for interface definitions: interface TemplateNameData { ... }
    for (const typeName of typeNames) {
      const interfacePattern = new RegExp(`interface\\s+${typeName}\\s*\\{([\\s\\S]*?)\\}`, 'i');
      const interfaceMatch = tsFileContent.match(interfacePattern);

      if (interfaceMatch) {
        console.log(`🔧 EXTRACT-TYPES: Found interface definition: ${typeName}`);
        const interfaceBody = interfaceMatch[1];

        // Split by lines and process each line to avoid nested objects
        const lines = interfaceBody.split('\n');
        let braceDepth = 0;

        for (const line of lines) {
          const trimmedLine = line.trim();
          console.log(
            `🔧 EXTRACT-TYPES: Processing interface line (depth ${braceDepth}): "${trimmedLine}"`
          );

          // Check if this line contains a property at the current level (before counting braces)
          if (braceDepth === 0 && trimmedLine.match(/^\s*(\w+)\s*:\s*[^;{]+[;}]/)) {
            const propertyMatch = trimmedLine.match(/^\s*(\w+)\s*:\s*/);
            if (propertyMatch) {
              const propertyName = propertyMatch[1];
              if (
                !propertyName.startsWith('//') &&
                !['readonly', 'public', 'private', 'protected'].includes(propertyName)
              ) {
                console.log(
                  `🔧 EXTRACT-TYPES: Found top-level interface property: ${propertyName}`
                );
                properties.add(propertyName);
              }
            }
          }

          // Count braces to update depth for next iteration
          for (const char of trimmedLine) {
            if (char === '{') {
              braceDepth++;
              console.log(`🔧 EXTRACT-TYPES: Interface opening brace, depth now: ${braceDepth}`);
            } else if (char === '}') {
              braceDepth--;
              console.log(`🔧 EXTRACT-TYPES: Interface closing brace, depth now: ${braceDepth}`);
            }
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error(`🔧 EXTRACT-TYPES: Error extracting types from ${tsFilePath}:`, error);
  }

  const result = Array.from(properties).sort();
  console.log(`🔧 EXTRACT-TYPES: Final type properties: ${result.join(', ')}`);
  return result;
}

export default onCompletion;
