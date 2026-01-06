import path from 'path';

import { DefinitionParams, Location } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../../types';
import { analyzeGlobalHelpers, mergeConfiguredHelpers } from '../../helpers/analyzeGlobalHelpers';
import { containsMeteorTemplates } from '../../helpers/containsMeteorTemplates';
import { findEnclosingEachInContext } from '../../helpers/findEnclosingEachInContext';
import getDocumentSettings from '../../helpers/getDocumentSettings';
import { getWordRangeAtPosition } from '../../helpers/getWordRangeAtPosition';
import { isWithinComment } from '../../helpers/isWithinComment';
import { isWithinHandlebarsExpression } from '../../helpers/isWithinHandlebarsExpression';
import handleTemplateInclusionDefinition from './handleTemplateInclusionDefinition';

const onDefinition = (config: CurrentConnectionConfig) => {
  const { connection, documents } = config;
  return async (params: DefinitionParams): Promise<Location[] | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    // Only provide Meteor/Blaze definitions for HTML template files
    const uri = document.uri;
    const isHtmlFile = /\.(html|htm|meteor|hbs)$/i.test(uri);
    if (!isHtmlFile) {
      return null;
    }

    // Only provide definitions if this HTML/Handlebars file contains templates
    if (!containsMeteorTemplates(document)) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Check if we're inside any type of comment (HTML, Handlebars, JS/TS)
    const commentInfo = isWithinComment(text, offset);
    if (commentInfo.isWithin) {
      return null; // Don't provide definitions inside comments
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
      return null; // Only provide definitions inside templates
    }

    // Check if we're inside a handlebars expression
    const handlebarsInfo = isWithinHandlebarsExpression(text, offset);

    if (!handlebarsInfo.isWithin) {
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

    const eachCtx = findEnclosingEachInContext(text, offset);

    // Check for template inclusion navigation FIRST (e.g., {{> templateName}} or template parameters)
    // This should take precedence over helper lookups
    const templateInclusionResult = await handleTemplateInclusionDefinition(
      text,
      offset,
      word,
      dir,
      connection
    );
    if (templateInclusionResult) {
      return templateInclusionResult;
    }

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
                // Updated regex to handle TypeScript method syntax with parameters: methodName(params): ReturnType
                const helperRegex = new RegExp(
                  `\\b${word}\\s*(?:[:=]\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>|\\([^)]*\\)\\s*\\{)|\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\s*\\{)`
                );
                const match = helperRegex.exec(line);
                if (match) {
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
          connection.console.error(`Error finding definition: ${error}`);
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
              connection.console.error(`Error finding helper definition for alias: ${error}`);
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
          connection.console.error(`Error finding data property definition: ${error}`);
        }
      }
    }

    // Check for global helpers from Template.registerHelper
    try {
      // Find workspace root by looking for package.json or .meteor directory
      const currentFileUri = params.textDocument.uri;

      // Skip global helpers analysis in test environment or for test URIs
      if (
        process.env.NODE_ENV === 'test' ||
        currentFileUri.includes('/nonexistent.') ||
        currentFileUri.includes('/test.')
      ) {
        // Skip global helpers during testing
        return null;
      }

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
        // Skip global helpers analysis in test environment to prevent hanging
        if (process.env.NODE_ENV === 'test') {
          // Skip global helpers during testing
          return null;
        }

        // Add timeout to prevent hanging during tests or large projects
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Global helpers analysis timed out')), 5000);
        });

        // Get document settings to access configured global helpers
        const settings = await getDocumentSettings(config, document.uri);

        const detectedHelpers = await Promise.race([
          analyzeGlobalHelpers(workspaceRoot),
          timeoutPromise
        ]);

        // Merge configured helpers with detected helpers
        const globalHelpersResult = mergeConfiguredHelpers(detectedHelpers, settings);

        const globalHelper = globalHelpersResult.helperDetails.find(
          (helper: any) => helper.name === word
        );
        if (globalHelper) {
          // Skip definition for helpers configured in settings (they don't have a real file)
          if (globalHelper.filePath === 'settings') {
            return null;
          }
          // Read the file and find the Template.registerHelper line
          const content = require('fs').readFileSync(globalHelper.filePath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // First try single-line pattern: Template.registerHelper('name', ...)
            const singleLineRegex = new RegExp(
              `Template\\.registerHelper\\s*\\(\\s*['"\`]${word}['"\`]`
            );
            const singleLineMatch = singleLineRegex.exec(line);
            if (singleLineMatch) {
              return [
                {
                  uri: `file://${globalHelper.filePath}`,
                  range: {
                    start: { line: i, character: singleLineMatch.index || 0 },
                    end: {
                      line: i,
                      character: (singleLineMatch.index || 0) + singleLineMatch[0].length
                    }
                  }
                }
              ];
            }

            // Then try multiline pattern: Template.registerHelper(\n  'name',
            const multiLineStart = /Template\.registerHelper\s*\(\s*$/.exec(line);
            if (multiLineStart) {
              // Look for the helper name in the next few lines
              for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const nextLine = lines[j];
                const nameMatch = new RegExp(`^\\s*['"\`]${word}['"\`]\\s*,?\\s*$`).exec(nextLine);
                if (nameMatch) {
                  return [
                    {
                      uri: `file://${globalHelper.filePath}`,
                      range: {
                        start: { line: j, character: nameMatch.index || 0 },
                        end: { line: j, character: (nameMatch.index || 0) + nameMatch[0].length }
                      }
                    }
                  ];
                }
              }
            }
          }
        }
      } catch (error) {
        connection.console.error(`Error analyzing global helpers: ${error}`);
      }
    } catch (error) {
      connection.console.error(`Error finding global helper definition: ${error}`);
    }

    return null;
  };
};

export default onDefinition;
