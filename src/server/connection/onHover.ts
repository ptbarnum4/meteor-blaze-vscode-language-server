import path from 'path';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover, MarkupKind, TextDocumentPositionParams } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { analyzeGlobalHelpers } from '../helpers/analyzeGlobalHelpers';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '../helpers/findEnclosingEachInContext';
import { getWordRangeAtPosition } from '../helpers/getWordRangeAtPosition';
import { isWithinHandlebarsExpression } from '../helpers/isWithinHandlebarsExpression';
import { isWithinComment } from '../helpers/isWithinComment';
import {
  trimLanguageDocumentation,
  trimUsageDocumentation
} from '../helpers/trimUsageDocumentation';

const onHover = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return async (textDocumentPosition: TextDocumentPositionParams): Promise<Hover | null> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return null;
    }

    // Only provide hover info if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);

    // Check if we're inside any type of comment (HTML, Handlebars, JS/TS)
    const commentInfo = isWithinComment(text, offset);
    if (commentInfo.isWithin) {
      return null; // Don't provide hover info inside comments
    }

    const filePath = document.uri.replace('file://', '');
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check if we're in a template block and get template name
    const beforeCursor = text.substring(0, offset);
    const templateMatch = beforeCursor.match(
      /<template\s+name=["']([^"']+)["'][^>]*>(?:(?!<\/template>)[\s\S])*$/
    );
    const currentTemplateName = templateMatch ? templateMatch[1] : null;

    if (!currentTemplateName) {
      return null; // Only provide hover info inside templates
    }

    // Get word at current position
    const wordRange = getWordRangeAtPosition(document, textDocumentPosition.position);
    if (!wordRange) {
      return null;
    }

    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end)
    );

    // Check if we're inside a handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      return null;
    }

    // Check if we're hovering over a template inclusion ({{> templateName)
    const textBeforeOffset = text.substring(0, offset);
    const afterCursor = text.substring(offset);
    const templateInclusionPattern = /\{\{\s*>\s*([a-zA-Z0-9_]+)/;

    // Check if the word is preceded by {{>
    const precedingText = text.substring(Math.max(0, offset - 50), offset + word.length);
    const templateInclusionMatch = precedingText.match(templateInclusionPattern);

    if (templateInclusionMatch && templateInclusionMatch[1] === word) {
      const templateHover = await getTemplateInclusionHover(word, config, document);
      if (templateHover) {
        return {
          contents: templateHover,
          range: wordRange
        };
      }
    }

    // Check if we're hovering over a template parameter (e.g., {{> templateName param=value}})
    const templateParameterHover = await getTemplateParameterHover(text, offset, word, dir);
    if (templateParameterHover) {
      return {
        contents: templateParameterHover,
        range: wordRange
      };
    }

    // Check each-in context before entering the main loop
    const documentText = document.getText();
    const cursorOffset = document.offsetAt(textDocumentPosition.position);

    const eachCtx = findEnclosingEachInContext(documentText, cursorOffset);

    // Look for this helper in analyzed files using directory-specific keys
    const dirLookupKeys = [`${dir}/${currentTemplateName}`, `${dir}/${baseName}`].filter(Boolean);

    for (const key of dirLookupKeys) {
      const helpers = config.fileAnalysis.jsHelpers.get(key as string);
      const helperDetails = config.fileAnalysis.helperDetails.get(key as string);
      const dataProps = config.fileAnalysis.dataProperties?.get(key as string) || [];
      const typeName = config.fileAnalysis.dataTypeByKey?.get(key as string);
      const typeMap = config.fileAnalysis.dataPropertyTypesByKey?.get(key as string) || {};

      if (helpers && helpers.includes(word)) {
        // Find the detailed information for this helper
        const helperInfo = helperDetails?.find(h => h.name === word);

        // Get template file info
        const templateFileName = path.basename(filePath);

        const hoverContent = [`**${word}** - Template Helper`, ``];

        // Add JSDoc description if available
        if (helperInfo?.jsdoc) {
          hoverContent.push(`**Description:** ${helperInfo.jsdoc}`);
          hoverContent.push(``);
        }

        // Add signature information
        if (helperInfo?.signature) {
          hoverContent.push(`**Signature:** \`${helperInfo.signature}\``);
          hoverContent.push(``);
        }

        // Add return type if available
        if (helperInfo?.returnType) {
          hoverContent.push(`**Returns:** \`${helperInfo.returnType}\``);
          hoverContent.push(``);
        }

        // Add parameters if available
        if (helperInfo?.parameters) {
          hoverContent.push(`**Parameters:** ${helperInfo.parameters}`);
          hoverContent.push(``);
        }

        hoverContent.push(`**Template:** ${currentTemplateName}`);
        hoverContent.push(``);
        hoverContent.push(`**Template File:** ${templateFileName}`);
        hoverContent.push(``);

        // Try to find the source file
        let actualSourceFile = 'Unknown';
        try {
          // Extract filename from directory-specific key (e.g., "/path/to/test" -> "test")
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];

          // Try multiple possible file names based on template name and HTML file base name
          const possibleFiles = [
            path.join(dir, `${keyBaseName}.js`),
            path.join(dir, `${keyBaseName}.ts`),
            path.join(dir, `${currentTemplateName}.js`),
            path.join(dir, `${currentTemplateName}.ts`),
            path.join(dir, `${baseName}.js`),
            path.join(dir, `${baseName}.ts`)
          ];

          for (const file of possibleFiles) {
            if (require('fs').existsSync(file)) {
              actualSourceFile = path.basename(file);
              break;
            }
          }
        } catch (error) {
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];
          actualSourceFile = `${keyBaseName}.js/ts`;
        }

        hoverContent.push(`**Source:** ${actualSourceFile}\n`);

        // Build usage string including parameter names when available
        let usage = `{{${word}}}`;
        try {
          const paramNames: string[] = [];
          const sig = helperInfo?.signature;
          const paramsRaw = helperInfo?.parameters;
          const extractNames = (raw: string) => {
            // Split by commas not inside generics or parentheses (simple heuristic)
            const parts = raw
              .split(/,(?![^<]*>|[^()]*\))/)
              .map(p => p.trim())
              .filter(Boolean);
            for (const p of parts) {
              // Take everything before ':' or '=' and strip optional '?'
              const nameMatch = p.match(/^([A-Za-z_$][\w$]*)\s*[?:=]?/);
              if (nameMatch) {
                paramNames.push(nameMatch[1]);
              }
            }
          };
          if (sig) {
            const m = sig.match(/^[^(]*\((.*)\)/);
            if (m && m[1].trim().length > 0) {
              extractNames(m[1]);
            }
          } else if (paramsRaw && paramsRaw.trim().length > 0) {
            extractNames(paramsRaw);
          }
          if (paramNames.length > 0) {
            usage = `{{${word} ${paramNames.join(' ')}}}`;
          }
        } catch {}

        hoverContent.push(`**Usage:** \`${usage}\``);

        // No additional generic text needed - the structured information above is sufficient

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent.join('\n')
          },
          range: wordRange
        };
      }
    }

    // Check for global helpers from Template.registerHelper
    // Find workspace root by looking for package.json or .meteor directory
    const currentFileUri = textDocumentPosition.textDocument.uri;
    const currentFilePath = currentFileUri.replace('file://', '');
    let workspaceRoot = path.dirname(currentFilePath);

    // Walk up the directory tree to find workspace root
    while (workspaceRoot !== path.dirname(workspaceRoot)) {
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const meteorPath = path.join(workspaceRoot, '.meteor');

      if (require('fs').existsSync(packageJsonPath) || require('fs').existsSync(meteorPath)) {
        break;
      }

      workspaceRoot = path.dirname(workspaceRoot);
    }

    try {
      // Find workspace root by looking for package.json or .meteor directory
      const currentFileUri = textDocumentPosition.textDocument.uri;

      // Skip global helpers analysis in test environment or for test URIs
      if (
        process.env.NODE_ENV === 'test' ||
        currentFileUri.includes('/nonexistent.') ||
        currentFileUri.includes('/test.')
      ) {
        // Skip global helpers during testing
        return null;
      }

      // Add timeout to prevent hanging during tests or large projects
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Global helpers analysis timed out')), 5000);
      });

      const globalHelpersResult = await Promise.race([
        analyzeGlobalHelpers(workspaceRoot),
        timeoutPromise
      ]);

      const globalHelper = globalHelpersResult.helperDetails.find(
        (helper: any) => helper.name === word
      );
      if (globalHelper) {
        const hoverContent = [`**\`${word}\`** - Global Template Helper`, ``];

        // Add JSDoc description if available
        if (globalHelper.jsdoc) {
          hoverContent.push('```ts\n/**\n * ' + globalHelper.jsdoc.split('\n').join('\n * ') + '\n*/\n```');
          hoverContent.push(``);
        }

        // Add signature information
        if (globalHelper.signature) {
          hoverContent.push(`**Signature:** \`${globalHelper.signature}\``);
          hoverContent.push(``);
        }

        // Add return type if available
        if (globalHelper.returnType) {
          hoverContent.push(`**Returns:** \`${globalHelper.returnType}\``);
          hoverContent.push(``);
        }

        // Add parameters if available
        if (globalHelper.parameters) {
          hoverContent.push(`**Parameters:** ${globalHelper.parameters}`);
          hoverContent.push(``);
        }

        hoverContent.push(`**Source:** ${path.basename(globalHelper.filePath)}`);
        hoverContent.push(``);
        hoverContent.push(`**Usage:** \`{{${word}}}\``);

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent.join('\n')
          },
          range: wordRange
        };
      }
    } catch (error) {
      // Handle errors in global helpers analysis
      connection.console.error(`Error analyzing global helpers for hover: ${error}`);
    }

    for (const key of dirLookupKeys) {
      const helpers = config.fileAnalysis.jsHelpers.get(key as string);
      const helperDetails = config.fileAnalysis.helperDetails.get(key as string);
      const dataProps = config.fileAnalysis.dataProperties?.get(key as string) || [];
      const typeName = config.fileAnalysis.dataTypeByKey?.get(key as string);
      const typeMap = config.fileAnalysis.dataPropertyTypesByKey?.get(key as string) || {};

      // #each alias hover: allow hover on alias even if it's not part of template data properties
      if (eachCtx && eachCtx.alias === word) {
        const templateFileName = path.basename(filePath);
        let listType = typeMap[eachCtx.source];

        // If not found in data properties, check if it's a helper with a return type
        if (!listType) {
          const helperInfo = helperDetails?.find(h => h.name === eachCtx.source);
          if (helperInfo?.returnType) {
            listType = helperInfo.returnType;
          }
        }

        const deriveElementType = (t?: string): string | undefined => {
          if (!t) {
            return undefined;
          }
          const cleaned = t.trim().replace(/^\(|\)$/g, '');
          const first = cleaned.split('|')[0].trim();
          let m = first.match(/^\s*([^\[\]]+)\[\]\s*$/);
          if (m) {
            return m[1].trim();
          }
          m = first.match(
            /^\s*(?:Array|ReadonlyArray|Set|Iterable)\s*<\s*([^,>]+)(?:\s*,[^>]+)?\s*>\s*$/
          );
          if (m) {
            return m[1].trim();
          }
          m = first.match(/^\s*Map\s*<\s*[^,>]+,\s*([^>]+)\s*>\s*$/);
          if (m) {
            return m[1].trim();
          }
          m = first.match(/^\s*Mongo\.Cursor\s*<\s*([^>]+)\s*>\s*$/);
          if (m) {
            return m[1].trim();
          }
          return undefined;
        };
        const aliasType: string | undefined = deriveElementType(listType);

        const hoverLines: string[] = [];
        hoverLines.push(`**${word}** - Each item alias in \`${eachCtx.source}\``);
        hoverLines.push('');
        if (typeName) {
          hoverLines.push(`From type: \`${typeName}\``);
          hoverLines.push('');
        }
        if (aliasType) {
          hoverLines.push(`Type: \`${aliasType}\``);
          hoverLines.push('');
        }
        hoverLines.push(`**Template:** ${currentTemplateName}`);
        hoverLines.push('');
        hoverLines.push(`**Template File:** ${templateFileName}`);
        hoverLines.push('');
        hoverLines.push(`**Usage:** \`{{${word}}}\``);

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverLines.join('\n')
          },
          range: wordRange
        };
      }

      // Data property hover (includes #each value in list context awareness)
      if (dataProps.includes(word)) {
        const templateFileName = path.basename(filePath);
        const propType = typeMap[word];
        // Check #each alias context: `{{#each value in list}}` so value should use element type of list
        let adjustedType: string | undefined = propType;
        if (eachCtx && eachCtx.alias === word) {
          const listType = typeMap[eachCtx.source];
          const deriveElementType = (t?: string): string | undefined => {
            if (!t) {
              return undefined;
            }
            const cleaned = t.trim().replace(/^\(|\)$/g, '');
            const first = cleaned.split('|')[0].trim();
            let m = first.match(/^\s*([^\[\]]+)\[\]\s*$/);
            if (m) {
              return m[1].trim();
            }
            m = first.match(
              /^\s*(?:Array|ReadonlyArray|Set|Iterable)\s*<\s*([^,>]+)(?:\s*,[^>]+)?\s*>\s*$/
            );
            if (m) {
              return m[1].trim();
            }
            m = first.match(/^\s*Map\s*<\s*[^,>]+,\s*([^>]+)\s*>\s*$/);
            if (m) {
              return m[1].trim();
            }
            m = first.match(/^\s*Mongo\.Cursor\s*<\s*([^>]+)\s*>\s*$/);
            if (m) {
              return m[1].trim();
            }
            return undefined;
          };
          const elem = deriveElementType(listType);
          if (elem) {
            adjustedType = elem;
          }
        }
        let elementType: string | undefined;
        if (adjustedType) {
          // Extract array element type for forms like Type[] or Array<Type>
          const arrMatchBracket = adjustedType.match(/^\s*([^\[\]]+)\[\]\s*$/);
          const arrMatchGeneric = adjustedType.match(/^\s*Array\s*<\s*([^>]+)\s*>\s*$/);
          if (arrMatchBracket) {
            elementType = arrMatchBracket[1].trim();
          } else if (arrMatchGeneric) {
            elementType = arrMatchGeneric[1].trim();
          }
        }
        const hoverLines: string[] = [];
        hoverLines.push(`**${word}** - Template Data Property`);
        hoverLines.push('');
        if (typeName) {
          hoverLines.push(`From type: \`${typeName}\``);
          hoverLines.push('');
        }
        if (adjustedType) {
          hoverLines.push(`Type: \`${adjustedType}\``);
          if (elementType) {
            hoverLines.push(`Element type: \`${elementType}\``);
          }
          hoverLines.push('');
        }
        hoverLines.push(`**Template:** ${currentTemplateName}`);
        hoverLines.push('');
        hoverLines.push(`**Template File:** ${templateFileName}`);
        hoverLines.push('');
        hoverLines.push(`**Usage:** \`{{${word}}}\``);

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverLines.join('\n')
          },
          range: wordRange
        };
      }
    }

    // Check if it's a built-in or custom Blaze helper
    // Built-in blaze helpers
    let blazeHelpers = [
      {
        name: '#each',
        doc: 'Iterates over a list or cursor, creating a new data context for each item',
        usage: `
            <!--  items = ['Item 1', 'Item 2', 'Item 3'] -->
            {{#each items}}
              {{this}} <!-- Renders each item in the list -->
            {{/each}}
           <!--  Prefer named block syntax for better readability -->
            {{#each item in items}}
              {{item}} <!-- Renders each item in the list -->
            {{/each}}

            <!--
            For objects, iterates over key-value pairs
            For objects, iterates over key-value pairs
            items = [{ key: 'value1', thing: 'Hello' }, { key2: 'value2', thing: 'World' }]
            -->
            {{#each item in items}}
              Key: {{item.key}}
              Thing: {{item.thing}}
            {{/each}}
            `
      },
      {
        name: '#if',
        doc: 'Conditionally renders content based on a truthy expression',
        usage: `
            <!--  condition = true -->
            {{#if condition}}
              This content is rendered if condition is true
            {{/if}}

            <!--  condition = false -->
            {{#if condition}}
              This content is not rendered if condition is false
            {{/if}}
            <!--  With multiple conditions -->
            {{#if condition1 condition2 ...}}
              This content is rendered if both conditions are true
            {{/if}}

            <!--  With else block -->
            {{#if condition}}
              This content is rendered if condition is true
            {{else}}
              This content is rendered if condition is false
            {{/if}}
            `
      },
      {
        name: '#unless',
        doc: 'Conditionally renders content based on a falsy expression (opposite of if)',
        usage: `
            <!--  condition = false -->
            {{#unless condition}}
              This content is rendered if condition is false
            {{/unless}}

            <!--  condition = true -->
            {{#unless condition}}
              This content is not rendered if condition is true
            {{/unless}}

            <!--  With multiple conditions -->
            {{#unless condition1 condition2 ...}}
              This content is rendered if all conditions are false
            {{/unless}}

            <!--  With else block -->
            {{#unless condition}}
              This content is rendered if condition is false
            {{else}}
              This content is rendered if condition is true
            {{/unless}}
            `
      },
      {
        name: '#with',
        doc: 'Changes the data context for the block content',
        usage: `
            <!--  user = { name: 'John', age: 30 } -->
            {{#with user}}
              <p>Name: {{name}}</p>
              <p>Age: {{age}}</p>
            {{/with}}

            <!--  always used named params for the each block when using a #with inside or surrounding -->

            {{#each user in users}}
              {{#with processedUser user}}
                <p>
                  This content is not rendered if user is null.
                  Name: {{this.name}} <!-- 'this' refers to the current context inside #with -->
                  Age: {{this.age}}
                </p>
              {{/with}}
            {{/each}}
            `
      },
      {
        name: '#let',
        doc: 'Defines local template variables within the template block',
        usage: `
            <!--  user = { profile: { name: 'John', lastName: 'Doe' } } -->
            {{#let user.profile.name as firstName user.profile.lastName as lastName}}
              <p>Welcome, {{firstName}} {{lastName}}!</p>
              <p>Your full name is {{firstName}} {{lastName}}.</p>
            {{/let}}
            <!--  You can also use #let to define multiple variables at once -->
            {{#let user.profile as profile}}
              <p>Welcome, {{profile.name}} {{profile.lastName}}!</p>
              <p>Your full name is {{profile.name}} {{profile.lastName}}.</p>
            {{/let}}
            `
      },
      {
        name: '@index',
        doc: 'The current index in an #each loop (0-based)',
        usage: `
            <!-- NOTE: Only available inside an '#each' block -->
            <!-- items = ['Item 1', 'Item 2', 'Item 3'] -->
            {{#each items}}
              <p>Item {{@index}}: {{this}}</p>
            {{/each}}
            `
      },
      {
        name: '@key',
        doc: 'The current key in an #each loop over an object',
        usage: `
            <!-- NOTE: Only available inside an '#each' block -->
            <!-- items = { key1: 'Value 1', key2: 'Value 2' } -->
            {{#each items}}
              <p>Key: {{@key}}, Value: {{this}}</p>
            {{/each}}
            `
      },
      {
        name: '@first',
        doc: 'True if this is the first item in an #each loop',
        usage: `
            <!-- NOTE: Only available inside an '#each' block -->
            <!-- items = ['Item 1', 'Item 2', 'Item 3'] -->
            {{#each items}}
              {{#if @first}}
                <p>This is the first item: {{this}}</p>
              {{else}}
                <p>Not the first item: {{this}}</p>
              {{/if}}
            {{/each}}
            `
      },
      {
        name: '@last',
        doc: 'True if this is the last item in an #each loop',
        usage: `
            <!-- NOTE: Only available inside an '#each' block -->
            <!-- items = ['Item 1', 'Item 2', 'Item 3'] -->
            {{#each items}}
              {{#if @last}}
                <p>This is the last item: {{this}}</p>
              {{else}}
                <p>Not the last item: {{this}}</p>
              {{/if}}
            {{/each}}
            `
      },
      {
        name: 'this',
        doc: 'References the current data context',
        usage: `
            <!--
              data = {
                name: 'Robot',
                age: 42,
                user = { name: 'John', age: 30 }
              }
            -->

            <p>Name: {{this.name}}</p> <!-- 'this' refers to the current context // 'Robot' -->
            <p>Age: {{this.age}}</p> <!-- 'this' refers to the current context // 42 -->
            <!--  Used inside #with or #each blocks -->
            {{#with data.user}}
              <p>Name: {{this.name}}</p> <!-- 'this' refers to the user context // 'John' -->
              <p>Age: {{this.age}}</p>
            {{/with}}
            `
      }
    ];
    try {
      const workspaceConfig = await connection.workspace.getConfiguration('meteorLanguageServer');
      let hashColor = '#FF6B35';
      let nameColor = '#007ACC';
      if (typeof workspaceConfig?.blazeHelpers?.hashColor === 'string') {
        hashColor = workspaceConfig.blazeHelpers.hashColor;
      }
      if (typeof workspaceConfig?.blazeHelpers?.nameColor === 'string') {
        nameColor = workspaceConfig.blazeHelpers.nameColor;
      }
      // Merge extended blazeHelpers from config
      let extendedHelpers = [];
      if (Array.isArray(workspaceConfig?.blazeHelpers?.extend)) {
        extendedHelpers = workspaceConfig.blazeHelpers.extend
          .map((h: any) => {
            if (typeof h === 'string') {
              return { name: h, doc: '', usage: `{{${h}}}` };
            } else if (typeof h === 'object' && h !== null && typeof h.name === 'string') {
              return {
                name: h.name,
                doc: h.doc || '',
                usage: trimUsageDocumentation(h.name, h.usage)
              };
            }
            return null;
          })
          .filter(Boolean);
      }
      blazeHelpers = [...blazeHelpers, ...extendedHelpers];

      const foundHelper = blazeHelpers.find(h => h.name === word);
      if (foundHelper) {
        let coloredLabel = word;
        if (word.startsWith('#')) {
          coloredLabel = `<span style='color:${hashColor}'>#</span><span style='color:${nameColor}'>${word.slice(
            1
          )}</span>`;
        }
        let hoverLines = [`${coloredLabel} - Blaze Helper`, ``];
        if (foundHelper.doc) {
          hoverLines.push(foundHelper.doc, ``);
        }
        if (foundHelper.usage) {
          // Add syntax highlighting for usage
          hoverLines.push(
            `**Usage:**\n\`\`\`handlebars\n${trimUsageDocumentation(
              foundHelper.name,
              foundHelper.usage
            )}\n\`\`\``
          );
        } else {
          hoverLines.push(
            `**Usage:**\n\`\`\`handlebars\n{{${word}}}\n{{#${word}}}...{{/${word}}}\n\`\`\``
          );
        }
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverLines.join('\n')
          },
          range: wordRange
        };
      }
    } catch (e) {
      // Ignore config errors
    }

    return null;
  };
};

