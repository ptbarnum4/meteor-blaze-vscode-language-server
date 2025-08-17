import fs from 'fs';
import path from 'path';

import { Location } from 'vscode-languageserver/node';

import findParameterInTemplateHtml from './findParameterInTemplateHtml';
import { VSCodeServerConnection } from '/types';

// Helper function to find parameter definition in TypeScript file

const findParameterDefinition = async (
  parameterName: string,
  templateName: string,
  currentDir: string,
  connection: VSCodeServerConnection
): Promise<Location[] | null> => {
  try {
    // First, try to find the parameter usage in the HTML template file
    const htmlResult = findParameterInTemplateHtml(
      parameterName,
      templateName,
      currentDir,
      fs,
      path
    );
    if (htmlResult) {
      return htmlResult;
    }

    // If not found in HTML, look for the TypeScript file associated with the template
    const possibleTsPaths = [
      path.join(currentDir, templateName, `${templateName}.ts`),
      path.join(currentDir, templateName, 'index.ts'),
      path.join(currentDir, `${templateName}.ts`),
      // Also check parent directories
      path.join(path.dirname(currentDir), templateName, 'index.ts'),
      path.join(path.dirname(currentDir), templateName, `${templateName}.ts`)
    ];

    for (const tsPath of possibleTsPaths) {
      if (fs.existsSync(tsPath)) {
        const content = fs.readFileSync(tsPath, 'utf8');

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
              const propertyMatch = line.match(new RegExp(`^\\s*(${parameterName})\\s*:`));

              if (propertyMatch) {
                // Calculate position in the full file
                const beforeType = content.substring(0, typeMatch.index);
                const beforeProperty =
                  beforeType +
                  typeMatch[0].substring(0, typeMatch[0].indexOf(typeBody)) +
                  lines.slice(0, i).join('\n') +
                  (i > 0 ? '\n' : '');
                const lineNumber = beforeProperty.split('\n').length - 1;
                const propertyIndex = propertyMatch.index ?? 0;
                const character = propertyIndex + propertyMatch[0].indexOf(parameterName);

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
  } catch (error) {
    console.error(`Error finding parameter definition for ${parameterName}:`, error);
  }

  return null;
};


export default findParameterDefinition;
