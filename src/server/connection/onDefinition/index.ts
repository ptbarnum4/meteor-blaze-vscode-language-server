import path from 'path';

import { DefinitionParams, Location } from 'vscode-languageserver/node';

import { containsMeteorTemplates } from '/server/helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '/server/helpers/findEnclosingEachInContext';
import { getWordRangeAtPosition } from '/server/helpers/getWordRangeAtPosition';
import { isWithinHandlebarsExpression } from '/server/helpers/isWithinHandlebarsExpression';
import { CurrentConnectionConfig } from '/types';

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

    const eachCtx = findEnclosingEachInContext(text, offset);

    // Look for this helper or data property in analyzed files using directory-specific keys
    const dirLookupKeys = [`${dir}/${currentTemplateName}`, `${dir}/${baseName}`].filter(Boolean);

    for (const key of dirLookupKeys) {
      const helpers = config.fileAnalysis.jsHelpers.get(key as string);
      const dataProps = config.fileAnalysis.dataProperties?.get(key as string) || [];
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
                // Updated regex to handle TypeScript method syntax: methodName(): ReturnType
                const helperRegex = new RegExp(
                  `\\b${word}\\s*(?:[:=]\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)|\\(\\)\\s*:\\s*[^{]+\\{)`
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

      // Navigate to template data property definition if applicable
      if (
        dataProps.includes(word) ||
        (eachCtx && (eachCtx.alias === word || eachCtx.source === word))
      ) {
        // Special case: if clicking on each-alias, redirect to search for the source helper
        if (eachCtx && eachCtx.alias === word) {
          const sourceHelperName = eachCtx.source;

          // Check if the source is a helper (not a data property)
          const helpers = config.fileAnalysis.jsHelpers.get(key as string);
          if (helpers && helpers.includes(sourceHelperName)) {
            // Redirect to helper search for the source
            try {
              const keyParts = key.split('/');
              const keyBaseName = keyParts[keyParts.length - 1];
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
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Updated regex to handle TypeScript method syntax: methodName(): ReturnType
                    const helperRegex = new RegExp(
                      `\\b${sourceHelperName}\\s*(?:[:=]\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)|\\(\\)\\s*:\\s*[^{]+\\{)`
                    );
                    const match = helperRegex.exec(line);
                    if (match) {
                      connection.console.log(
                        `Found definition of "${sourceHelperName}" (from alias "${word}") at line ${
                          i + 1
                        } in ${file}`
                      );
                      return [
                        {
                          uri: `file://${file}`,
                          range: {
                            start: { line: i, character: match.index || 0 },
                            end: {
                              line: i,
                              character: (match.index || 0) + sourceHelperName.length
                            }
                          }
                        }
                      ];
                    }
                  }
                }
              }
            } catch (error) {
              connection.console.log(`Error finding helper definition for alias: ${error}`);
            }
          }
        }

        // Continue with original data property logic for non-alias cases
        try {
          const keyParts = key.split('/');
          const keyBaseName = keyParts[keyParts.length - 1];
          const possibleFiles = [
            path.join(dir, `${keyBaseName}.ts`),
            path.join(dir, `${keyBaseName}.js`),
            path.join(dir, `${currentTemplateName}.ts`),
            path.join(dir, `${currentTemplateName}.js`),
            path.join(dir, `${baseName}.ts`),
            path.join(dir, `${baseName}.js`)
          ];

          const typeName = config.fileAnalysis.dataTypeByKey?.get(key as string);
          const typeMap = config.fileAnalysis.dataPropertyTypesByKey?.get(key as string) || {};

          // If we're on the alias in an each-in block, redirect to the element type of the source list
          let targetPropName = word;
          if (eachCtx && eachCtx.alias === word) {
            targetPropName = eachCtx.source; // Clicking alias navigates to list property definition
          }

          // Helpers to compute line/char from index
          const toLineChar = (content: string, index: number) => {
            const pre = content.slice(0, index);
            const line = (pre.match(/\n/g) || []).length;
            const lastNl = pre.lastIndexOf('\n');
            const character = index - (lastNl + 1);
            return { line, character };
          };

          // Search a specific type/interface block for property
          const findPropInNamedType = (content: string, tName: string): { idx: number } | null => {
            const typeRe = new RegExp(`type\\s+${tName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'g');
            const ifaceRe = new RegExp(`interface\\s+${tName}\\s*\\{([\\s\\S]*?)\\}`, 'g');
            let m = typeRe.exec(content);
            if (!m) {
              m = ifaceRe.exec(content);
            }
            if (m && typeof m.index === 'number') {
              const blockOpenIdx = content.indexOf('{', m.index);
              const block = m[1];
              const propRe = new RegExp(`\\b${targetPropName}\\s*:`);
              const pm = propRe.exec(block);
              if (pm) {
                const idx = blockOpenIdx + 1 + pm.index;
                return { idx };
              }
              return null;
            }
            return null;
          };

          // Search any type/interface block for property
          const findPropInAnyType = (content: string): { idx: number } | null => {
            const anyTypeRe =
              /(type\s+\w+\s*=\s*\{([\s\S]*?)\})|(interface\s+\w+\s*\{([\s\S]*?)\})/g;
            let m;
            while ((m = anyTypeRe.exec(content)) !== null) {
              const group = m[2] || m[4] || '';
              const blockOpenIdx = content.indexOf('{', m.index);
              const propRe = new RegExp(`\\b${targetPropName}\\s*:`);
              const pm = propRe.exec(group);
              if (pm) {
                const idx = blockOpenIdx + 1 + pm.index;
                return { idx };
              }
            }
            return null;
          };

          // Search JSDoc typedef blocks
          const findPropInTypedef = (content: string, tName?: string): { idx: number } | null => {
            const tdRe = /\/\*\*[\s\S]*?@typedef\s+\{Object\}\s+(\w+)[\s\S]*?\*\//g;
            let m;
            while ((m = tdRe.exec(content)) !== null) {
              const foundName = m[1];
              if (tName && foundName !== tName) {
                continue;
              }
              const block = m[0];
              const propRe = new RegExp(`@property\\s+\\{[^}]+\\}\\s+${targetPropName}\\b`);
              const pm = propRe.exec(block);
              if (pm) {
                const idx = (m.index || 0) + pm.index;
                return { idx };
              }
              if (tName) {
                break;
              }
            }
            return null;
          };

          for (const file of possibleFiles) {
            if (!require('fs').existsSync(file)) {
              continue;
            }
            const content = require('fs').readFileSync(file, 'utf8');

            // Prefer navigating directly to the property inside the known type/interface
            if (typeName) {
              const inNamed = findPropInNamedType(content, typeName);
              if (inNamed) {
                const { line, character } = toLineChar(content, inNamed.idx);
                return [
                  {
                    uri: `file://${file}`,
                    range: {
                      start: { line, character },
                      end: { line, character: character + targetPropName.length }
                    }
                  }
                ];
              }

              // Try JSDoc typedef block for the named type
              const inTypedef = findPropInTypedef(content, typeName);
              if (inTypedef) {
                const { line, character } = toLineChar(content, inTypedef.idx);
                return [
                  {
                    uri: `file://${file}`,
                    range: {
                      start: { line, character },
                      end: { line, character: character + targetPropName.length }
                    }
                  }
                ];
              }
            }

            // If we don't know the type, search any type/interface
            const inAny = findPropInAnyType(content) || findPropInTypedef(content);
            if (inAny) {
              const { line, character } = toLineChar(content, inAny.idx);
              return [
                {
                  uri: `file://${file}`,
                  range: {
                    start: { line, character },
                    end: { line, character: character + targetPropName.length }
                  }
                }
              ];
            }

            // As a last resort, if typeName is known, navigate to the type/interface declaration
            if (typeName) {
              const typeDeclRe = new RegExp(
                `(type\\s+${typeName}\\s*=\\s*\\{)|(interface\\s+${typeName}\\s*\\{)`
              );
              const tm = typeDeclRe.exec(content);
              if (tm && typeof tm.index === 'number') {
                const { line, character } = toLineChar(content, tm.index);
                return [
                  {
                    uri: `file://${file}`,
                    range: {
                      start: { line, character },
                      end: { line, character: character + typeName.length }
                    }
                  }
                ];
              }
            }
          }
        } catch (error) {
          connection.console.log(`Error finding data property definition: ${error}`);
        }
      }
    }

    return null;
  };
};

export default onDefinition;
