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
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

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
    // This pattern handles multiline template inclusions by matching across line breaks
    const templateParameterMatch = textBeforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)[\s\S]*?$/);
    const isTemplateParameter = templateParameterMatch !== null && !isTemplateInclusion;
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
        document
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

    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName, fs, path);
    if (!associatedFile) {
      return completions;
    }

    // Parse imports from the associated file
    const importedTemplates = parseTemplateImports(associatedFile, fs, path);

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

    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFile(currentDir, currentBaseName, fs, path);
    if (!associatedFile) {
      return completions;
    }

    // Parse imports from the associated file to find the template
    const importedTemplates = parseTemplateImports(associatedFile, fs, path);

    if (!importedTemplates.includes(templateName)) {

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

      return completions;
    }

    // Read and analyze the template file for data properties
    const templateContent = fs.readFileSync(templateFile, 'utf8');
    const templateDataProperties = extractDataPropertiesFromTemplate(templateContent, templateName);

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

      typeDataProperties = extractDataPropertiesFromTypes(templateTsFile, templateName, fs);
    } else {

    }

    // Combine both sources of data properties
    const allDataProperties = [
      ...new Set([...templateDataProperties, ...typeDataProperties])
    ].sort();

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

    });

  } catch (error) {

  }

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

    // Parse import statements to find where this template comes from
    const importLines = jsFileContent
      .split('\n')
      .filter((line: string) => line.trim().startsWith('import') && line.includes(templateName));

    importLines.forEach((line: string, index: number) => {

    });

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
          fullImportPath = path.resolve(dir, importPath);

        } else {

          continue; // Skip non-relative imports
        }

        // For imports like './nestedTemplate/nestedTemplate', we need to check the parent directory
        // Extract the directory part of the import path
        const importDir = path.dirname(importPath);
        const importDirResolved = path.resolve(dir, importDir);

        // Look for template.html in the import directory (not the full import path)
        const templateHtmlPath = path.join(importDirResolved, 'template.html');

        if (fs.existsSync(templateHtmlPath)) {

          return templateHtmlPath;
        } else {

        }

        // Also check in the full import path directory (original logic)
        const templateHtmlPathFull = path.join(fullImportPath, 'template.html');

        if (fs.existsSync(templateHtmlPathFull)) {

          return templateHtmlPathFull;
        } else {

        }

        // Also try templateName.html
        const templateNamePath = path.join(path.dirname(fullImportPath), `${templateName}.html`);

        if (fs.existsSync(templateNamePath)) {

          return templateNamePath;
        } else {

        }
      } else {

      }
    }

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
          fullImportPath = path.resolve(dir, importPath);

        } else {

          continue;
        }

        // For imports like './nestedTemplate/nestedTemplate', look for the .ts file
        const templateTsPath = `${fullImportPath}.ts`;

        if (fs.existsSync(templateTsPath)) {

          return templateTsPath;
        } else {

        }

        // Also try the directory approach - look in the import directory
        const importDir = path.dirname(importPath);
        const importDirResolved = path.resolve(dir, importDir);
        const templateTsInDir = path.join(importDirResolved, `${templateName}.ts`);

        if (fs.existsSync(templateTsInDir)) {

          return templateTsInDir;
        } else {

        }
      }
    }

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

    return [];
  }

  const templateBody = templateMatch[1];

  // Extract properties from handlebars expressions
  // Match patterns like {{property}}, {{#if property}}, {{property.subprop}}, etc.
  const handlebarsPattern = /\{\{[^{}]*?\}\}/g;
  const matches = templateBody.match(handlebarsPattern) || [];

  matches.forEach((match, index) => {

  });

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
      } else {

      }
    } else {

    }
  });

  const result = Array.from(properties).sort();

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

        for (const line of lines) {
          const trimmedLine = line.trim();

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

                properties.add(propertyName);
              }
            }
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
      } else {

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

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Check if this line contains a property at the current level (before counting braces)
          if (braceDepth === 0 && trimmedLine.match(/^\s*(\w+)\s*:\s*[^;{]+[;}]/)) {
            const propertyMatch = trimmedLine.match(/^\s*(\w+)\s*:\s*/);
            if (propertyMatch) {
              const propertyName = propertyMatch[1];
              if (
                !propertyName.startsWith('//') &&
                !['readonly', 'public', 'private', 'protected'].includes(propertyName)
              ) {
                properties.add(propertyName);
              }
            }
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
    console.error(`🔧 EXTRACT-TYPES: Error extracting types from ${tsFilePath}:`, error);
  }

  const result = Array.from(properties).sort();

  return result;
}

export default onCompletion;