// Helper function to get hover information for template inclusions
async function getTemplateInclusionHover(
  templateName: string,
  config: CurrentConnectionConfig,
  currentDocument: TextDocument
): Promise<{ kind: MarkupKind; value: string } | null> {
  const { connection } = config;

  try {
    const fs = await import('fs');
    const path = await import('path');

    const currentFilePath = currentDocument.uri.replace('file://', '');
    const currentDir = path.dirname(currentFilePath);
    const currentBaseName = path.basename(currentFilePath, path.extname(currentFilePath));

    // Find associated JS/TS file
    const associatedFile = findAssociatedJSFileForHover(currentDir, currentBaseName, fs, path);

    if (!associatedFile) {
      return createTemplateNotFoundHover(templateName);
    }

    // Parse imports to see if this template is imported
    const importedTemplates = parseTemplateImportsForHover(associatedFile, fs, path);

    if (!importedTemplates.includes(templateName)) {
      return {
        kind: MarkupKind.Markdown,
        value: [
          `**${templateName}** - Template Include`,
          '',
          '⚠️ **Template not imported**',
          '',
          `The template \`${templateName}\` is not imported in the associated JavaScript/TypeScript file.`,
          '',
          `To use this template, add an import statement like:`,
          `\`\`\`typescript`,
          `import './${templateName}/${templateName}';`,
          `\`\`\``,
          '',
          `**Usage:** \`{{> ${templateName}}}\``
        ].join('\n')
      };
    }

    // Find the actual template file to show content preview
    const templateInfo = findImportedTemplateFile(templateName, associatedFile, fs, path);

    if (templateInfo) {
      const relativePath = path.relative(process.cwd(), templateInfo.file);

      // Get a preview of the template content (first few lines)
      const contentLines = templateInfo.content.split('\n');
      const preview = trimLanguageDocumentation(templateInfo.content, 'handlebars', 10);

      const hasMore = contentLines.length > 10;

      const hoverContent = [
        `**${templateName}** - Imported Template`,
        '',
        `**File:** \`${relativePath}\``,
        '',
        '✅ **Template imported** in associated file',
        '',
        '**Template Content:**',
        preview + (hasMore ? '\n...' : ''),
        '',
        `**Usage:** \`{{> ${templateName}}}\``,
        '',
        'This template is properly imported and available for inclusion.'
      ];

      return {
        kind: MarkupKind.Markdown,
        value: hoverContent.join('\n')
      };
    } else {
      return createTemplateNotFoundHover(templateName);
    }
  } catch (error) {
    return null;
  }
}

