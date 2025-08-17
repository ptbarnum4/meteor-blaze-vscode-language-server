import fsSync from 'fs'; // for existsSync and where sync is needed
import path from 'path';
import { AnalyzeGlobalHelpersResult, GlobalHelperInfo } from '/types';
const fs = fsSync.promises; // where available, read files async

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

// Function to analyze a single file for global helpers
export const analyzeFileForGlobalHelpers = (filePath: string): GlobalHelperInfo[] => {
  const globalHelpers: GlobalHelperInfo[] = [];

  try {
    const content = fsSync.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Look for Template.registerHelper calls - handle both single-line and multi-line patterns
    const registerHelperPattern = /Template\.registerHelper\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.*)/;
    const registerHelperStartPattern = /Template\.registerHelper\s*\(\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match = registerHelperPattern.exec(line);
      let helperName = '';
      let helperStart = '';
      let startLine = i;

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
            // Find the start of the function definition
            for (let k = j + 1; k < Math.min(j + 3, lines.length); k++) {
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
        // Extract JSDoc comment
        const jsdoc = extractJSDocComment(lines, startLine);

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
    } catch (error) {
      // Skip directories we can't read
    }
  };

  scanDirectory(projectRoot);

  return {
    helpers: helperNames,
    helperDetails: globalHelpers
  };
};
