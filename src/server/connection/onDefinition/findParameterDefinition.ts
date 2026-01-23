import fs from 'fs';
import path from 'path';

import { Location } from 'vscode-languageserver/node';

import { CurrentConnectionConfig } from '../../../types';
import findParameterInTemplateHtml from './findParameterInTemplateHtml';
import findTemplateDefinition from './findTemplateDefinition';
import { VSCodeServerConnection } from '/types';

// Helper function to find parameter definition in TypeScript file

const findParameterDefinition = async (
  parameterName: string,
  templateName: string,
  currentDir: string,
  currentFileUri: string,
  connection: VSCodeServerConnection,
  config: CurrentConnectionConfig
): Promise<Location[] | null> => {
  try {
    // First, try to find the parameter usage in the HTML template file
    const htmlResult = findParameterInTemplateHtml(
      parameterName,
      templateName,
      currentDir,
      currentFileUri,
      fs,
      path
    );
    if (htmlResult) {
      return htmlResult;
    }

    // Use the fileAnalysis data to find where the child template's data is defined
    // The fileAnalysis.dataProperties Map has keys like "/path/to/dir/templateName"
    let childTemplateDataFile: string | null = null;

    // Search through all analyzed files for the child template's data properties
    for (const [key, dataProps] of config.fileAnalysis.dataProperties?.entries() || []) {
      // Check if this key is for the child template we're looking for
      if (key.endsWith(`/${templateName}`)) {
        // Check if this template has our parameter
        if (dataProps.includes(parameterName)) {
          // Extract the directory from the key
          const keyDir = key.substring(0, key.lastIndexOf('/'));
          childTemplateDataFile = keyDir;
          break;
        }
      }
    }

    // Find where the child template HTML is defined
    const childTemplateLocation = findTemplateDefinition(templateName, currentDir, connection, currentFileUri);
    let childTemplateDir = currentDir;
    let childTemplateFile: string | null = null;

    if (childTemplateLocation && childTemplateLocation.length > 0) {
      const childTemplatePath = childTemplateLocation[0].uri.replace('file://', '');
      childTemplateDir = path.dirname(childTemplatePath);
      childTemplateFile = childTemplatePath;
    }

    // If we found the data file through analysis, use that directory
    if (childTemplateDataFile) {
      childTemplateDir = childTemplateDataFile;
    }

    // If not found in HTML, look for the TypeScript file associated with the CHILD template
    const possibleTsPaths = [
      // Check child template's own directory first
      path.join(childTemplateDir, templateName, `${templateName}.ts`),
      path.join(childTemplateDir, templateName, 'index.ts'),
      path.join(childTemplateDir, `${templateName}.ts`),
      // Check for a TypeScript file with the same base name as the HTML file
      ...(childTemplateFile ? [
        childTemplateFile.replace(/\.(html|htm)$/, '.ts'),
        childTemplateFile.replace(/\.(html|htm)$/, '.js'),
        path.join(path.dirname(childTemplateFile), 'index.ts'),
        path.join(path.dirname(childTemplateFile), 'index.js')
      ] : []),
      // Also search all TypeScript files in the directory
      ...fs.readdirSync(childTemplateDir)
        .filter((file: string) => /\.(ts|js)$/.test(file))
        .map((file: string) => path.join(childTemplateDir, file))
    ];

    // Remove duplicates
    const uniquePaths = [...new Set(possibleTsPaths)];

    for (const tsPath of uniquePaths) {
      if (fs.existsSync(tsPath)) {
        const content = fs.readFileSync(tsPath, 'utf8');

        // CRITICAL: Verify this file actually defines the CHILD template
        // Look for Template.templateName (e.g., Template.myComponent.onCreated, .helpers, etc.)
        const childTemplatePattern = new RegExp(
          `Template\\.${templateName}\\.(onCreated|onRendered|onDestroyed|helpers|events)`,
          'i'
        );

        // Skip this file if it doesn't define the child template
        if (!childTemplatePattern.test(content)) {
          continue;
        }

        // First, try to find TemplateStaticTyped and extract the data type (2nd generic argument)
        const pascalTemplateName = templateName.charAt(0).toUpperCase() + templateName.slice(1);
        const camelTemplateName = templateName.charAt(0).toLowerCase() + templateName.slice(1);

        // Look for TemplateStaticTyped<'templateName', DataType, ...>
        // This ensures we're looking at the CHILD template's type definition
        const templateStaticPattern = new RegExp(
          `type\\s+[a-zA-Z0-9_]+\\s*=\\s*TemplateStaticTyped<\\s*['"]${templateName}['"]\\s*,\\s*([a-zA-Z0-9_]+)`,
          'i'
        );
        const templateStaticMatch = content.match(templateStaticPattern);

        const typeNames = [];
        if (templateStaticMatch) {
          // Found TemplateStaticTyped, use the data type from the second generic argument
          typeNames.push(templateStaticMatch[1]);
        }

        // Also check common naming patterns
        typeNames.push(
          `${pascalTemplateName}Data`,
          `${templateName}Data`,
          `${camelTemplateName}Data`,
          `${pascalTemplateName}TemplateData`,
          `${templateName}TemplateData`,
          `${camelTemplateName}TemplateData`
        );

        for (const typeName of typeNames) {
          const typePattern = new RegExp(
            `type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`,
            'i'
          );
          const typeMatch = content.match(typePattern);

          if (typeMatch) {
            const typeBody = typeMatch[1];

            // Search for the property directly in the full file content
            // This is more reliable than trying to calculate positions
            const escapedParamName = parameterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const propertyInFileRegex = new RegExp(
              `\\n(\\s*)(${escapedParamName})\\??\\s*:`,
              'g'
            );

            // Search starting from where the type definition begins
            const searchStart = typeMatch.index! + typeMatch[0].indexOf(typeBody);
            const searchEnd = searchStart + typeBody.length;
            const searchableContent = content.substring(0, searchEnd);

            let match;
            propertyInFileRegex.lastIndex = searchStart;

            while ((match = propertyInFileRegex.exec(searchableContent)) !== null) {
              // Make sure this match is within our type body
              if (match.index >= searchStart && match.index < searchEnd) {
                const propertyPosition = match.index + match[1].length + 1; // +1 for the \n
                const beforeProperty = content.substring(0, propertyPosition);
                const lines = beforeProperty.split('\n');
                const lineNumber = lines.length - 1;
                const character = lines[lines.length - 1].length;

                return [
                  {
                    uri: `file://${tsPath}`,
                    range: {
                      start: { line: lineNumber, character },
                      end: { line: lineNumber, character: character + parameterName.length }
                    }
                  }
                ];
              }
            }
          }
        }

        // Also check for helper functions
        const helpersPattern = new RegExp(
          `Template\\.${templateName}\\.helpers\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
          'i'
        );
        const helpersMatch = content.match(helpersPattern);

        if (helpersMatch) {
          const helpersBody = helpersMatch[1];
          const helperRegex = new RegExp(
            `(${parameterName})\\s*\\([^)]*\\)\\s*:?\\s*[^{]*\\{`,
            'g'
          );
          const helperMatch = helperRegex.exec(helpersBody);

          if (helperMatch) {
            const beforeHelpers = content.substring(0, helpersMatch.index);
            const beforeHelper =
              beforeHelpers +
              helpersMatch[0].substring(0, helpersMatch[0].indexOf(helpersBody)) +
              helpersBody.substring(0, helperMatch.index);
            const lineNumber = beforeHelper.split('\n').length - 1;
            const character = helperMatch.index + helperMatch[0].indexOf(parameterName);

            return [
              {
                uri: `file://${tsPath}`,
                range: {
                  start: { line: lineNumber, character },
                  end: { line: lineNumber, character: character + parameterName.length }
                }
              }
            ];
          }
        }
      }
    }

    // If we still haven't found anything, try HTML search again as a final fallback
    // This ensures we always check HTML even if TypeScript search failed
    const htmlFallbackResult = findParameterInTemplateHtml(
      parameterName,
      templateName,
      currentDir,
      currentFileUri,
      fs,
      path
    );
    if (htmlFallbackResult) {
      return htmlFallbackResult;
    }
  } catch (error) {
    console.error(`Error finding parameter definition for ${parameterName}:`, error);
  }

  return null;
};

export default findParameterDefinition;