// Helper function for template not found hover
function createTemplateNotFoundHover(templateName: string): { kind: MarkupKind; value: string } {
  return {
    kind: MarkupKind.Markdown,
    value: [
      `**${templateName}** - Template Include`,
      '',
      '⚠️ **Template not found**',
      '',
      `No template with name \`${templateName}\` was found or it's not properly imported.`,
      '',
      'Make sure to:',
      '1. Import the template in your JavaScript/TypeScript file',
      '2. Check that the template name is correct',
      '3. Verify the template file exists',
      '',
      `**Usage:** \`{{> ${templateName}}}\``
    ].join('\n')
  };
}

// Helper function to find the associated JS/TS file for hover
function findAssociatedJSFileForHover(
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

// Helper function to parse template imports for hover
function parseTemplateImportsForHover(filePath: string, fs: any, path: any): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const templates: string[] = [];

    // Find tsconfig.json for this Meteor project (same as autocomplete)
    const tsconfig = findTsConfigForMeteorProject(path.dirname(filePath), fs, path);

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
            if (fs.existsSync(path.join(currentDir, '.meteor'))) {
              projectRoot = currentDir;
              break;
            }
            currentDir = path.dirname(currentDir);
          }

          // Try TypeScript path resolution
          const tsResolvedPath = resolveTsPath(importPath, tsconfig, projectRoot, path);

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
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
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
    }

    return templates;
  } catch (error) {
    console.error(`Error parsing template imports for hover from ${filePath}:`, error);
    return [];
  }
}

