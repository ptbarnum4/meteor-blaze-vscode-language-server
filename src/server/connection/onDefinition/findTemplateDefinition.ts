import fs from 'fs';
import path from 'path';
import { Location } from 'vscode-languageserver/node';
import { VSCodeServerConnection } from '/types';

// Helper function to find template definition (template.html file)
const findTemplateDefinition = (
  templateName: string,
  currentDir: string,
  connection: VSCodeServerConnection
): Location[] | null => {
  try {
    // First, try to find the template through import analysis (same approach as hover)
    const associatedFile = findAssociatedJSFileForDefinition(currentDir, fs, path);

    if (associatedFile) {
      // Parse imports to see if this template is imported
      const importedTemplates = parseTemplateImportsForDefinition(associatedFile, fs, path);

      if (importedTemplates.includes(templateName)) {
        // Find the actual template file using import resolution
        const templateInfo = findImportedTemplateFileForDefinition(templateName, associatedFile, fs, path);

        if (templateInfo) {
          const content = fs.readFileSync(templateInfo.file, 'utf8');

          // Find the template tag in the HTML file
          const templateRegex = new RegExp(`<template\\s+name=["']${templateName}["'][^>]*>`);
          const match = templateRegex.exec(content);

          if (match) {
            const lines = content.substring(0, match.index).split('\n');
            const line = lines.length - 1;
            const character = match.index - content.lastIndexOf('\n', match.index) - 1;

            return [
              {
                uri: `file://${templateInfo.file}`,
                range: {
                  start: { line, character },
                  end: { line, character: character + templateName.length }
                }
              }
            ];
          }
        }
      }
    }

    // Fallback: Look for template in common relative locations (original logic)
    const possiblePaths = [
      path.join(currentDir, templateName, 'template.html'),
      path.join(currentDir, templateName, `${templateName}.html`),
      path.join(currentDir, `${templateName}.html`),
      // Also check parent directories
      path.join(path.dirname(currentDir), templateName, 'template.html'),
      path.join(path.dirname(currentDir), templateName, `${templateName}.html`)
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        const content = fs.readFileSync(templatePath, 'utf8');

        // Find the template tag in the HTML file
        const templateRegex = new RegExp(`<template\\s+name=["']${templateName}["'][^>]*>`);
        const match = templateRegex.exec(content);

        if (match) {
          const lines = content.substring(0, match.index).split('\n');
          const line = lines.length - 1;
          const character = match.index - content.lastIndexOf('\n', match.index) - 1;

          return [
            {
              uri: `file://${templatePath}`,
              range: {
                start: { line, character },
                end: { line, character: character + templateName.length }
              }
            }
          ];
        }
      }
    }
  } catch (error) {
    console.error(`Error finding template definition for ${templateName}:`, error);
  }

  return null;
};

// Helper function to find the associated JS/TS file for definition
function findAssociatedJSFileForDefinition(
  currentDir: string,
  fs: any,
  path: any
): string | null {
  const baseName = path.basename(currentDir);
  const possibleExtensions = ['.ts', '.js'];

  // First, try exact base name match
  for (const ext of possibleExtensions) {
    const filePath = path.join(currentDir, baseName + ext);
    try {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    } catch (e) {
      // Continue trying other extensions
    }
  }

  // If no exact match, look for any JS/TS files in the same directory
  try {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (possibleExtensions.includes(ext)) {
        const fullPath = path.join(currentDir, file);
        // Check if this file imports template.html
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Look for imports of template.html or similar patterns
          const templateImportPattern = new RegExp(
            `import\\s+['"]\\./${baseName}(?:\\.html)?['"]`,
            'g'
          );
          if (templateImportPattern.test(content)) {
            return fullPath;
          }
        } catch (e) {
          // Continue checking other files
        }
      }
    }

    // If still no match, return the first JS/TS file found (fallback)
    for (const file of files) {
      const ext = path.extname(file);
      if (possibleExtensions.includes(ext)) {
        return path.join(currentDir, file);
      }
    }
  } catch (e) {
    // Directory read failed, continue with null
  }

  return null;
}

