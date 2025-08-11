import * as path from 'path';

import {
  DefinitionParams,
  Location
} from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../types';
import { containsMeteorTemplates } from '../helpers/containsMeteorTemplates';
import { getWordRangeAtPosition } from '../helpers/getWordRangeAtPosition';
import { isWithinHandlebarsExpression } from '../helpers/isWithinHandlebarsExpression';

const onDefinition = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return (params: DefinitionParams): Location[] | null => {
    connection.console.log('Definition requested');
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log('No document found for definition');
      return null;
    }

    // Only provide definitions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      connection.console.log('No Meteor templates found for definition');
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);
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
      return null; // Only provide definitions inside templates
    }

    // Check if we're inside a handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);
    if (!handlebarsInfo.isWithin) {
      connection.console.log('Cursor not within handlebars expression for definition');
      return null;
    }

    // Get word at current position
    const wordRange = getWordRangeAtPosition(document, params.position);
    if (!wordRange) {
      return null;
    }

    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end)
    );

    connection.console.log(`Looking for definition of "${word}" within handlebars expression`);

    // Look for this helper in analyzed files using directory-specific keys
    const dirLookupKeys = [`${dir}/${baseName}`, `${dir}/${currentTemplateName}`].filter(Boolean);

    for (const key of dirLookupKeys) {
      const helpers = config.fileAnalysis.jsHelpers.get(key as string);
      if (helpers && helpers.includes(word)) {
        try {
          // Extract filename from directory-specific key
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
              const content = require('fs').readFileSync(file, 'utf8');

              // Find the helper definition in the file
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const helperRegex = new RegExp(
                  `\\b${word}\\s*[:=]?\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)`
                );
                const match = helperRegex.exec(line);
                if (match) {
                  connection.console.log(
                    `Found definition of "${word}" at line ${i + 1} in ${file}`
                  );
                  return [
                    {
                      uri: `file://${file}`,
                      range: {
                        start: { line: i, character: match.index || 0 },
                        end: { line: i, character: (match.index || 0) + word.length }
                      }
                    }
                  ];
                }
              }
            }
          }
        } catch (error) {
          connection.console.log(`Error finding definition: ${error}`);
        }
      }
    }

    return null;
  };
};

export default onDefinition;