// Helper function to find tsconfig.json in the same directory as .meteor (for hover)
function findTsConfigForMeteorProject(startPath: string, fs: any, path: any): any {
  let currentDir = startPath;

  // Walk up the directory tree to find .meteor directory
  while (currentDir !== path.dirname(currentDir)) {
    const meteorDir = path.join(currentDir, '.meteor');
    if (fs.existsSync(meteorDir)) {
      // Found .meteor directory, look for tsconfig.json in the same directory
      const tsconfigPath = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');

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

// Safely remove comments from JSON content (for hover)
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

// TypeScript path resolution function (for hover)
function resolveTsPath(importPath: string, tsconfig: any, projectRoot: string, path: any): string | null {
  if (!tsconfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = '.', paths } = tsconfig.compilerOptions;
  const basePath = path.resolve(projectRoot, baseUrl);

  // Try to match the import path against tsconfig paths
  for (const [pattern, mappings] of Object.entries(paths) as [string, string[]][]) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '([^/]*)')  // Replace * with capture group
      .replace(/\//g, '\\/');     // Escape forward slashes

    const regex = new RegExp(`^${regexPattern}$`);
    const match = importPath.match(regex);

    if (match) {
      // Try each mapping
      for (const mapping of mappings) {
        let resolvedPath = mapping;

        // Replace captured groups in mapping
        for (let i = 1; i < match.length; i++) {
          resolvedPath = resolvedPath.replace('*', match[i]);
        }

        const fullPath = path.resolve(basePath, resolvedPath);
        return fullPath;
      }
    }
  }

  return null;
} // Helper function to find the imported template file and content
function findImportedTemplateFile(
  templateName: string,
  associatedFile: string,
  fs: any,
  path: any
): { file: string; content: string } | null {
  try {
    const content = fs.readFileSync(associatedFile, 'utf8');
    const associatedDir = path.dirname(associatedFile);

    // Find the import path for this template - including absolute imports
    const importPattern = new RegExp(
      `import\\s+['"](\\.\\.[^'"]*\\/${templateName}|\\.\\/${templateName}[^'"]*|\\/[^'"]*\\/${templateName}[^'"]*)['"]`,
      'g'
    );

    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      let fullImportPath;

      if (importPath.startsWith('/')) {
        // Absolute import - find project root
        let currentDir = associatedDir;
        let projectRoot = currentDir;

        while (currentDir !== path.dirname(currentDir)) {
          if (fs.existsSync(path.join(currentDir, '.meteor')) ||
              fs.existsSync(path.join(currentDir, 'package.json'))) {
            projectRoot = currentDir;
            break;
          }
          currentDir = path.dirname(currentDir);
        }

        fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
      } else {
        // Relative import
        fullImportPath = path.resolve(associatedDir, importPath);
      }

      // Try to find template.html in the import directory
      let templateHtmlPath;

      // For imports like './nestedTemplate/nestedTemplate' or '/imports/ui/template2/nestedTemplate2/nestedTemplate2'
      // the template.html is in the nestedTemplate or nestedTemplate2 directory
      const importDir = path.dirname(fullImportPath);
      templateHtmlPath = path.join(importDir, 'template.html');

      try {
        if (fs.existsSync(templateHtmlPath)) {
          const templateContent = fs.readFileSync(templateHtmlPath, 'utf8');
          const templatePattern = new RegExp(
            `<template\\s+name=["']${templateName}["'][^>]*>([\\s\\S]*?)<\\/template>`,
            'g'
          );
          const templateMatch = templatePattern.exec(templateContent);
          if (templateMatch) {
            return { file: templateHtmlPath, content: templateMatch[1].trim() };
          }
        }
      } catch (e) {
        // Continue trying other import paths
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding imported template file for ${templateName}:`, error);
    return null;
  }
}

// Helper function to provide hover information for template parameters
async function getTemplateParameterHover(
  text: string,
  offset: number,
  word: string,
  currentDir: string
): Promise<string | null> {
  const fs = require('fs');
  const path = require('path');

  try {
    // Get text around the cursor to determine context
    // Increase the window size to handle longer template inclusions
    const beforeCursor = text.substring(Math.max(0, offset - 500), offset);
    const afterCursor = text.substring(offset, Math.min(text.length, offset + 500));

    // Check if we're in template parameters: {{> templateName param=value}}
    // Use a more flexible pattern that handles multiline parameters
    const parameterMatch = beforeCursor.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)[\s\S]*$/);
    if (!parameterMatch) {
      return null;
    }

    const templateName = parameterMatch[1];

    // If the word is the template name itself, don't show parameter hover
    if (word === templateName) {
      return null;
    }

    // Also check if we're still within the template inclusion by looking for the closing }}
    const fullContext = beforeCursor + afterCursor;
    const templateInclusionPattern = new RegExp(
      `\\{\\{\\s*>\\s*${templateName}[\\s\\S]*?\\}\\}`,
      'g'
    );
    const matches = [...fullContext.matchAll(templateInclusionPattern)];

    // Find which match contains our current position
    let isInTemplateInclusion = false;
    for (const match of matches) {
      if (match.index !== undefined) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        const currentPos = beforeCursor.length; // Our position in the full context

        if (currentPos >= matchStart && currentPos <= matchEnd) {
          isInTemplateInclusion = true;
          break;
        }
      }
    }

    // If the above check failed, try a more lenient approach
    // Look for the most recent {{> templateName and the next }} after our position
    if (!isInTemplateInclusion) {
      const beforeText = text.substring(0, offset);
      const afterText = text.substring(offset);

      // Find the last template inclusion start before our position
      const lastTemplateMatch = beforeText.match(/\{\{\s*>\s*([a-zA-Z0-9_]+)[^}]*$/);

      // Find the next }} after our position
      const nextCloseMatch = afterText.match(/^[^}]*\}\}/);

      if (lastTemplateMatch && nextCloseMatch && lastTemplateMatch[1] === templateName) {
        isInTemplateInclusion = true;
      }
    }

    if (!isInTemplateInclusion) {
      return null;
    }

    // Find the associated JS/TS file for the current template to parse imports
    const currentBaseName = path.basename(currentDir);
    const associatedFile = findAssociatedJSFileForHover(currentDir, currentBaseName, fs, path);

    if (!associatedFile) {
      return null;
    }

    // Parse imports to see if this template is imported
    const importedTemplates = parseTemplateImportsForHover(associatedFile, fs, path);

    if (!importedTemplates.includes(templateName)) {
      return null;
    }

    // Find the actual template's TypeScript file using import resolution
    const templateTsFile = findTemplateTypeScriptFileForHover(associatedFile, templateName, fs, path);

    if (templateTsFile) {
      const content = fs.readFileSync(templateTsFile, 'utf8');

      // Check if it's a helper function first
      const helpersPattern = new RegExp(
        `Template\\.${templateName}\\.helpers\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
        'i'
      );
      const helpersMatch = content.match(helpersPattern);

      if (helpersMatch) {
        const helpersBody = helpersMatch[1];

        // Look for the parameter as a helper function
        const helperRegex = new RegExp(`\\b${word}\\s*\\([^)]*\\)\\s*:?\\s*([^{]*)\\{`, 'g');
        const helperMatch = helperRegex.exec(helpersBody);

        if (helperMatch) {
          const returnType = helperMatch[1].trim().replace(/^:\s*/, '') || 'any';

          // Try to extract JSDoc comment
          const lines = helpersBody.split('\n');
          let documentation = '';

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`${word}(`)) {
              // Look backwards for JSDoc comment
              for (let j = i - 1; j >= 0; j--) {
                const line = lines[j].trim();
                if (line.startsWith('/**')) {
                  // Found start of JSDoc, collect all lines
                  let jsdocLines = [];
                  for (let k = j; k <= i - 1; k++) {
                    const docLine = lines[k].trim();
                    if (docLine === '/**' || docLine === '*/') {
                      continue;
                    }
                    if (docLine.startsWith('*')) {
                      jsdocLines.push(docLine.substring(1).trim());
                    }
                  }
                  documentation = jsdocLines.join(' ').trim();
                  break;
                } else if (line.length === 0) {
                  continue;
                } else {
                  break;
                }
              }
              break;
            }
          }

          const hoverContent = [
            `**${word}** - Template Helper Function`,
            '',
            `**Template:** ${templateName}`,
            `**Returns:** \`${returnType}\``
          ];

          if (documentation) {
            hoverContent.splice(2, 0, `**Description:** ${documentation}`, '');
          }

          return hoverContent.join('\n');
        }
      }

      // Look for the parameter in type definitions
      const pascalTemplateName = templateName.charAt(0).toUpperCase() + templateName.slice(1);
      const typeNames = [
        `${pascalTemplateName}Data`,
        `${templateName}Data`,
        `${pascalTemplateName}TemplateData`,
        `${templateName}TemplateData`
      ];

      for (const typeName of typeNames) {
        const typePattern = new RegExp(
          `type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
          'i'
        );
        const typeMatch = content.match(typePattern);

        if (typeMatch) {
          const typeBody = typeMatch[1];
          const lines = typeBody.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const propertyMatch = line.match(new RegExp(`^\\s*(${word})\\s*:\\s*([^;]+);?`));

            if (propertyMatch) {
              const propertyType = propertyMatch[2].trim();

              // Look for JSDoc comment above this property
              let documentation = '';
              for (let j = i - 1; j >= 0; j--) {
                const prevLine = lines[j].trim();
                if (prevLine.startsWith('/**')) {
                  // Found start of JSDoc, collect all lines
                  let jsdocLines = [];
                  for (let k = j; k < i; k++) {
                    const docLine = lines[k].trim();
                    if (docLine === '/**' || docLine === '*/') {
                      continue;
                    }
                    if (docLine.startsWith('*')) {
                      jsdocLines.push(docLine.substring(1).trim());
                    }
                  }
                  documentation = jsdocLines.join(' ').trim();
                  break;
                } else if (prevLine.startsWith('//')) {
                  documentation = prevLine.replace(/^\/\/\s*/, '').trim();
                  break;
                } else if (prevLine.length === 0) {
                  continue;
                } else {
                  break;
                }
              }

              const hoverContent = [
                `**${word}** - Template Parameter`,
                '',
                `**Template:** ${templateName}`,
                `**Type:** \`${propertyType}\``
              ];

              if (documentation) {
                hoverContent.splice(2, 0, `**Description:** ${documentation}`, '');
              }

              return hoverContent.join('\n');
            }
          }
        }
      }
    }

    // If no TypeScript information found, provide basic parameter info
    return [
      `**${word}** - Template Parameter`,
      '',
      `**Template:** ${templateName}`,
      `**Type:** \`any\``,
      '',
      `Parameter passed to the \`${templateName}\` template.`
    ].join('\n');
  } catch (error) {
    console.error(`Error getting template parameter hover for ${word}:`, error);
    return null;
  }
}

