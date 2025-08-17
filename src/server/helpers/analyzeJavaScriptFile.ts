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

export const analyzeJavaScriptFile = (filePath: string): AnalyzeJavaScriptFileResult => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const helpers: string[] = [];
    const helperDetails: HelperInfo[] = [];
    let extractedTemplateName: string | undefined;

    const parseMethodBlocks = (content: string): MethodBlock[] => {
      const methods: MethodBlock[] = [];

      // Comprehensive list of JavaScript keywords and control flow statements to exclude
      const jsKeywords = [
        'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
        'function', 'return', 'var', 'let', 'const', 'try', 'catch', 'finally', 'throw',
        'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'class', 'extends', 'super',
        'this', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
        'async', 'await', 'yield', 'import', 'export', 'from', 'as', 'with'
      ];

      // Enhanced regex patterns for different method definitions (optimized for helpers content)
      const patterns = [
        // Standard method with JSDoc: /** ... */ methodName(params) { ... }
        /\/\*\*([\s\S]*?)\*\/\s*(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*\{/g,
        // Arrow function with JSDoc: /** ... */ methodName: (params) => { ... }
        /\/\*\*([\s\S]*?)\*\/\s*(\w+)\s*:\s*\(([^)]*)\)\s*=>\s*\{/g,
        // Function property with JSDoc: /** ... */ methodName: function(params) { ... }
        /\/\*\*([\s\S]*?)\*\/\s*(\w+)\s*:\s*function\s*\(([^)]*)\)\s*\{/g,
        // Standard method without JSDoc: methodName(params) { ... }
        /(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*\{/g,
        // Arrow function without JSDoc: methodName: (params) => { ... }
        /(\w+)\s*:\s*\(([^)]*)\)\s*=>\s*\{/g,
        // Function property without JSDoc: methodName: function(params) { ... }
        /(\w+)\s*:\s*function\s*\(([^)]*)\)\s*\{/g
      ];

      patterns.forEach((pattern, index) => {
        // Reset the regex lastIndex to avoid state issues
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          let methodName: string;
          let jsdoc: string | undefined;
          let parameters: string;
          let returnType: string | undefined;

          if (index < 3) {
            // Patterns with JSDoc
            jsdoc = match[1];
            methodName = match[2];
            parameters = match[3];
            returnType = match[4];
          } else {
            // Patterns without JSDoc
            methodName = match[1];
            parameters = match[2];
            returnType = match[3];
          }

          // Skip JavaScript keywords and control flow statements
          if (jsKeywords.includes(methodName)) {
            continue;
          }

          // Skip if we already found this method (prefer JSDoc version)
          if (methods.some(m => m.name === methodName)) {
            continue;
          }

          // For helpers content, we don't need complex object literal validation
          // since we already extracted the content from inside Template.helpers({...})

          const signature = `${methodName}(${parameters || ''})${returnType ? `: ${returnType.trim()}` : ''}`;

          methods.push({
            name: methodName,
            jsdoc: jsdoc?.trim(),
            signature,
            returnType: returnType?.trim(),
            parameters: parameters?.trim()
          });
        }
      });

      return methods;
    };

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
              // Extract description from JSDoc - capture text before any @tag
              const descMatch = jsdoc.match(/^\s*\*?\s*([\s\S]*?)\s*(?=@|$)/);
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

        // Same JavaScript keywords list for fallback patterns
        const jsKeywords = [
          'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
          'function', 'return', 'var', 'let', 'const', 'try', 'catch', 'finally', 'throw',
          'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'class', 'extends', 'super',
          'this', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
          'async', 'await', 'yield', 'import', 'export', 'from', 'as', 'with'
        ];

        simplePatterns.forEach(pattern => {
          let helperMatch;
          while ((helperMatch = pattern.exec(helpersContent)) !== null) {
            const helperName = helperMatch[1];

            // Skip JavaScript keywords and control flow statements
            if (jsKeywords.includes(helperName)) {
              continue;
            }

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
