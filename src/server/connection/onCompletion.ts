import * as path from 'path';

import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
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

    const completions: CompletionItem[] = [];

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
      const dirLookupKeys = [`${dir}/${baseName}`, `${dir}/${currentTemplateName}`].filter(Boolean);

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
      });

      // Fetch config for blockConditions and blazeHelpers
      let blockTypes = [
        { type: 'if', label: 'if' },
        { type: 'each', label: 'each' },
        { type: 'unless', label: 'unless' },
        { type: 'with', label: 'with' }
      ];

      // Built-in blaze helpers
      let blazeHelpers = [
        { name: '#each', doc: 'Iterate over a list' },
        { name: '#if', doc: 'Conditional rendering' },
        { name: '#unless', doc: 'Inverse conditional rendering' },
        { name: '#with', doc: 'Change data context' },
        { name: '#let', doc: 'Define local variables' },
        { name: '@index', doc: 'Current index in #each loop' },
        { name: '@key', doc: 'Current key in #each loop' },
        { name: '@first', doc: 'True if first item in #each loop' },
        { name: '@last', doc: 'True if last item in #each loop' },
        { name: 'this', doc: 'Current data context' }
      ];
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

export default onCompletion;