// Helper function to parse template imports for definition
function parseTemplateImportsForDefinition(filePath: string, fs: any, path: any): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const templates: string[] = [];

    // Find tsconfig.json for this Meteor project (same as hover)
    const tsconfig = findTsConfigForMeteorProject(path.dirname(filePath), fs, path);

    // Find all import statements (both named and unnamed, including absolute paths)
    const importPattern = /import\s+(?:[^'"]*\s+from\s+)?['"]((?:\.\.?\/|\/)[^'"]*)['"]/g;

    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      let fullImportPath;
      if (importPath.startsWith('/')) {
        // Absolute import - try TypeScript path resolution first
        if (tsconfig) {
          // Find project root (directory containing .meteor)
          let currentDir = path.dirname(filePath);
          let projectRoot = currentDir;

          while (currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, '.meteor'))) {
              projectRoot = currentDir;
              break;
            }
            currentDir = path.dirname(currentDir);
          }

          // Try TypeScript path resolution
          const tsResolvedPath = resolveTsPath(importPath, tsconfig, projectRoot, path);

          if (tsResolvedPath) {
            fullImportPath = tsResolvedPath;
          } else {
            // Fallback to simple resolution
            fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
          }
        } else {
          // No tsconfig, use simple resolution
          // Find the project root by looking for package.json
          let currentDir = path.dirname(filePath);
          let projectRoot = currentDir;

          while (currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
              projectRoot = currentDir;
              break;
            }
            currentDir = path.dirname(currentDir);
          }

          fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
        }
      } else {
        // Relative import
        fullImportPath = path.resolve(path.dirname(filePath), importPath);
      }

      // Try different file extensions for the imported file
      const possibleExtensions = ['.ts', '.js', ''];
      let importedFileContent = null;
      let actualImportPath = null;

      for (const ext of possibleExtensions) {
        const testPath = fullImportPath + ext;
        if (fs.existsSync(testPath)) {
          try {
            importedFileContent = fs.readFileSync(testPath, 'utf8');
            actualImportPath = testPath;
            break;
          } catch (e) {
            // Continue trying other extensions
          }
        }
      }

      // If we found the imported file, look for Template.templateName patterns
      if (importedFileContent && actualImportPath) {
        // Match Template.templateName patterns
        const templatePattern = /Template\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let templateMatch;

        while ((templateMatch = templatePattern.exec(importedFileContent)) !== null) {
          const templateName = templateMatch[1];
          if (!templates.includes(templateName)) {
            templates.push(templateName);
          }
        }

        // Also check if this is a direct template import pattern
        // like './templateName' where templateName directory has template.html
        const pathParts = importPath.split('/');
        const templateName = pathParts[pathParts.length - 1];

        if (templateName && !templates.includes(templateName)) {
          const templateHtmlPath = path.join(fullImportPath, 'template.html');
          if (fs.existsSync(templateHtmlPath)) {
            try {
              const templateHtml = fs.readFileSync(templateHtmlPath, 'utf8');
              const templateDefPattern = new RegExp(`<template\\s+name=["']${templateName}["']`, 'i');
              if (templateDefPattern.test(templateHtml)) {
                templates.push(templateName);
              }
            } catch (e) {
              // Continue
            }
          }
        }
      }
    }

    return templates;
  } catch (error) {
    console.error(`Error parsing template imports for definition from ${filePath}:`, error);
    return [];
  }
}

