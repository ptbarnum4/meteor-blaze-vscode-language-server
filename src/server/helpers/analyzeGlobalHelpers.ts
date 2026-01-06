import fsSync from 'fs'; // for existsSync and where sync is needed
import path from 'path';
import {
  AnalyzeGlobalHelpersResult,
  GlobalHelperConfig,
  GlobalHelperInfo,
  LanguageServerSettings
} from '/types';

// Function to extract JSDoc comment from lines above a target line
const extractJSDocComment = (lines: string[], targetLineIndex: number): string | undefined => {
  let jsdocLines: string[] = [];
  let inJSDoc = false;

  // Look backwards from the target line
  for (let i = targetLineIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();

    if (line === '*/') {
      inJSDoc = true;
      continue;
    }

    if (line.startsWith('/**')) {
      if (inJSDoc) {
        // Found the start, reverse and join
        return jsdocLines.reverse().join('\n').trim();
      }
      break;
    }

    if (inJSDoc) {
      if (line.startsWith('*')) {
        const content = line.substring(1).trim();
        if (content) {
          jsdocLines.push(content);
        }
      }
    }

    if (!inJSDoc && line.length > 0) {
      // Found non-empty, non-comment line, stop looking
      break;
    }
  }

  return undefined;
};

// Function to extract JSDoc comment with more flexible search within a range
const extractJSDocCommentInRange = (
  lines: string[],
  startIndex: number,
  endIndex: number
): string | undefined => {
  let jsdocLines: string[] = [];
  let foundJSDocEnd = false;
  let foundJSDocStart = false;

  // Look for JSDoc blocks within the range
  for (let i = endIndex - 1; i >= startIndex; i--) {
    const line = lines[i].trim();

    if (!foundJSDocEnd && line === '*/') {
      foundJSDocEnd = true;
      continue;
    }

    if (foundJSDocEnd && line.startsWith('/**')) {
      foundJSDocStart = true;
      // Found the start, reverse and join
      return jsdocLines.reverse().join('\n').trim();
    }

    if (foundJSDocEnd && !foundJSDocStart) {
      if (line.startsWith('*')) {
        const content = line.substring(1).trim();
        if (content) {
          jsdocLines.push(content);
        }
      }
    }
  }

  return undefined;
};

// Function to find a function declaration and extract its JSDoc and signature info
const findFunctionDeclarationInfo = (
  lines: string[],
  functionName: string
):
  | {
      jsdoc?: string;
      signature?: string;
      parameters?: string;
      returnType?: string;
    }
  | undefined => {
  // Look for function declarations: function functionName(...) or const functionName = (...) =>
  const functionDeclarationPattern1 = new RegExp(`^\\s*function\\s+${functionName}\\s*\\(`);
  const functionDeclarationPattern2 = new RegExp(`^\\s*const\\s+${functionName}\\s*=`);
  const functionDeclarationPattern3 = new RegExp(`^\\s*let\\s+${functionName}\\s*=`);
  const functionDeclarationPattern4 = new RegExp(`^\\s*var\\s+${functionName}\\s*=`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      functionDeclarationPattern1.test(line) ||
      functionDeclarationPattern2.test(line) ||
      functionDeclarationPattern3.test(line) ||
      functionDeclarationPattern4.test(line)
    ) {
      // Found the function declaration, extract JSDoc above it
      const jsdoc = extractJSDocComment(lines, i);

      // Extract function signature and parameters
      let signature = '';
      let parameters = '';
      let returnType = '';

      // Build the full function code by reading multiple lines if needed
      let fullFunctionCode = line;
      let j = i;
      let openParens = 0;
      let foundFunction = false;

      // Continue reading lines until we find the complete function definition
      while (j < lines.length) {
        const currentLine = j === i ? line : lines[j];
        if (j !== i) {
          fullFunctionCode += '\n' + currentLine;
        }

        // Count parentheses to find the complete function
        for (const char of currentLine) {
          if (char === '(') {
            openParens++;
          }
          if (char === ')') {
            openParens--;
          }
        }

        // Look for function patterns
        const arrowFunctionMatch = fullFunctionCode.match(/\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/);
        const regularFunctionMatch = fullFunctionCode.match(
          /function\s+\w+\s*\(([^)]*)\)\s*(?::\s*([^{]+?))?/
        );

        if (arrowFunctionMatch || regularFunctionMatch) {
          const match = arrowFunctionMatch || regularFunctionMatch;
          if (match) {
            parameters = match[1].trim();
            returnType = match[2] ? match[2].trim() : '';
            signature = `${functionName}(${parameters})${returnType ? `: ${returnType}` : ''}`;
            foundFunction = true;
            break;
          }
        }

        // If we've closed all parentheses and found a potential end, break
        if (openParens === 0 && (currentLine.includes(');') || currentLine.includes('})'))) {
          break;
        }

        j++;

        // Safety limit
        if (j - i > 20) {
          break;
        }
      }

      // If we couldn't extract a proper signature, create a basic one
      if (!foundFunction) {
        signature = `${functionName}(...)`;
      }

      return {
        jsdoc,
        signature,
        parameters,
        returnType
      };
    }
  }

  return undefined;
};

