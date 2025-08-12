import path from 'path';

import { Hover, MarkupKind, TextDocumentPositionParams } from 'vscode-languageserver/node';

import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '../helpers/findEnclosingEachInContext';
import { getWordRangeAtPosition } from '../helpers/getWordRangeAtPosition';
import { isWithinHandlebarsExpression } from '../helpers/isWithinHandlebarsExpression';
import { trimUsageDocumentation } from '../helpers/trimUsageDocumentation';
import { CurrentConnectionConfig } from '../../types';

const onHover = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return async (textDocumentPosition: TextDocumentPositionParams): Promise<Hover | null> => {
    connection.console.log('Hover requested');
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      connection.console.log('No document found for hover');
      return null;
    }

    // Only provide hover info if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found for hover');
      return null;
    }

    connection.console.log(`Hover on document: ${document.uri}`);

    const text = document.getText();
    const offset = document.offsetAt(textDocumentPosition.position);
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
      connection.console.log('Cursor not within handlebars expression for hover');
      return null;
    }

    connection.console.log(`Hovering over "${word}" within handlebars expression`);
    connection.console.log(`[HOVER DEBUG] Current template: ${currentTemplateName}`);
    connection.console.log(`[HOVER DEBUG] File path: ${filePath}`);
    connection.console.log(`[HOVER DEBUG] Dir: ${dir}`);
    connection.console.log(`[HOVER DEBUG] Base name: ${baseName}`);

    // Check each-in context before entering the main loop
    const documentText = document.getText();
    const cursorOffset = document.offsetAt(textDocumentPosition.position);
    connection.console.log(`[EACH DEBUG] Document text length: ${documentText.length}`);
    connection.console.log(`[EACH DEBUG] Cursor offset: ${cursorOffset}`);
    connection.console.log(
      `[EACH DEBUG] Text around cursor (±50 chars): "${documentText.slice(
        Math.max(0, cursorOffset - 50),
        cursorOffset + 50
      )}"`
    );

    const eachCtx = findEnclosingEachInContext(documentText, cursorOffset);
    connection.console.log(`[EACH DEBUG] Context detection: ${JSON.stringify(eachCtx)}`);

    // Look for this helper in analyzed files using directory-specific keys
    const dirLookupKeys = [`${dir}/${currentTemplateName}`, `${dir}/${baseName}`].filter(Boolean);

    connection.console.log(`[HOVER DEBUG] Lookup keys: ${JSON.stringify(dirLookupKeys)}`);
    connection.console.log(
      `[HOVER DEBUG] Available helpers map keys: ${JSON.stringify(
        Array.from(config.fileAnalysis.jsHelpers.keys())
      )}`
    );

    for (const key of dirLookupKeys) {
      const helpers = config.fileAnalysis.jsHelpers.get(key as string);
      const helperDetails = config.fileAnalysis.helperDetails.get(key as string);
      const dataProps = config.fileAnalysis.dataProperties?.get(key as string) || [];
      const typeName = config.fileAnalysis.dataTypeByKey?.get(key as string);
      const typeMap = config.fileAnalysis.dataPropertyTypesByKey?.get(key as string) || {};

      connection.console.log(
        `[HOVER DEBUG] Key "${key}" → Helpers: ${helpers ? JSON.stringify(helpers) : 'NONE'}`
      );
      connection.console.log(
        `[HOVER DEBUG] Key "${key}" → HelperDetails: ${
          helperDetails ? helperDetails.length + ' items' : 'NONE'
        }`
      );
      connection.console.log(
        `[HOVER DEBUG] Key "${key}" → DataProps: ${JSON.stringify(dataProps)}`
      );
      connection.console.log(`[HOVER DEBUG] Key "${key}" → TypeMap: ${JSON.stringify(typeMap)}`);
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

      // #each alias hover: allow hover on alias even if it's not part of template data properties
      if (eachCtx && eachCtx.alias === word) {
        connection.console.log(`[EACH DEBUG] Processing alias hover for "${word}"`);
        const templateFileName = path.basename(filePath);
        let listType = typeMap[eachCtx.source];

        // If not found in data properties, check if it's a helper with a return type
        if (!listType) {
          const helperInfo = helperDetails?.find(h => h.name === eachCtx.source);
          if (helperInfo?.returnType) {
            listType = helperInfo.returnType;
            connection.console.log(
              `[EACH DEBUG] Found helper "${eachCtx.source}" with return type: ${listType}`
            );
          } else {
            connection.console.log(
              `[EACH DEBUG] No helper found for "${eachCtx.source}" or no return type`
            );
          }
        } else {
          connection.console.log(`[EACH DEBUG] Found list type in typeMap: ${listType}`);
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

        connection.console.log(
          `[EACH DEBUG] alias="${word}", source="${eachCtx.source}", listType="${listType}", aliasType="${aliasType}"`
        );

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

export default onHover;