// Helper function to find the imported template file for definition
function findImportedTemplateFileForDefinition(
  templateName: string,
  associatedFile: string,
  fs: any,
  path: any
): { file: string; content: string } | null {
  try {
    const content = fs.readFileSync(associatedFile, 'utf8');
    const associatedDir = path.dirname(associatedFile);

    // Find the import path for this template - including absolute imports
    const importPattern = new RegExp(
      `import\\s+['"](\\.\\.[^'"]*\\/${templateName}|\\.\\/${templateName}[^'"]*|\\/[^'"]*\\/${templateName}[^'"]*)['"]`,
      'g'
    );

    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      let fullImportPath;

      if (importPath.startsWith('/')) {
        // Absolute import - find project root
        let currentDir = associatedDir;
        let projectRoot = currentDir;

        while (currentDir !== path.dirname(currentDir)) {
          if (fs.existsSync(path.join(currentDir, '.meteor')) ||
              fs.existsSync(path.join(currentDir, 'package.json'))) {
            projectRoot = currentDir;
            break;
          }
          currentDir = path.dirname(currentDir);
        }

        fullImportPath = path.join(projectRoot, importPath.substring(1)); // Remove leading /
      } else {
        // Relative import
        fullImportPath = path.resolve(associatedDir, importPath);
      }

      // Try to find template.html in the import directory
      let templateHtmlPath;

      // For imports like './nestedTemplate/nestedTemplate' or '/imports/ui/template2/nestedTemplate2/nestedTemplate2'
      // the template.html is in the nestedTemplate or nestedTemplate2 directory
      const importDir = path.dirname(fullImportPath);
      templateHtmlPath = path.join(importDir, 'template.html');

      try {
        if (fs.existsSync(templateHtmlPath)) {
          const templateContent = fs.readFileSync(templateHtmlPath, 'utf8');
          const templatePattern = new RegExp(
            `<template\\s+name=["']${templateName}["'][^>]*>([\\s\\S]*?)<\\/template>`,
            'g'
          );
          const templateMatch = templatePattern.exec(templateContent);
          if (templateMatch) {
            return { file: templateHtmlPath, content: templateMatch[1].trim() };
          }
        }
      } catch (e) {
        // Continue trying other import paths
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding imported template file for definition for ${templateName}:`, error);
    return null;
  }
}

// Helper function to find tsconfig.json in the same directory as .meteor (for definition)
function findTsConfigForMeteorProject(startPath: string, fs: any, path: any): any {
  let currentDir = startPath;

  // Walk up the directory tree to find .meteor directory
  while (currentDir !== path.dirname(currentDir)) {
    const meteorDir = path.join(currentDir, '.meteor');
    if (fs.existsSync(meteorDir)) {
      // Found .meteor directory, look for tsconfig.json in the same directory
      const tsconfigPath = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');

          // Try parsing as-is first (in case it's valid JSON without comments)
          try {
            return JSON.parse(tsconfigContent);
          } catch (e) {
            // If that fails, try safer comment removal
            const cleanContent = safelyRemoveJsonComments(tsconfigContent);
            return JSON.parse(cleanContent);
          }
        } catch (e) {
          console.error('Error parsing tsconfig.json:', e);
          console.error('File path:', tsconfigPath);
          return null;
        }
      }
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Safely remove comments from JSON content (for definition)
function safelyRemoveJsonComments(content: string): string {
  const result: string[] = [];
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : '';

    // Handle block comments
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i += 2; // Skip the */
        continue;
      }
      i++;
      continue;
    }

    // Handle line comments
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result.push(char); // Keep the newline
      }
      i++;
      continue;
    }

    // Handle strings (don't process comments inside strings)
    if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
      inString = !inString;
      result.push(char);
      i++;
      continue;
    }

    // Look for comment starts only outside strings
    if (!inString) {
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i += 2;
        continue;
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }

    result.push(char);
    i++;
  }

  return result.join('');
}

// TypeScript path resolution function (for definition)
function resolveTsPath(importPath: string, tsconfig: any, projectRoot: string, path: any): string | null {
  if (!tsconfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = '.', paths } = tsconfig.compilerOptions;
  const basePath = path.resolve(projectRoot, baseUrl);

  // Try to match the import path against tsconfig paths
  for (const [pattern, mappings] of Object.entries(paths) as [string, string[]][]) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '([^/]*)')  // Replace * with capture group
      .replace(/\//g, '\\/');     // Escape forward slashes

    const regex = new RegExp(`^${regexPattern}$`);
    const match = importPath.match(regex);

    if (match) {
      // Try each mapping
      for (const mapping of mappings) {
        let resolvedPath = mapping;

        // Replace captured groups in mapping
        for (let i = 1; i < match.length; i++) {
          resolvedPath = resolvedPath.replace('*', match[i]);
        }

        const fullPath = path.resolve(basePath, resolvedPath);
        return fullPath;
      }
    }
  }

  return null;
}

export default findTemplateDefinition;