// Function to analyze a single file for global helpers
export const analyzeFileForGlobalHelpers = (filePath: string): GlobalHelperInfo[] => {
  const globalHelpers: GlobalHelperInfo[] = [];

  try {
    const content = fsSync.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Look for Template.registerHelper calls - handle both single-line and multi-line patterns
    const registerHelperPattern = /Template\.registerHelper\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.*)/;
    const registerHelperStartPattern = /Template\.registerHelper\s*\(\s*$/;
    // Pattern for function reference: Template.registerHelper('name', functionName)
    const functionReferencePattern =
      /Template\.registerHelper\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)\s*;?$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match = null;
      let helperName = '';
      let helperStart = '';
      let startLine = i;
      let helperNameLine = -1;

      // Check for function reference pattern first: Template.registerHelper('name', functionName)
      const functionRefMatch = functionReferencePattern.exec(line);
      if (functionRefMatch) {
        helperName = functionRefMatch[1];
        const functionName = functionRefMatch[2];

        // Find the function declaration and extract its complete info
        const functionInfo = findFunctionDeclarationInfo(lines, functionName);

        if (functionInfo && functionInfo.jsdoc) {
          globalHelpers.push({
            name: helperName,
            jsdoc: functionInfo.jsdoc,
            signature: functionInfo.signature || `${helperName}(...)`,
            returnType: functionInfo.returnType || '',
            parameters: functionInfo.parameters || '',
            filePath
          });
        }

        continue; // Skip the rest of the processing for this line
      }

      // Regular patterns
      match = registerHelperPattern.exec(line);
      if (match) {
        // Single-line pattern: Template.registerHelper('name', ...)
        helperName = match[1];
        helperStart = match[2];
      } else if (registerHelperStartPattern.test(line)) {
        // Multi-line pattern: Template.registerHelper(\n  'name',\n  ...
        // Look for the helper name on the next lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          const nameMatch = nextLine.match(/^['"`]([^'"`]+)['"`]\s*,?\s*$/);
          if (nameMatch) {
            helperName = nameMatch[1];
            helperNameLine = j;
            // Find the start of the function definition
            for (let k = j + 1; k < Math.min(j + 10, lines.length); k++) {
              const funcLine = lines[k].trim();
              if (
                funcLine.includes('(') ||
                funcLine.includes('=>') ||
                funcLine.includes('function')
              ) {
                helperStart = funcLine;
                startLine = k;
                break;
              }
            }
            break;
          }
        }
      }

      if (helperName) {
        // Extract JSDoc comment - try multiple locations:
        // 1. Above the function definition (for JSDoc above the function argument)
        // 2. Above the Template.registerHelper call (for JSDoc above the whole call)
        let jsdoc = extractJSDocComment(lines, startLine);

        // If no JSDoc found above the function definition, try above the Template.registerHelper call
        if (!jsdoc && startLine !== i) {
          jsdoc = extractJSDocComment(lines, i);
        }

        // For multi-line patterns, if still no JSDoc found, look in the range between helper name and function
        if (!jsdoc && helperNameLine !== -1 && helperNameLine !== startLine) {
          jsdoc = extractJSDocCommentInRange(lines, helperNameLine + 1, startLine);
        }

        // Try to extract function signature and parameters
        let signature = '';
        let parameters = '';
        let returnType = '';

        // Look for function definition - could be arrow function or regular function
        let fullHelperCode = helperStart;
        let j = startLine;
        let openParens = 0;
        let foundFunction = false;

        // Continue reading lines until we find the complete function definition
        while (j < lines.length) {
          const currentLine = j === startLine ? helperStart : lines[j];
          fullHelperCode += j === startLine ? '' : '\n' + currentLine;

          // Count parentheses to find the complete function
          for (const char of currentLine) {
            if (char === '(') {
              openParens++;
            }
            if (char === ')') {
              openParens--;
            }
          }

          // Look for function patterns
          const arrowFunctionMatch = fullHelperCode.match(/\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/);
          const regularFunctionMatch = fullHelperCode.match(
            /function\s*\(([^)]*)\)\s*(?::\s*([^{]+?))?/
          );

          if (arrowFunctionMatch || regularFunctionMatch) {
            const match = arrowFunctionMatch || regularFunctionMatch;
            if (match) {
              parameters = match[1].trim();
              returnType = match[2] ? match[2].trim() : '';
              signature = `${helperName}(${parameters})${returnType ? `: ${returnType}` : ''}`;
              foundFunction = true;
              break;
            }
          }

          // If we've closed all parentheses and found a potential end, break
          if (openParens === 0 && (currentLine.includes(');') || currentLine.includes('})'))) {
            break;
          }

          j++;

          // Safety limit
          if (j - startLine > 20) {
            break;
          }
        }

        // If we couldn't extract a proper signature, create a basic one
        if (!foundFunction) {
          signature = `${helperName}(...)`;
        }

        globalHelpers.push({
          name: helperName,
          jsdoc,
          signature,
          returnType,
          parameters,
          filePath
        });
      }
    }
  } catch (error) {
    console.error(`Error analyzing file for global helpers: ${filePath}`, error);
  }

  return globalHelpers;
};