// Helper function to find the TypeScript file for a template using import resolution (for hover)
function findTemplateTypeScriptFileForHover(
  associatedFile: string,
  templateName: string,
  fs: any,
  path: any
): string | null {
  try {
    const content = fs.readFileSync(associatedFile, 'utf8');
    const associatedDir = path.dirname(associatedFile);

    // Find the import path for this template - including absolute imports
    const importPattern = new RegExp(
      `import\\s+['"](\\.\\.[^'"]*\\/${templateName}|\\.\\/${templateName}[^'"]*|\\/[^'"]*\\/${templateName}[^'"]*)['"]`,
      'g'
    );

    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      let fullImportPath;

      if (importPath.startsWith('/')) {
        // Absolute import - find project root
        let currentDir = associatedDir;
        let projectRoot = currentDir;

        while (currentDir !== path.dirname(currentDir)) {
          if (fs.existsSync(path.join(currentDir, '.meteor')) ||
              fs.existsSync(path.join(currentDir, 'package.json'))) {
            projectRoot = currentDir;
            break;
          }
          currentDir = path.dirname(currentDir);
        }

        fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
      } else {
        // Relative import
        fullImportPath = path.resolve(associatedDir, importPath);
      }

      // Look for the TypeScript file
      const templateTsPath = `${fullImportPath}.ts`;

      if (fs.existsSync(templateTsPath)) {
        return templateTsPath;
      }

      // Also try in the directory
      const importDir = path.dirname(fullImportPath);
      const templateTsInDir = path.join(importDir, `${templateName}.ts`);

      if (fs.existsSync(templateTsInDir)) {
        return templateTsInDir;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding TypeScript file for hover for ${templateName}:`, error);
    return null;
  }
}

export default onHover;
