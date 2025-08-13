import fs from 'fs';

import { HelperInfo } from '/types';

type MethodBlock = {
  name: string;
  jsdoc?: string;
  signature: string;
  returnType?: string;
  parameters?: string;
};

type AnalyzeJavaScriptFileResult = {
  helpers: string[];
  helperDetails: HelperInfo[];
  templateName?: string;
};

const parseMethodBlocks = (helpersContent: string): MethodBlock[] => {
  const blocks: MethodBlock[] = [];

  // Split by method boundaries - look for JSDoc comments followed by method definitions
  const methodPattern = /(\/\*\*[\s\S]*?\*\/\s*)?(\w+)\s*(\([^)]*\))\s*(?::\s*([^{]*))?\s*\{/g;

  let match;
  while ((match = methodPattern.exec(helpersContent)) !== null) {
    const jsdoc = match[1];
    const name = match[2];
    const params = match[3];
    const returnType = match[4];

    // Skip if this looks like an if statement or other control flow
    if (name === 'if' || name === 'for' || name === 'while' || name === 'switch') {
      continue;
    }

    blocks.push({
      name,
      jsdoc: jsdoc?.trim(),
      signature: `${name}${params}${returnType ? `: ${returnType.trim()}` : ''}`,
      returnType: returnType?.trim(),
      parameters: params.slice(1, -1) // Remove parentheses
    });
  }

  return blocks;
};

export const analyzeJavaScriptFile = (filePath: string): AnalyzeJavaScriptFileResult => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const helpers: string[] = [];
    const helperDetails: HelperInfo[] = [];
    let extractedTemplateName: string | undefined;

    // Find Template.name.helpers() calls with proper brace matching
    const templateHelperPattern = /Template\.(\w+)\.helpers\s*\(\s*\{/g;
    let match;

    while ((match = templateHelperPattern.exec(content)) !== null) {
      // Extract the template name from Template.templateName.helpers
      const templateNameFromCode = match[1];
      if (!extractedTemplateName) {
        extractedTemplateName = templateNameFromCode;
      }

      const startIndex = match.index + match[0].length - 1; // Start at the opening brace
      let braceCount = 1;
      let endIndex = startIndex + 1;

      // Find the matching closing brace
      while (endIndex < content.length && braceCount > 0) {
        if (content[endIndex] === '{') {
          braceCount++;
        } else if (content[endIndex] === '}') {
          braceCount--;
        }
        endIndex++;
      }

      if (braceCount === 0) {
        // Extract the content between braces
        const helpersContent = content.substring(startIndex + 1, endIndex - 1);

        // Extract helper function names and details with enhanced parsing
        const methodBlocks = parseMethodBlocks(helpersContent);

        methodBlocks.forEach((block: MethodBlock) => {
          const { name, jsdoc, signature, returnType, parameters } = block;

          if (!helpers.includes(name)) {
            helpers.push(name);

            let parsedJSDoc = '';
            let extractedReturnType = returnType;
            let extractedParameters = parameters;

            if (jsdoc) {
              // Extract description from JSDoc
              const descMatch = jsdoc.match(/\/\*\*\s*([\s\S]*?)\s*(?:@|\*\/)/);
              if (descMatch) {
                parsedJSDoc = descMatch[1].replace(/\s*\*\s?/g, ' ').trim();
              }

              // Extract @returns tag
              const returnsMatch = jsdoc.match(/@returns?\s+\{([^}]+)\}\s*([^@*]*)/);
              if (returnsMatch && !extractedReturnType) {
                extractedReturnType = returnsMatch[1];
                if (returnsMatch[2].trim()) {
                  parsedJSDoc += (parsedJSDoc ? ' ' : '') + `Returns: ${returnsMatch[2].trim()}`;
                }
              }

              // Extract @param tags
              const paramMatches = jsdoc.matchAll(/@param\s+\{([^}]+)\}\s+(\w+)\s*([^@*]*)/g);
              const paramDescriptions: string[] = [];
              for (const paramMatch of paramMatches) {
                const paramType = paramMatch[1];
                const paramName = paramMatch[2];
                const paramDesc = paramMatch[3].trim();
                paramDescriptions.push(
                  `${paramName}: ${paramType}${paramDesc ? ` - ${paramDesc}` : ''}`
                );
              }
              if (paramDescriptions.length > 0) {
                extractedParameters = paramDescriptions.join(', ');
              }
            }

            const helperInfo: HelperInfo = {
              name,
              jsdoc: parsedJSDoc || undefined,
              returnType: extractedReturnType?.trim() || undefined,
              parameters: extractedParameters?.trim() || undefined,
              signature: `${name}(${extractedParameters || ''})${
                extractedReturnType ? `: ${extractedReturnType}` : ''
              }`
            };

            helperDetails.push(helperInfo);
          }
        });

        // Fallback: simple patterns for helpers without JSDoc
        const simplePatterns = [
          /(\w+)\s*\([^)]*\)\s*\{/g,
          /(\w+)\s*:\s*function\s*\([^)]*\)\s*\{/g,
          /(\w+)\s*:\s*\([^)]*\)\s*=>\s*[\{\.]/g,
          /(\w+)\s*:\s*\w+\s*=>\s*[\{\.]/g
        ];

        simplePatterns.forEach(pattern => {
          let helperMatch;
          while ((helperMatch = pattern.exec(helpersContent)) !== null) {
            const helperName = helperMatch[1];
            if (!helpers.includes(helperName)) {
              helpers.push(helperName);
              helperDetails.push({
                name: helperName,
                signature: `${helperName}()`
              });
            }
          }
        });
      }
    }

    return { helpers, helperDetails, templateName: extractedTemplateName };
  } catch (error) {
    console.error(`Error analyzing JavaScript/TypeScript file ${filePath}:`, error);
    return { helpers: [], helperDetails: [] };
  }
};