// Function to scan entire project for global helpers
export const analyzeGlobalHelpers = async (
  projectRoot: string
): Promise<AnalyzeGlobalHelpersResult> => {
  const globalHelpers: GlobalHelperInfo[] = [];
  const helperNames: string[] = [];

  const scanDirectory = (dirPath: string) => {
    try {
      const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and .meteor directories
          if (entry.name !== 'node_modules' && entry.name !== '.meteor') {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // Check TypeScript and JavaScript files
          const ext = path.extname(entry.name);
          if (ext === '.ts' || ext === '.js') {
            const fileHelpers = analyzeFileForGlobalHelpers(fullPath);
            globalHelpers.push(...fileHelpers);

            for (const helper of fileHelpers) {
              if (!helperNames.includes(helper.name)) {
                helperNames.push(helper.name);
              }
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };

  scanDirectory(projectRoot);

  return {
    helpers: helperNames,
    helperDetails: globalHelpers
  };
};

/**
 * Transforms a GlobalHelperConfig object into a GlobalHelperInfo object.
 * Builds rich documentation from the config fields.
 */
export const transformConfigToHelperInfo = (config: GlobalHelperConfig): GlobalHelperInfo => {
  // Build JSDoc documentation
  let markdownParts: string[] = [];

  // Add main documentation
  if (config.doc) {
    markdownParts.push(config.doc);
  }

  // Add parameter documentation
  if (config.params && config.params.length > 0) {
    markdownParts.push(''); // Empty line
    markdownParts.push('**Parameters:**');
    config.params.forEach(param => {
      let paramLine = `- \`${param.name}\``;
      if (param.type) {
        const typeStr = Array.isArray(param.type) ? param.type.join(' | ') : param.type;
        paramLine += ` *(${typeStr})*`;
      }
      if (param.optional) {
        paramLine += ' *(optional)*';
      }
      if (param.default) {
        paramLine += ` - Default: \`${param.default}\``;
      }
      if (param.doc) {
        paramLine += ` - ${param.doc}`;
      }
      markdownParts.push(paramLine);
    });
  }

  // Add return type documentation
  if (config.return) {
    markdownParts.push(''); // Empty line
    let returnLine = '**Returns:**';
    if (config.return.type) {
      returnLine += ` \`${config.return.type}\``;
    }
    if (config.return.doc) {
      returnLine += ` - ${config.return.doc}`;
    }
    markdownParts.push(returnLine);
  }

  // Add examples
  if (config.examples && config.examples.length > 0) {
    markdownParts.push(''); // Empty line
    markdownParts.push('**Examples:**');
    markdownParts.push(''); // Empty line before code block
    config.examples.forEach(example => {
      if (example.html) {
        markdownParts.push('```handlebars');
        markdownParts.push(example.html);
        markdownParts.push('```');
        markdownParts.push(''); // Empty line after code block
      }
    });
  }

  // Build signature
  let signature = config.name;
  if (config.params && config.params.length > 0) {
    const paramNames = config.params
      .map(p => {
        let pName = p.name;
        if (p.optional) {
          pName += '?';
        }
        return pName;
      })
      .join(', ');
    signature += `(${paramNames})`;
  } else {
    signature += '()';
  }

  // Add return type to signature
  if (config.return?.type) {
    signature += `: ${config.return.type}`;
  }

  // Extract parameters string
  const parameters = config.params?.map(p => p.name).join(', ') || '';

  // Extract return type
  const returnType = config.return?.type || '';

  return {
    name: config.name,
    markdown: markdownParts.join('\n'),
    signature,
    returnType,
    parameters,
    filePath: 'settings' // Mark as coming from settings
  };
};

/**
 * Merges configured global helpers with detected helpers.
 * Configured helpers override detected ones with the same name.
 */
export const mergeConfiguredHelpers = (
  detectedHelpers: AnalyzeGlobalHelpersResult,
  settings: LanguageServerSettings
): AnalyzeGlobalHelpersResult => {
  const configuredHelpers: GlobalHelperInfo[] = [];
  const configuredNames: string[] = [];

  // Process globalHelpers.extend (new format with full documentation)
  if (settings.globalHelpers?.extend && Array.isArray(settings.globalHelpers.extend)) {
    try {
      settings.globalHelpers.extend.forEach(config => {
        if (typeof config === 'object' && config !== null && typeof config.name === 'string') {
          const helperInfo = transformConfigToHelperInfo(config as GlobalHelperConfig);
          configuredHelpers.push(helperInfo);
          configuredNames.push(config.name);
        }
      });
    } catch (error) {
      console.error('Error processing globalHelpers.extend:', error);
    }
  }

  // Process legacy blazeHelpers.extend (simple format with name and doc)
  if (settings.blazeHelpers?.extend && Array.isArray(settings.blazeHelpers.extend)) {
    try {
      settings.blazeHelpers.extend.forEach(helper => {
        if (
          typeof helper === 'object' &&
          helper !== null &&
          typeof helper.name === 'string' &&
          !configuredNames.includes(helper.name) // Don't override globalHelpers
        ) {
          configuredHelpers.push({
            name: helper.name,
            markdown: helper.doc || '',
            signature: `${helper.name}()`,
            returnType: '',
            parameters: '',
            filePath: 'settings'
          });
          configuredNames.push(helper.name);
        }
      });
    } catch (error) {
      console.error('Error processing blazeHelpers.extend:', error);
    }
  }

  // Filter out detected helpers that are overridden by configured ones
  const filteredDetectedHelpers = detectedHelpers.helperDetails.filter(
    h => !configuredNames.includes(h.name)
  );
  const filteredDetectedNames = detectedHelpers.helpers.filter(
    h => !configuredNames.includes(h)
  );

  // Merge: configured helpers first, then detected helpers
  return {
    helpers: [...configuredNames, ...filteredDetectedNames],
    helperDetails: [...configuredHelpers, ...filteredDetectedHelpers]
  };
};
